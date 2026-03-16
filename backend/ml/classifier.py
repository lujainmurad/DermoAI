"""
classifier.py
-------------
Loads the best trained classifier from Script 4 (saved as a joblib file)
and maps the ~150 extracted features to one of three classes:
    melanoma | seborrheic_keratosis | nevi

Public API:
    clf_model = ClassifierModel(model_path, feature_names_path)
    result     = clf_model.predict(features_dict)  # returns ClassResult

ClassResult fields:
    .prediction          str   — "melanoma" | "nevi" | "seborrheic_keratosis"
    .confidence          dict  — {"melanoma": 0.87, "nevi": 0.09, "seborrheic_keratosis": 0.04}
    .biopsy_recommended  bool  — True when melanoma confidence ≥ BIOPSY_THRESHOLD
    .top_class_score     float — confidence of the predicted class

Notes on saving your classifier from Script 4
---------------------------------------------
After running Script 4, add the following two lines at the end to persist the
best model and its expected feature column order:

    import joblib, json
    joblib.dump(best_model, "backend/ml/models/classifier.joblib")
    json.dump(feature_cols, open("backend/ml/models/feature_names.json", "w"))

If you haven't trained the classifier yet, set CLASSIFIER_AVAILABLE = False
in config.py and the pipeline will return feature-extraction-only results.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

log = logging.getLogger(__name__)

# Confidence threshold above which we recommend biopsy escalation
BIOPSY_THRESHOLD = 0.60

# Class labels in the order your classifier was trained on
# (matches the LabelEncoder used in Script 4)
CLASS_LABELS = ["melanoma", "nevi", "seborrheic_keratosis"]

# Single-class fallback when model only predicts melanoma vs benign (binary)
BINARY_LABEL_MAP = {0: "nevi", 1: "melanoma"}


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class ClassResult:
    prediction:         str
    confidence:         dict[str, float]
    biopsy_recommended: bool
    top_class_score:    float


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------

class ClassifierModel:
    """
    Wraps a trained sklearn-compatible classifier for three-class prediction.

    Parameters
    ----------
    model_path : str | Path
        Path to the joblib-serialised classifier.
    feature_names_path : str | Path
        Path to a JSON list of feature names (same order as training columns).
    """

    def __init__(self, model_path: str | Path,
                 feature_names_path: str | Path):
        self.model        = self._load_model(Path(model_path))
        self.feature_names = self._load_feature_names(Path(feature_names_path))
        self._n_classes    = self._detect_n_classes()
        log.info(
            "ClassifierModel ready: %s | features=%d | classes=%d",
            type(self.model).__name__, len(self.feature_names), self._n_classes,
        )

    # ------------------------------------------------------------------
    @staticmethod
    def _load_model(path: Path) -> Any:
        try:
            import joblib
        except ImportError:
            raise ImportError("joblib is required: pip install joblib")
        if not path.exists():
            raise FileNotFoundError(f"Classifier not found: {path}")
        log.info("Loading classifier: %s", path)
        return joblib.load(str(path))

    @staticmethod
    def _load_feature_names(path: Path) -> list[str]:
        if not path.exists():
            raise FileNotFoundError(f"Feature names not found: {path}")
        with open(path) as f:
            names = json.load(f)
        log.info("Loaded %d feature names", len(names))
        return names

    def _detect_n_classes(self) -> int:
        """Infer whether the model outputs 2 or 3 classes."""
        if hasattr(self.model, "classes_"):
            return len(self.model.classes_)
        if hasattr(self.model, "n_classes_"):
            return self.model.n_classes_
        return 3   # assume 3-class by default

    # ------------------------------------------------------------------
    def _build_feature_vector(self, features: dict[str, float]) -> np.ndarray:
        """
        Convert feature dict → 1D numpy array aligned to training column order.
        Missing features are filled with 0.0.
        """
        vec = np.array(
            [features.get(name, 0.0) for name in self.feature_names],
            dtype=np.float32,
        )
        # Replace inf / nan (same as the imputer in Script 4)
        vec = np.where(np.isfinite(vec), vec, 0.0)
        return vec.reshape(1, -1)

    # ------------------------------------------------------------------
    def predict(self, features: dict[str, float]) -> ClassResult:
        """
        Predict class and confidence scores for one image.

        Parameters
        ----------
        features : dict[str, float]
            Output of extract_features() — the ~150-feature dict.

        Returns
        -------
        ClassResult
        """
        X = self._build_feature_vector(features)

        has_proba = hasattr(self.model, "predict_proba")

        if has_proba:
            proba = self.model.predict_proba(X)[0]  # shape (n_classes,)
        else:
            # For models without probability output, use hard prediction
            raw_pred = self.model.predict(X)[0]
            proba    = None

        # ── 3-class case ────────────────────────────────────────────
        if self._n_classes == 3 and proba is not None:
            labels = CLASS_LABELS
            conf   = {label: float(round(p, 4))
                      for label, p in zip(labels, proba)}
            pred   = labels[int(np.argmax(proba))]

        # ── 2-class (binary melanoma vs benign) ─────────────────────
        elif self._n_classes == 2 and proba is not None:
            mel_score   = float(proba[1])
            nevi_score  = float(proba[0])
            conf = {
                "melanoma":             round(mel_score, 4),
                "nevi":                 round(nevi_score * 0.6, 4),
                "seborrheic_keratosis": round(nevi_score * 0.4, 4),
            }
            pred = "melanoma" if mel_score >= 0.5 else "nevi"

        # ── No-probability fallback ──────────────────────────────────
        else:
            label_map = {i: l for i, l in enumerate(CLASS_LABELS)}
            pred  = label_map.get(int(raw_pred), "nevi")
            conf  = {l: (1.0 if l == pred else 0.0) for l in CLASS_LABELS}

        top_score = conf[pred]
        biopsy    = (pred == "melanoma" and top_score >= BIOPSY_THRESHOLD)

        return ClassResult(
            prediction         = pred,
            confidence         = conf,
            biopsy_recommended = biopsy,
            top_class_score    = top_score,
        )


# ---------------------------------------------------------------------------
# Convenience: biopsy decision logic (also called from pipeline.py)
# ---------------------------------------------------------------------------

def should_escalate_to_biopsy(prediction: str, confidence: dict[str, float],
                                features: dict[str, float]) -> tuple[bool, str]:
    """
    Multi-factor biopsy escalation logic.
    Returns (recommend_biopsy: bool, reason: str).

    Criteria (any one triggers recommendation):
      1. Melanoma predicted with confidence ≥ 60 %
      2. Melanoma predicted at any confidence AND border irregularity > 2.5
      3. Melanoma predicted AND asymmetry_pca > 0.35
      4. Melanoma predicted AND color entropy (ch0) > 4.5
    """
    mel_conf   = confidence.get("melanoma", 0.0)
    is_mel     = prediction == "melanoma"
    border_irr = features.get("border_irregularity", 0.0)
    asym_pca   = features.get("asym_pca", 0.0)
    col_ent    = features.get("color_rgb_ch0_entropy", 0.0)

    if mel_conf >= BIOPSY_THRESHOLD:
        return True, f"High melanoma confidence ({mel_conf:.0%})"
    if is_mel and border_irr > 2.5:
        return True, f"Irregular border (score {border_irr:.2f})"
    if is_mel and asym_pca > 0.35:
        return True, f"High asymmetry (PCA score {asym_pca:.2f})"
    if is_mel and col_ent > 4.5:
        return True, f"High colour entropy (ch0 = {col_ent:.2f})"

    return False, "No high-risk indicators detected"
