"""
segmentation.py
---------------
Loads ResNetUNetV4 from a checkpoint file and runs segmentation inference
with 8-fold Test-Time Augmentation (TTA) and largest-blob post-processing.

Public API:
    seg_model = SegmentationModel(checkpoint_path, device)
    result     = seg_model.predict(image_bgr_numpy)  # returns SegResult

SegResult fields:
    .mask_orig      np.ndarray uint8 (H×W, 0 or 255) — clean binary mask
                    at the original image resolution
    .overlay_rgb    np.ndarray uint8 (H×W×3) — original image with
                    semi-transparent mask drawn on top
    .mask_b64       str  — base64-encoded PNG of the mask
    .overlay_b64    str  — base64-encoded PNG of the overlay
    .dice_before    float — Dice vs raw prediction (1.0 when no GT available)
"""

from __future__ import annotations

import base64
import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from ml.model_def import ResNetUNetV4

log = logging.getLogger(__name__)

# Inference resolution (must match training resolution in Script 1/2)
INFERENCE_SIZE = (384, 384)
THRESHOLD      = 0.50
MASK_ALPHA     = 0.45          # opacity of the overlay tint
MASK_COLOR_RGB = (220, 50, 50) # red tint for the lesion region


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class SegResult:
    mask_orig:   np.ndarray          # uint8 HxW, values 0 or 255
    overlay_rgb: np.ndarray          # uint8 HxWx3
    mask_b64:    str = field(repr=False)
    overlay_b64: str = field(repr=False)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _numpy_to_b64(arr_uint8: np.ndarray) -> str:
    """Encode a uint8 numpy array (gray or RGB) as a base64 PNG string."""
    img_pil = Image.fromarray(arr_uint8)
    buf = io.BytesIO()
    img_pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _keep_largest_blob(mask_u8: np.ndarray) -> np.ndarray:
    """Return a copy of the binary mask keeping only the largest connected component."""
    _, binary = cv2.threshold(mask_u8, 127, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return np.zeros_like(mask_u8)
    largest = max(contours, key=cv2.contourArea)
    clean   = np.zeros_like(mask_u8)
    cv2.drawContours(clean, [largest], -1, 255, thickness=cv2.FILLED)
    return clean


def _draw_overlay(img_rgb: np.ndarray, mask_u8: np.ndarray,
                  color: tuple = MASK_COLOR_RGB, alpha: float = MASK_ALPHA) -> np.ndarray:
    """
    Draw a semi-transparent tinted region over img_rgb wherever mask_u8 > 0.
    Also draws a thin contour border around the lesion boundary.
    Returns a uint8 RGB array.
    """
    overlay = img_rgb.astype(np.float32).copy()
    binary  = (mask_u8 > 127)

    # Tinted fill
    for c, v in enumerate(color):
        ch = overlay[:, :, c]
        ch[binary] = ch[binary] * (1 - alpha) + v * alpha
        overlay[:, :, c] = ch

    overlay = overlay.clip(0, 255).astype(np.uint8)

    # Contour border (bright red, 2px)
    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, (255, 30, 30), 2)

    return overlay


def _preprocess(img_bgr: np.ndarray) -> torch.Tensor:
    """BGR uint8 → normalised float32 tensor (1, 3, H, W) ready for inference."""
    img_rgb  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_r    = cv2.resize(img_rgb, INFERENCE_SIZE, interpolation=cv2.INTER_LINEAR)
    img_f    = img_r.astype(np.float32) / 255.0
    tensor   = torch.tensor(np.transpose(img_f, (2, 0, 1))[None], dtype=torch.float32)
    return tensor


# ---------------------------------------------------------------------------
# TTA (8-fold: identity + h-flip + v-flip + hvflip + rot90 × 3 + flip+rot)
# ---------------------------------------------------------------------------

