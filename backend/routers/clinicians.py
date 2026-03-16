"""
routers/clinicians.py
---------------------
GET /api/clinicians            — list all registered clinicians (for booking)
GET /api/clinicians/{id}       — single clinician profile
GET /api/clinicians/{id}/slots — available appointment slots
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import ClinicianProfile, User, get_db
from routers.auth import get_current_user

router = APIRouter(prefix="/api/clinicians", tags=["clinicians"])

# Pre-defined slot times (in a real app these come from a scheduling table)
_SLOT_TIMES = [
    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
    "11:00", "11:30", "13:00", "13:30", "14:00", "14:30",
    "15:00", "15:30", "16:00", "16:30",
]


def _cli_dict(cli: ClinicianProfile) -> dict:
    u = cli.user
    return {
        "id":             cli.id,
        "user_id":        cli.user_id,
        "full_name":      u.full_name if u else "",
        "email":          u.email     if u else "",
        "specialty":      cli.specialty,
        "hospital":       cli.hospital,
        "license_number": cli.license_number,
        "bio":            cli.bio,
    }


@router.get("")
async def list_clinicians(
    db: AsyncSession = Depends(get_db),
    _:  User         = Depends(get_current_user),
):
    q = await db.execute(
        select(ClinicianProfile)
        .options(selectinload(ClinicianProfile.user))
    )
    return [_cli_dict(c) for c in q.scalars().all()]


@router.get("/{clinician_id}")
async def get_clinician(
    clinician_id: str,
    db:           AsyncSession = Depends(get_db),
    _:            User         = Depends(get_current_user),
):
    q = await db.execute(
        select(ClinicianProfile)
        .options(selectinload(ClinicianProfile.user))
        .where(ClinicianProfile.id == clinician_id)
    )
    cli = q.scalar_one_or_none()
    if not cli:
        raise HTTPException(404, "Clinician not found.")
    return _cli_dict(cli)


@router.get("/{clinician_id}/slots")
async def get_slots(
    clinician_id: str,
    date:         str,              # query param: ?date=2025-08-01
    db:           AsyncSession = Depends(get_db),
    _:            User         = Depends(get_current_user),
):
    """Return available time slots for a clinician on a given date."""
    from database import Booking
    from sqlalchemy import and_

    # Get booked slots for this date
    q = await db.execute(
        select(Booking).where(
            and_(
                Booking.clinician_id  == clinician_id,
                Booking.slot_datetime.like(f"{date}%"),
                Booking.status        != "cancelled",
            )
        )
    )
    booked_times = {b.slot_datetime.split("T")[-1][:5]
                    for b in q.scalars().all()}

    slots = [
        {"time": t, "datetime": f"{date}T{t}:00",
         "available": t not in booked_times}
        for t in _SLOT_TIMES
    ]
    return {"date": date, "clinician_id": clinician_id, "slots": slots}
