"""
routers/bookings.py
-------------------
POST /api/bookings              — patient books an appointment
GET  /api/bookings/mine         — patient sees their appointments
GET  /api/bookings/clinician    — clinician sees their appointments
PATCH /api/bookings/{id}/status — clinician confirms or cancels
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import Booking, ClinicianProfile, PatientProfile, User, get_db
from routers.auth import get_current_user, require_clinician

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


class BookingRequest(BaseModel):
    clinician_id:  str
    slot_datetime: str   # ISO e.g. "2025-08-01T09:00:00"
    notes:         str = ""


def _booking_dict(b: Booking) -> dict:
    return {
        "id":            b.id,
        "patient_id":    b.patient_id,
        "clinician_id":  b.clinician_id,
        "slot_datetime": b.slot_datetime,
        "status":        b.status,
        "notes":         b.notes,
        "created_at":    b.created_at.isoformat(),
        # populated after eager-load
        "patient_name":  (b.patient.user.full_name
                          if b.patient and b.patient.user else ""),
        "clinician_name": (b.clinician.user.full_name
                           if b.clinician and b.clinician.user else ""),
    }


@router.post("", status_code=201)
async def create_booking(
    body: BookingRequest,
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    # Get patient profile for requesting user
    pat_q = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == user.id)
    )
    patient = pat_q.scalar_one_or_none()
    if not patient:
        raise HTTPException(400, "Patient profile not found for this user.")

    # Check slot isn't already taken
    from sqlalchemy import and_
    conflict_q = await db.execute(
        select(Booking).where(
            and_(
                Booking.clinician_id  == body.clinician_id,
                Booking.slot_datetime == body.slot_datetime,
                Booking.status        != "cancelled",
            )
        )
    )
    if conflict_q.scalar_one_or_none():
        raise HTTPException(409, "This slot is already booked.")

    booking = Booking(
        patient_id    = patient.id,
        clinician_id  = body.clinician_id,
        slot_datetime = body.slot_datetime,
        notes         = body.notes,
        status        = "pending",
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    return {"id": booking.id, "status": booking.status,
            "slot_datetime": booking.slot_datetime}


@router.get("/mine")
async def my_bookings(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(get_current_user),
):
    pat_q = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == user.id)
    )
    patient = pat_q.scalar_one_or_none()
    if not patient:
        return []

    q = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.clinician).selectinload(ClinicianProfile.user),
        )
        .where(Booking.patient_id == patient.id)
        .order_by(Booking.slot_datetime)
    )
    return [_booking_dict(b) for b in q.scalars().all()]


@router.get("/clinician")
async def clinician_bookings(
    db:   AsyncSession = Depends(get_db),
    user: User         = Depends(require_clinician),
):
    cli_q = await db.execute(
        select(ClinicianProfile).where(ClinicianProfile.user_id == user.id)
    )
    cli = cli_q.scalar_one_or_none()
    if not cli:
        return []

    q = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.patient).selectinload(PatientProfile.user),
        )
        .where(Booking.clinician_id == cli.id)
        .order_by(Booking.slot_datetime)
    )
    return [_booking_dict(b) for b in q.scalars().all()]


@router.patch("/{booking_id}/status")
async def update_status(
    booking_id: str,
    status:     str,        # query param: ?status=confirmed
    db:         AsyncSession = Depends(get_db),
    _:          User         = Depends(require_clinician),
):
    if status not in ("confirmed", "cancelled"):
        raise HTTPException(400, "status must be 'confirmed' or 'cancelled'")

    q = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = q.scalar_one_or_none()
    if not booking:
        raise HTTPException(404, "Booking not found.")

    booking.status = status
    await db.commit()
    return {"id": booking.id, "status": booking.status}
