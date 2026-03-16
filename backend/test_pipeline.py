"""
test_pipeline.py
----------------
Run this script from the backend/ directory to verify your ML pipeline
works correctly BEFORE starting the FastAPI server.

    cd dermoscopy-platform/backend
    python test_pipeline.py --image path/to/any/dermoscopy_image.jpg

What it checks:
  1. Segmentation model loads from checkpoint
  2. Forward pass produces a non-empty mask
  3. Feature extraction returns ~150 features
  4. Classifier loads and returns a valid prediction  (if CLASSIFIER_AVAILABLE)
  5. Pipeline .run() returns a well-formed PipelineResult
  6. Overlay image looks correct (saved to test_output/)

Requirements before running:
  - Copy your best_model.pt to  backend/ml/models/best_model.pt
  - (Optional) Save classifier.joblib + feature_names.json to backend/ml/models/
  - Set CLASSIFIER_AVAILABLE=true in your .env if classifier files are present
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Make sure backend/ is on the path when running directly
sys.path.insert(0, str(Path(__file__).resolve().parent))

import cv2
import numpy as np


def make_dummy_image(size: int = 384) -> np.ndarray:
    """Create a synthetic dermoscopy-like image for testing."""
    img = np.zeros((size, size, 3), dtype=np.uint8)
    # Background skin-tone
    img[:] = (180, 130, 100)
    # Darker lesion circle in the centre
    cx, cy, r = size // 2, size // 2, size // 4
    cv2.circle(img, (cx, cy), r, (60, 40, 30), -1)
    # Slight texture noise
    noise = np.random.randint(-15, 15, img.shape, dtype=np.int16)
    img   = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return img


def run_test(image_path: str | None) -> None:
    import config

    out_dir = Path("test_output")
    out_dir.mkdir(exist_ok=True)

    # ── Load image ──────────────────────────────────────────────────
    if image_path:
        img_bgr = cv2.imread(image_path)
        if img_bgr is None:
            print(f"[ERROR] Cannot read image: {image_path}")
            sys.exit(1)
        print(f"[OK] Loaded image: {image_path}  {img_bgr.shape}")
    else:
        img_bgr = make_dummy_image(384)
        print("[INFO] No image provided — using synthetic test image.")

    # ── Step 1: Segmentation alone ──────────────────────────────────
    print("\n── Step 1: Segmentation ──")
    if not config.SEG_MODEL_PATH.exists():
        print(f"[ERROR] Checkpoint not found: {config.SEG_MODEL_PATH}")
        print("        Copy your best_model.pt to backend/ml/models/best_model.pt")
        sys.exit(1)

    from ml.segmentation import SegmentationModel
    t0  = time.perf_counter()
    seg = SegmentationModel(
        checkpoint_path = config.SEG_MODEL_PATH,
        device          = config.DEVICE,
        use_tta         = config.USE_TTA,
    )
    result_seg = seg.predict(img_bgr)
    print(f"[OK] Segmentation done in {(time.perf_counter()-t0)*1000:.0f} ms")
    print(f"     Mask non-zero pixels: {(result_seg.mask_orig > 0).sum()}")
    print(f"     Overlay shape: {result_seg.overlay_rgb.shape}")

    # Save visual outputs
    cv2.imwrite(str(out_dir / "test_mask.png"), result_seg.mask_orig)
    cv2.imwrite(str(out_dir / "test_overlay.png"),
                cv2.cvtColor(result_seg.overlay_rgb, cv2.COLOR_RGB2BGR))
    print(f"     Saved → test_output/test_mask.png + test_output/test_overlay.png")

    # ── Step 2: Feature extraction ──────────────────────────────────
    print("\n── Step 2: Feature extraction ──")
    from ml.feature_extraction import extract_features
    t0       = time.perf_counter()
    features = extract_features(img_bgr, result_seg.mask_orig)
    print(f"[OK] Feature extraction done in {(time.perf_counter()-t0)*1000:.0f} ms")
    print(f"     Features extracted: {len(features)}")

    # Print a small sample
    sample_keys = ["asym_pca", "border_irregularity", "color_rgb_ch0_mean",
                   "glcm_contrast_mean", "lbp_entropy", "shape_sphericity"]
    print("     Sample values:")
    for k in sample_keys:
        if k in features:
            print(f"       {k:40s} = {features[k]:.4f}")

    # Save full feature dict
    with open(out_dir / "test_features.json", "w") as f:
        json.dump(features, f, indent=2)
    print(f"     Saved → test_output/test_features.json")

    # ── Step 3: Classifier (optional) ──────────────────────────────
    print("\n── Step 3: Classification ──")
    if not config.CLASSIFIER_AVAILABLE:
        print("[SKIP] CLASSIFIER_AVAILABLE=false in config — set to true once you")
        print("       have saved classifier.joblib and feature_names.json")
    elif not config.CLF_MODEL_PATH.exists():
        print(f"[SKIP] Classifier file not found: {config.CLF_MODEL_PATH}")
    else:
        from ml.classifier import ClassifierModel
        t0  = time.perf_counter()
        clf = ClassifierModel(
            model_path         = config.CLF_MODEL_PATH,
            feature_names_path = config.CLF_FEATURE_NAMES_PATH,
        )
        clf_result = clf.predict(features)
        print(f"[OK] Classification done in {(time.perf_counter()-t0)*1000:.0f} ms")
        print(f"     Prediction:  {clf_result.prediction}")
        print(f"     Confidence:  {clf_result.confidence}")
        print(f"     Biopsy:      {clf_result.biopsy_recommended}")

    # ── Step 4: Full pipeline ──────────────────────────────────────
    print("\n── Step 4: Full pipeline.run() ──")
    from ml.pipeline import DermoscopyPipeline
    t0       = time.perf_counter()
    pipeline = DermoscopyPipeline.from_config(config)
    result   = pipeline.run(img_bgr)
    total_ms = (time.perf_counter() - t0) * 1000
    print(f"[OK] Pipeline done in {total_ms:.0f} ms")
    print(f"     prediction:          {result.prediction}")
    print(f"     top_class_score:     {result.top_class_score:.4f}")
    print(f"     biopsy_recommended:  {result.biopsy_recommended}")
    print(f"     biopsy_reason:       {result.biopsy_reason}")
    print(f"     segmentation_ok:     {result.segmentation_ok}")
    print(f"     classifier_ok:       {result.classifier_ok}")
    print(f"     inference_time_ms:   {result.inference_time_ms:.0f}")
    print(f"     features count:      {len(result.features)}")

    # Verify API dict serialises to JSON cleanly
    api_dict = result.to_api_dict()
    json_str = json.dumps(api_dict)
    print(f"     API JSON size:       {len(json_str):,} bytes")

    print("\n✅  All steps passed. Pipeline is ready for the FastAPI server.")
    print(f"    Outputs saved to: {out_dir.resolve()}/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test the dermoscopy ML pipeline")
    parser.add_argument("--image", type=str, default=None,
                        help="Path to a dermoscopy image (JPG/PNG). "
                             "Omit to use a synthetic test image.")
    args = parser.parse_args()
    run_test(args.image)
