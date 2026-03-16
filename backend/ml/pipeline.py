"""
pipeline.py
-----------
Master orchestrator for the full dermoscopy analysis pipeline.
Called by the FastAPI inference endpoint with one image.

Pipeline steps:
  1. Segmentation (ResNetUNetV4 + TTA + largest-blob cleaning)
  2. Feature extraction (ABCDE + texture + radiomics ~150 features)
  3. Classification (XGBoost / LightGBM / best sklearn model)
  4. Biopsy escalation decision
  5. Bundle everything into a PipelineResult

Public API:
    pipeline = DermoscopyPipeline.from_config(config)
    result   = pipeline.run(img_bgr_numpy)

The pipeline is designed to be loaded ONCE at FastAPI startup via
the application lifespan context, then reused for every request.
"""

from __future__ import annotations

import base64
import io
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from ml.segmentation import SegmentationModel, SegResult
from ml.feature_extraction import extract_features
from ml.classifier import ClassifierModel, ClassResult, should_escalate_to_biopsy

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result dataclass — this is what the FastAPI endpoint serialises to JSON
# ---------------------------------------------------------------------------

@dataclass
class PipelineResult:
    # ── Classification
    prediction:          str              # "melanoma" | "nevi" | "seborrheic_keratosis"
    confidence:          dict[str, float] # e.g. {"melanoma": 0.87, "nevi": 0.09, ...}
    top_class_score:     float

    # ── Biopsy
    biopsy_recommended:  bool
    biopsy_reason:       str

    # ── Segmentation images (base64 PNG strings)
    mask_b64:            str = field(repr=False)
    overlay_b64:         str = field(repr=False)

    # ── Features (the ~150 float values shown in the report)
    features:            dict[str, float] = field(default_factory=dict)

    # ── Metadata
    inference_time_ms:   float = 0.0
    segmentation_ok:     bool  = True   # False if mask is empty
    classifier_ok:       bool  = True   # False if classifier not available

    def to_api_dict(self) -> dict[str, Any]:
        """Serialise to a JSON-safe dict for the API response."""
        return {
            "prediction":         self.prediction,
            "confidence":         self.confidence,
            "top_class_score":    round(self.top_class_score, 4),
            "biopsy_recommended": self.biopsy_recommended,
            "biopsy_reason":      self.biopsy_reason,
            "mask_b64":           self.mask_b64,
            "overlay_b64":        self.overlay_b64,
            "features":           {k: round(v, 6) for k, v in self.features.items()},
            "inference_time_ms":  round(self.inference_time_ms, 1),
            "segmentation_ok":    self.segmentation_ok,
            "classifier_ok":      self.classifier_ok,
        }


# ---------------------------------------------------------------------------
# Fallback result when classifier is unavailable
# ---------------------------------------------------------------------------

def _classifier_unavailable_result(seg: SegResult,
                                    features: dict[str, float],
                                    elapsed_ms: float) -> PipelineResult:
    """
    Returns a partial result with segmentation + features but no class prediction.
    Used when the classifier .joblib file has not been saved yet.
    """
    log.warning("Classifier unavailable — returning segmentation-only result.")
    return PipelineResult(
        prediction         = "unknown",
        confidence         = {"melanoma": 0.0, "nevi": 0.0, "seborrheic_keratosis": 0.0},
        top_class_score    = 0.0,
        biopsy_recommended = False,
        biopsy_reason      = "Classifier not available — please review features manually.",
        mask_b64           = seg.mask_b64,
        overlay_b64        = seg.overlay_b64,
        features           = features,
        inference_time_ms  = elapsed_ms,
        segmentation_ok    = True,
        classifier_ok      = False,
    )


# ---------------------------------------------------------------------------
# Main pipeline class
# ---------------------------------------------------------------------------

