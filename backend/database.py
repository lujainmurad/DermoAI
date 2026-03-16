"""
database.py
-----------
SQLAlchemy ORM models + async session factory.
Uses SQLite for local/Kaggle development (zero-config).
Swap DATABASE_URL to postgresql://... for production.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float,
    ForeignKey, JSON, String, Text
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship

import config

# ---------------------------------------------------------------------------
# Engine + session factory
# ---------------------------------------------------------------------------

# aiosqlite for local/Kaggle SQLite; swap driver for postgres in prod
_db_url = config.DATABASE_URL.replace("sqlite:///", "sqlite+aiosqlite:///")

engine = create_async_engine(_db_url, echo=False, future=True)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a DB session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_tables() -> None:
    """Create all tables on startup (idempotent)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id           = Column(String, primary_key=True, default=_uuid)
    email        = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name    = Column(String, nullable=False)
    role         = Column(Enum("patient", "clinician", name="user_role"),
                          nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow)

    # Relationships
    clinician_profile = relationship("ClinicianProfile", back_populates="user",
                                      uselist=False, cascade="all, delete-orphan")
    patient_profile   = relationship("PatientProfile",   back_populates="user",
                                      uselist=False, cascade="all, delete-orphan")


class ClinicianProfile(Base):
    __tablename__ = "clinician_profiles"

    id             = Column(String, primary_key=True, default=_uuid)
    user_id        = Column(String, ForeignKey("users.id"), nullable=False, unique=True)
    specialty      = Column(String, default="Dermatology")
    hospital       = Column(String, default="")
    license_number = Column(String, default="")
    bio            = Column(Text, default="")

    user     = relationship("User", back_populates="clinician_profile")
    patients = relationship("PatientProfile", back_populates="assigned_clinician",
                             foreign_keys="PatientProfile.assigned_clinician_id")
    bookings = relationship("Booking", back_populates="clinician",
                             foreign_keys="Booking.clinician_id")


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id                   = Column(String, primary_key=True, default=_uuid)
    user_id              = Column(String, ForeignKey("users.id"), nullable=False, unique=True)
    date_of_birth        = Column(String, default="")   # stored as ISO date string
    assigned_clinician_id = Column(String,
                                   ForeignKey("clinician_profiles.id"),
                                   nullable=True)
    medical_notes        = Column(Text, default="")

    user               = relationship("User", back_populates="patient_profile")
    assigned_clinician = relationship("ClinicianProfile",
                                       back_populates="patients",
                                       foreign_keys=[assigned_clinician_id])
    analyses   = relationship("Analysis",   back_populates="patient",
                               cascade="all, delete-orphan")
    lab_reports = relationship("LabReport", back_populates="patient",
                                cascade="all, delete-orphan")
    bookings    = relationship("Booking",   back_populates="patient",
                                foreign_keys="Booking.patient_id")


class Analysis(Base):
    """One dermoscopy analysis run — stores results + paths to files."""
    __tablename__ = "analyses"

    id                 = Column(String, primary_key=True, default=_uuid)
    patient_id         = Column(String, ForeignKey("patient_profiles.id"), nullable=False)
    uploaded_by        = Column(String, ForeignKey("users.id"),  nullable=False)

    # Stored file paths (relative to UPLOAD_DIR / REPORTS_DIR)
    image_path         = Column(String, nullable=False)
    mask_path          = Column(String, default="")
    overlay_path       = Column(String, default="")
    report_pdf_path    = Column(String, default="")

    # ML results
    prediction         = Column(String, default="unknown")
    confidence_json    = Column(JSON,   default=dict)     # {"melanoma": 0.87, ...}
    features_json      = Column(JSON,   default=dict)     # ~150 feature values
    biopsy_recommended = Column(Boolean, default=False)
    biopsy_reason      = Column(String,  default="")
    inference_time_ms  = Column(Float,   default=0.0)
    segmentation_ok    = Column(Boolean, default=True)
    classifier_ok      = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    patient     = relationship("PatientProfile", back_populates="analyses")
    uploader    = relationship("User", foreign_keys=[uploaded_by])


class LabReport(Base):
    """Lab-uploaded PDF reports linked to a patient."""
    __tablename__ = "lab_reports"

    id          = Column(String, primary_key=True, default=_uuid)
    patient_id  = Column(String, ForeignKey("patient_profiles.id"), nullable=False)
    uploaded_by = Column(String, ForeignKey("users.id"),  nullable=False)
    file_path   = Column(String, nullable=False)
    report_type = Column(String, default="Lab Report")
    notes       = Column(Text,   default="")
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    patient  = relationship("PatientProfile", back_populates="lab_reports")
    uploader = relationship("User", foreign_keys=[uploaded_by])


class Booking(Base):
    __tablename__ = "bookings"

    id            = Column(String, primary_key=True, default=_uuid)
    patient_id    = Column(String, ForeignKey("patient_profiles.id"), nullable=False)
    clinician_id  = Column(String, ForeignKey("clinician_profiles.id"), nullable=False)
    slot_datetime = Column(String, nullable=False)   # ISO datetime string
    status        = Column(
        Enum("pending", "confirmed", "cancelled", name="booking_status"),
        default="pending",
    )
    notes      = Column(Text,     default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    patient   = relationship("PatientProfile",  back_populates="bookings",
                              foreign_keys=[patient_id])
    clinician = relationship("ClinicianProfile", back_populates="bookings",
                              foreign_keys=[clinician_id])
