"""
routers/patients.py
-------------------
GET  /api/patients                     — clinician: list assigned patients
GET  /api/patients/{id}                — get patient profile
GET  /api/patients/{id}/history        — all analyses for a patient
GET  /api/patients/{id}/lab-reports    — lab PDFs for a patient
POST /api/patients/{id}/lab-reports    — upload a lab PDF
PATCH /api/patients/{id}/assign        — assign patient to a clinician
"""

from __future__ import annotations

import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import config
from database import (Analysis, ClinicianProfile, LabReport,
                       PatientProfile, User, get_db)
from routers.auth import get_current_user, require_clinician

router = APIRouter(prefix="/api/patients", tags=["patients"])


# ---------------------------------------------------------------------------
# Schemas (inline Pydantic-free dicts — keeps file short)
# ---------------------------------------------------------------------------

def _patient_dict(patient: PatientProfile) -> dict:
    u = patient.user
    return {
        "id":                    patient.id,
        "user_id":               patient.user_id,
        "full_name":             u.full_name if u else "",
        "email":                 u.email     if u else "",
        "date_of_birth":         patient.date_of_birth,
        "assigned_clinician_id": patient.assigned_clinician_id,
        "medical_notes":         patient.medical_notes,
    }


def _analysis_summary(a: Analysis) -> dict:
    return {
        "analysis_id":       a.id,
        "prediction":        a.prediction,
        "confidence":        a.confidence_json,
        "biopsy_recommended": a.biopsy_recommended,
        "biopsy_reason":     a.biopsy_reason,
        "segmentation_ok":   a.segmentation_ok,
        "classifier_ok":     a.classifier_ok,
        "created_at":        a.created_at.isoformat(),
        "report_available":  bool(a.report_pdf_path and
                                  Path(a.report_pdf_path).exists()),
    }


def _lab_dict(lab: LabReport) -> dict:
    return {
        "id":          lab.id,
        "patient_id":  lab.patient_id,
        "report_type": lab.report_type,
        "notes":       lab.notes,
        "uploaded_at": lab.uploaded_at.isoformat(),
        "filename":    Path(lab.file_path).name if lab.file_path else "",
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_patients(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(require_clinician),
):
    """Return all patients assigned to the requesting clinician."""
    # Get clinician profile
    cli_q  = await db.execute(
        select(ClinicianProfile).where(ClinicianProfile.user_id == user.id)
    )
    cli    = cli_q.scalar_one_or_none()
    if not cli:
        return []

    q = await db.execute(
        select(PatientProfile)
        .options(selectinload(PatientProfile.user))
        .where(PatientProfile.assigned_clinician_id == cli.id)
    )
    patients = q.scalars().all()
    return [_patient_dict(p) for p in patients]


@router.get("/{patient_id}")
async def get_patient(
    patient_id: str,
    db:         AsyncSession = Depends(get_db),
    user:       User         = Depends(get_current_user),
):
    q = await db.execute(
        select(PatientProfile)
        .options(selectinload(PatientProfile.user))
        .where(PatientProfile.id == patient_id)
    )
    patient = q.scalar_one_or_none()
    if not patient:
        raise HTTPException(404, "Patient not found.")

    # Patients can only view their own profile
    if user.role == "patient" and patient.user_id != user.id:
        raise HTTPException(403, "Access denied.")

    return _patient_dict(patient)


@router.get("/{patient_id}/history")
async def patient_history(
    patient_id: str,
    db:         AsyncSession = Depends(get_db),
    user:       User         = Depends(get_current_user),
):
    """Return all analyses for a patient, newest first."""
    # Verify access
    pat_q = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    patient = pat_q.scalar_one_or_none()
    if not patient:
        raise HTTPException(404, "Patient not found.")
    if user.role == "patient" and patient.user_id != user.id:
        raise HTTPException(403, "Access denied.")

    q = await db.execute(
        select(Analysis)
        .where(Analysis.patient_id == patient_id)
        .order_by(Analysis.created_at.desc())
    )
    analyses = q.scalars().all()
    return [_analysis_summary(a) for a in analyses]


@router.get("/{patient_id}/lab-reports")
async def get_lab_reports(
    patient_id: str,
    db:         AsyncSession = Depends(get_db),
    user:       User         = Depends(get_current_user),
):
    pat_q = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    patient = pat_q.scalar_one_or_none()
    if not patient:
        raise HTTPException(404, "Patient not found.")
    if user.role == "patient" and patient.user_id != user.id:
        raise HTTPException(403, "Access denied.")

    q = await db.execute(
        select(LabReport)
        .where(LabReport.patient_id == patient_id)
        .order_by(LabReport.uploaded_at.desc())
    )
    return [_lab_dict(lab) for lab in q.scalars().all()]


@router.post("/{patient_id}/lab-reports", status_code=201)
async def upload_lab_report(
    patient_id:  str,
    file:        UploadFile = File(...),
    report_type: str        = Form(default="Lab Report"),
    notes:       str        = Form(default=""),
    db:          AsyncSession = Depends(get_db),
    user:        User         = Depends(get_current_user),
):
    """Upload a lab PDF and link it to the patient."""
    pat_q = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    if not pat_q.scalar_one_or_none():
        raise HTTPException(404, "Patient not found.")

    if file.content_type != "application/pdf":
        raise HTTPException(415, "Only PDF files are accepted for lab reports.")

    stem  = str(uuid.uuid4())
    fpath = config.LAB_REPORTS_DIR / f"{stem}.pdf"
    async with aiofiles.open(fpath, "wb") as f:
        await f.write(await file.read())

    lab = LabReport(
        patient_id  = patient_id,
        uploaded_by = user.id,
        file_path   = str(fpath),
        report_type = report_type,
        notes       = notes,
    )
    db.add(lab)
    await db.commit()
    await db.refresh(lab)
    return _lab_dict(lab)


@router.patch("/{patient_id}/assign")
async def assign_clinician(
    patient_id:   str,
    clinician_id: str        = Form(...),
    db:           AsyncSession = Depends(get_db),
    _:            User         = Depends(require_clinician),
):
    """Assign a patient to a clinician (clinician-only)."""
    pat_q = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    patient = pat_q.scalar_one_or_none()
    if not patient:
        raise HTTPException(404, "Patient not found.")

    patient.assigned_clinician_id = clinician_id
    await db.commit()
    return {"ok": True}


@router.get("/{patient_id}/lab-reports/{lab_id}/download")
async def download_lab_report(
    patient_id: str,
    lab_id:     str,
    db:         AsyncSession = Depends(get_db),
    user:       User         = Depends(get_current_user),
):
    from fastapi.responses import FileResponse

    q = await db.execute(
        select(LabReport).where(
            LabReport.id == lab_id,
            LabReport.patient_id == patient_id,
        )
    )
    lab = q.scalar_one_or_none()
    if not lab:
        raise HTTPException(404, "Lab report not found.")

    fpath = Path(lab.file_path)
    if not fpath.exists():
        raise HTTPException(404, "File missing from storage.")

    return FileResponse(
        path       = str(fpath),
        media_type = "application/pdf",
        filename   = f"lab_report_{lab_id[:8]}.pdf",
    )