_TTA_TRANSFORMS = [
    (lambda x: x,
     lambda x: x),
    (lambda x: torch.flip(x, [3]),
     lambda x: torch.flip(x, [3])),
    (lambda x: torch.flip(x, [2]),
     lambda x: torch.flip(x, [2])),
    (lambda x: torch.flip(x, [2, 3]),
     lambda x: torch.flip(x, [2, 3])),
    (lambda x: torch.rot90(x, 1, [2, 3]),
     lambda x: torch.rot90(x, 3, [2, 3])),
    (lambda x: torch.rot90(x, 2, [2, 3]),
     lambda x: torch.rot90(x, 2, [2, 3])),
    (lambda x: torch.rot90(x, 3, [2, 3]),
     lambda x: torch.rot90(x, 1, [2, 3])),
    (lambda x: torch.flip(torch.rot90(x, 1, [2, 3]), [3]),
     lambda x: torch.rot90(torch.flip(x, [3]), 3, [2, 3])),
]


def _tta_predict(model: torch.nn.Module, xb: torch.Tensor) -> torch.Tensor:
    """Run 8-fold TTA and return averaged sigmoid probability map."""
    model.eval()
    preds = []
    with torch.no_grad():
        for fwd, inv in _TTA_TRANSFORMS:
            out = model(fwd(xb))
            if isinstance(out, tuple):
                out = out[0]
            preds.append(inv(torch.sigmoid(out)))
    return torch.stack(preds).mean(0)   # (1, 1, H, W)


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------

class SegmentationModel:
    """
    Wraps ResNetUNetV4 for inference.

    Parameters
    ----------
    checkpoint_path : str | Path
        Path to the .pt checkpoint file.
    device : torch.device | str
        'cuda' or 'cpu'.
    use_tta : bool
        Whether to use 8-fold TTA (default True).
    """

    def __init__(self, checkpoint_path: str | Path,
                 device: torch.device | str = "cpu",
                 use_tta: bool = True):
        self.device  = torch.device(device)
        self.use_tta = use_tta
        self.model   = self._load(checkpoint_path)
        log.info("SegmentationModel ready on %s  (TTA=%s)", self.device, use_tta)

    # ------------------------------------------------------------------
    def _load(self, checkpoint_path: str | Path) -> torch.nn.Module:
        path = Path(checkpoint_path)
        if not path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {path}")

        log.info("Loading segmentation checkpoint: %s", path)
        ckpt = torch.load(str(path), map_location=self.device)

        model = ResNetUNetV4(pretrained=False, drop=0.1).to(self.device)

        # Handle multiple checkpoint formats
        if isinstance(ckpt, dict):
            state = ckpt.get("model_state") or ckpt.get("state_dict") or ckpt
        else:
            state = ckpt

        # Strip DataParallel / SWA 'module.' prefix if present
        if any(k.startswith("module.") for k in state.keys()):
            state = {k.replace("module.", "", 1): v for k, v in state.items()}

        missing, unexpected = model.load_state_dict(state, strict=False)
        if missing:
            log.warning("Missing keys: %s", missing[:5])
        if unexpected:
            log.warning("Unexpected keys: %s", unexpected[:5])

        model.eval()
        return model

    # ------------------------------------------------------------------
    def predict(self, img_bgr: np.ndarray) -> SegResult:
        """
        Run full segmentation pipeline on a BGR uint8 image.

        Parameters
        ----------
        img_bgr : np.ndarray  (H, W, 3)  BGR uint8

        Returns
        -------
        SegResult
        """
        orig_h, orig_w = img_bgr.shape[:2]

        # Preprocess → tensor
        tensor = _preprocess(img_bgr).to(self.device)

        # Inference
        if self.use_tta:
            prob = _tta_predict(self.model, tensor)
        else:
            with torch.no_grad():
                out  = self.model(tensor)
                if isinstance(out, tuple):
                    out = out[0]
                prob = torch.sigmoid(out)

        # Probability map → binary at inference resolution
        prob_np   = prob[0, 0].cpu().numpy()   # (384, 384) float
        pred_384  = (prob_np > THRESHOLD).astype(np.uint8) * 255

        # Resize to original resolution
        pred_orig = cv2.resize(pred_384, (orig_w, orig_h),
                               interpolation=cv2.INTER_NEAREST)

        # Post-process: keep largest connected component
        mask_clean = _keep_largest_blob(pred_orig)

        # Build overlay
        img_rgb     = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        overlay_rgb = _draw_overlay(img_rgb, mask_clean)

        return SegResult(
            mask_orig   = mask_clean,
            overlay_rgb = overlay_rgb,
            mask_b64    = _numpy_to_b64(mask_clean),
            overlay_b64 = _numpy_to_b64(overlay_rgb),
        )
