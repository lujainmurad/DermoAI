"""
main.py
-------
FastAPI application entry point.

Key design decisions:
  • Pipeline is loaded ONCE on startup via lifespan context manager
    and stored in app.state — never reloaded per request
  • All routers are mounted under /api/
  • CORS is configured to allow the React frontend origin
  • Tables are created on startup (SQLite, idempotent)

Run locally:
    cd backend
    uvicorn main:app --reload --port 8000

Run on Kaggle (see kaggle_notebook.py):
    uvicorn main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import config
from database import create_tables
from ml.pipeline import DermoscopyPipeline
from routers import auth, bookings, clinicians, inference, patients

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s  %(levelname)-7s  %(name)s — %(message)s",
    datefmt= "%H:%M:%S",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan: load heavy ML models once, reuse for every request
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────
    log.info("Creating database tables…")
    await create_tables()

    log.info("Loading DermoscopyPipeline…")
    try:
        app.state.pipeline = DermoscopyPipeline.from_config(config)
        log.info("Pipeline loaded ✓")
    except Exception as exc:
        log.error("Failed to load pipeline: %s", exc)
        log.warning("Server will start but /api/analyze will return 500 until fixed.")
        app.state.pipeline = None

    yield   # ← app runs here

    # ── Shutdown ───────────────────────────────────────────────────────
    log.info("Shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title       = "DermaScan API",
    description = "Skin lesion analysis: segmentation, feature extraction, classification.",
    version     = "1.0.0",
    lifespan    = lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = config.CORS_ORIGINS + ["*"],   # * makes Kaggle→Vercel easy
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(inference.router)
app.include_router(patients.router)
app.include_router(clinicians.router)
app.include_router(bookings.router)

# ── Static file serving (uploaded images, generated reports) ───────────────
# These are served at /uploads/<filename> and /reports/<filename>
app.mount("/uploads",     StaticFiles(directory=str(config.UPLOAD_DIR)),     name="uploads")
app.mount("/reports",     StaticFiles(directory=str(config.REPORTS_DIR)),    name="reports")
app.mount("/lab-reports", StaticFiles(directory=str(config.LAB_REPORTS_DIR)),name="lab_reports")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    pipeline_ok = app.state.pipeline is not None
    return {
        "status":       "ok" if pipeline_ok else "degraded",
        "pipeline":     "loaded" if pipeline_ok else "not loaded",
        "classifier":   (
            "ok"      if pipeline_ok and app.state.pipeline._clf else
            "missing" if pipeline_ok else
            "unknown"
        ),
        "version": "1.0.0",
    }


@app.get("/")
async def root():
    return {"message": "DermaScan API — visit /docs for Swagger UI"}
