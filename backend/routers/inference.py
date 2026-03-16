"""
routers/inference.py
--------------------
POST /api/analyze
    Accepts a dermoscopy image upload, runs the full ML pipeline,
    stores results in the DB, generates a PDF report, and returns
    the full result JSON to the frontend.

The pipeline object is loaded ONCE at server startup (see main.py lifespan)
and injected via app.state — never reloaded per request.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import config
from database import Analysis, PatientProfile, User, get_db
from routers.auth import get_current_user
from services.report_generator import generate_pdf_report

router = APIRouter(prefix="/api", tags=["inference"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/jpg"}
MAX_BYTES    = 20 * 1024 * 1024   # 20 MB


# ---------------------------------------------------------------------------
# Helper: save uploaded file to disk
# ---------------------------------------------------------------------------

async def _save_upload(upload: UploadFile, dest_dir: Path) -> tuple[Path, str]:
    """Save UploadFile to dest_dir with a UUID filename. Returns (path, stem)."""
    ext    = Path(upload.filename or "image.jpg").suffix.lower() or ".jpg"
    stem   = str(uuid.uuid4())
    fpath  = dest_dir / f"{stem}{ext}"
    async with aiofiles.open(fpath, "wb") as f:
        content = await upload.read()
        if len(content) > MAX_BYTES:
            raise HTTPException(413, "Image too large (max 20 MB).")
        await f.write(content)
    return fpath, stem


# ---------------------------------------------------------------------------
# POST /api/analyze
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze(
    request:    Request,
    image:      UploadFile   = File(..., description="Dermoscopy image JPG/PNG"),
    patient_id: str          = Form(..., description="PatientProfile.id"),
    db:         AsyncSession = Depends(get_db),
    current_user: User       = Depends(get_current_user),
):
    """
    Full inference pipeline:
      1. Validate + save uploaded image
      2. Run DermoscopyPipeline (seg → features → classification)
      3. Save mask + overlay images
      4. Generate PDF report
      5. Persist Analysis row to DB
      6. Return full result JSON

    Accessible by both clinicians (uploading dermoscopy images) and
    patients (uploading phone photos of lesions).
    """
    # ── Validate mime type ────────────────────────────────────────────
    if image.content_type not in ALLOWED_MIME:
        raise HTTPException(415, f"Unsupported image type: {image.content_type}")

    # ── Verify patient exists ─────────────────────────────────────────
    pat_result = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    patient = pat_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(404, "Patient not found.")

    # ── Save original image ───────────────────────────────────────────
    img_path, stem = await _save_upload(image, config.UPLOAD_DIR)

    # ── Run pipeline (loaded at startup in app.state) ─────────────────
    pipeline = request.app.state.pipeline
    try:
        result = pipeline.run_from_path(img_path)
    except Exception as exc:
        raise HTTPException(500, f"Inference failed: {exc}") from exc

    # ── Save mask + overlay images ────────────────────────────────────
    import base64, cv2, numpy as np

    mask_path    = config.UPLOAD_DIR / f"{stem}_mask.png"
    overlay_path = config.UPLOAD_DIR / f"{stem}_overlay.png"

    mask_bytes    = base64.b64decode(result.mask_b64)
    overlay_bytes = base64.b64decode(result.overlay_b64)

    async with aiofiles.open(mask_path, "wb") as f:
        await f.write(mask_bytes)
    async with aiofiles.open(overlay_path, "wb") as f:
        await f.write(overlay_bytes)

    # ── Generate PDF report ───────────────────────────────────────────
    report_pdf_path = config.REPORTS_DIR / f"{stem}_report.pdf"
    try:
        generate_pdf_report(
            output_path      = report_pdf_path,
            image_path       = img_path,
            overlay_path     = overlay_path,
            prediction       = result.prediction,
            confidence       = result.confidence,
            features         = result.features,
            biopsy_recommended = result.biopsy_recommended,
            biopsy_reason    = result.biopsy_reason,
            patient_name     = patient.user.full_name
                               if hasattr(patient, "user") and patient.user else "Unknown",
        )
    except Exception as exc:
        # PDF failure is non-fatal — we still return the result
        report_pdf_path = Path("")
        print(f"[WARN] PDF generation failed: {exc}")

    # ── Persist to database ───────────────────────────────────────────
    analysis = Analysis(
        patient_id         = patient_id,
        uploaded_by        = current_user.id,
        image_path         = str(img_path),
        mask_path          = str(mask_path),
        overlay_path       = str(overlay_path),
        report_pdf_path    = str(report_pdf_path),
        prediction         = result.prediction,
        confidence_json    = result.confidence,
        features_json      = result.features,
        biopsy_recommended = result.biopsy_recommended,
        biopsy_reason      = result.biopsy_reason,
        inference_time_ms  = result.inference_time_ms,
        segmentation_ok    = result.segmentation_ok,
        classifier_ok      = result.classifier_ok,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    # ── Build response ────────────────────────────────────────────────
    api_dict = result.to_api_dict()
    api_dict["analysis_id"]     = analysis.id
    api_dict["report_available"] = report_pdf_path.exists() if report_pdf_path.name else False
    return api_dict


# ---------------------------------------------------------------------------
# GET /api/analyses/{analysis_id}  — fetch one stored result
# ---------------------------------------------------------------------------

@router.get("/analyses/{analysis_id}")
async def get_analysis(
    analysis_id: str,
    db:          AsyncSession = Depends(get_db),
    _:           User         = Depends(get_current_user),
):
    result = await db.execute(
        select(Analysis).where(Analysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(404, "Analysis not found.")

    # Re-encode overlay as base64 for the frontend if file still exists
    overlay_b64 = ""
    if analysis.overlay_path and Path(analysis.overlay_path).exists():
        with open(analysis.overlay_path, "rb") as f:
            import base64
            overlay_b64 = base64.b64encode(f.read()).decode()

    return {
        "analysis_id":       analysis.id,
        "patient_id":        analysis.patient_id,
        "prediction":        analysis.prediction,
        "confidence":        analysis.confidence_json,
        "features":          analysis.features_json,
        "biopsy_recommended": analysis.biopsy_recommended,
        "biopsy_reason":     analysis.biopsy_reason,
        "overlay_b64":       overlay_b64,
        "inference_time_ms": analysis.inference_time_ms,
        "segmentation_ok":   analysis.segmentation_ok,
        "classifier_ok":     analysis.classifier_ok,
        "created_at":        analysis.created_at.isoformat(),
        "report_available":  bool(analysis.report_pdf_path and
                                  Path(analysis.report_pdf_path).exists()),
    }


# ---------------------------------------------------------------------------
# GET /api/reports/{analysis_id}  — download PDF report
# ---------------------------------------------------------------------------

@router.get("/reports/{analysis_id}")
async def download_report(
    analysis_id: str,
    db:          AsyncSession = Depends(get_db),
    _:           User         = Depends(get_current_user),
):
    result = await db.execute(
        select(Analysis).where(Analysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(404, "Analysis not found.")

    pdf_path = Path(analysis.report_pdf_path or "")
    if not pdf_path.exists():
        raise HTTPException(404, "Report PDF not yet generated.")

    return FileResponse(
        path             = str(pdf_path),
        media_type       = "application/pdf",
        filename         = f"dermoscopy_report_{analysis_id[:8]}.pdf",
    )