class DermoscopyPipeline:
    """
    Holds all three ML components in memory and orchestrates inference.

    Instantiate once at server startup; call .run() on every request.
    """

    def __init__(self,
                 seg_model: SegmentationModel,
                 clf_model: ClassifierModel | None):
        self._seg = seg_model
        self._clf = clf_model
        log.info(
            "DermoscopyPipeline ready  [seg=OK, clf=%s]",
            "OK" if clf_model else "MISSING",
        )

    # ------------------------------------------------------------------
    @classmethod
    def from_config(cls, config: Any) -> "DermoscopyPipeline":
        """
        Build the pipeline from your config.py settings object.

        config must have:
            config.SEG_MODEL_PATH        str | Path
            config.CLF_MODEL_PATH        str | Path   (optional)
            config.CLF_FEATURE_NAMES_PATH str | Path  (optional)
            config.DEVICE                str  'cuda' | 'cpu'
            config.USE_TTA               bool
            config.CLASSIFIER_AVAILABLE  bool
        """
        import torch
        device = config.DEVICE if torch.cuda.is_available() else "cpu"
        log.info("Building pipeline on device: %s", device)

        seg_model = SegmentationModel(
            checkpoint_path = config.SEG_MODEL_PATH,
            device          = device,
            use_tta         = config.USE_TTA,
        )

        clf_model = None
        if getattr(config, "CLASSIFIER_AVAILABLE", False):
            try:
                clf_model = ClassifierModel(
                    model_path         = config.CLF_MODEL_PATH,
                    feature_names_path = config.CLF_FEATURE_NAMES_PATH,
                )
            except Exception as exc:
                log.error("Failed to load classifier: %s — continuing without it.", exc)

        return cls(seg_model=seg_model, clf_model=clf_model)

    # ------------------------------------------------------------------
    def run(self, img_bgr: np.ndarray) -> PipelineResult:
        """
        Run the full pipeline on a single BGR uint8 image.

        Parameters
        ----------
        img_bgr : np.ndarray  (H, W, 3)  BGR uint8

        Returns
        -------
        PipelineResult
        """
        t0 = time.perf_counter()

        # ── Step 1: Segmentation ────────────────────────────────────
        log.debug("Step 1: segmentation")
        seg: SegResult = self._seg.predict(img_bgr)

        seg_ok = bool(seg.mask_orig.sum() > 0)
        if not seg_ok:
            log.warning("Segmentation produced an empty mask.")

        # ── Step 2: Feature extraction ──────────────────────────────
        log.debug("Step 2: feature extraction")
        features = extract_features(img_bgr, seg.mask_orig)

        # ── Step 3: Classification ──────────────────────────────────
        elapsed_ms = (time.perf_counter() - t0) * 1000

        if self._clf is None:
            return _classifier_unavailable_result(seg, features, elapsed_ms)

        log.debug("Step 3: classification")
        clf_result: ClassResult = self._clf.predict(features)

        # ── Step 4: Multi-factor biopsy escalation ──────────────────
        biopsy, reason = should_escalate_to_biopsy(
            clf_result.prediction,
            clf_result.confidence,
            features,
        )

        elapsed_ms = (time.perf_counter() - t0) * 1000
        log.info(
            "Pipeline done in %.0f ms  pred=%s  conf=%.2f  biopsy=%s",
            elapsed_ms, clf_result.prediction,
            clf_result.top_class_score, biopsy,
        )

        return PipelineResult(
            prediction         = clf_result.prediction,
            confidence         = clf_result.confidence,
            top_class_score    = clf_result.top_class_score,
            biopsy_recommended = biopsy,
            biopsy_reason      = reason,
            mask_b64           = seg.mask_b64,
            overlay_b64        = seg.overlay_b64,
            features           = features,
            inference_time_ms  = elapsed_ms,
            segmentation_ok    = seg_ok,
            classifier_ok      = True,
        )

    # ------------------------------------------------------------------
    def run_from_path(self, image_path: str | Path) -> PipelineResult:
        """Convenience wrapper: load an image from disk then run the pipeline."""
        img_bgr = cv2.imread(str(image_path))
        if img_bgr is None:
            raise ValueError(f"Cannot read image: {image_path}")
        return self.run(img_bgr)

    # ------------------------------------------------------------------
    def run_from_bytes(self, image_bytes: bytes) -> PipelineResult:
        """Convenience wrapper: decode image bytes (from HTTP upload) then run."""
        arr    = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise ValueError("Cannot decode image bytes.")
        return self.run(img_bgr)
