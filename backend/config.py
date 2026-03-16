"""
config.py
---------
Single source of truth for all backend configuration.
Values are read from environment variables or fall back to sensible
local-development defaults.

Copy .env.example to .env and fill in your values before running.
"""

import os
from pathlib import Path

# ── Project root (backend/ directory) ──────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent


# ── ML model paths ──────────────────────────────────────────────────────
# Drop your best_model.pt into backend/ml/models/
SEG_MODEL_PATH = Path(
    os.getenv("SEG_MODEL_PATH", str(BASE_DIR / "ml" / "models" / "best_model.pt"))
)

# After running Script 4, save the best model with:
#   import joblib, json
#   joblib.dump(best_model, "backend/ml/models/classifier.joblib")
#   json.dump(feature_cols, open("backend/ml/models/feature_names.json", "w"))
CLF_MODEL_PATH = Path(
    os.getenv("CLF_MODEL_PATH", str(BASE_DIR / "ml" / "models" / "classifier.joblib"))
)
CLF_FEATURE_NAMES_PATH = Path(
    os.getenv("CLF_FEATURE_NAMES_PATH",
              str(BASE_DIR / "ml" / "models" / "feature_names.json"))
)

# Set to True once you have saved the classifier.joblib and feature_names.json
CLASSIFIER_AVAILABLE = os.getenv("CLASSIFIER_AVAILABLE", "false").lower() == "true"


# ── Inference settings ──────────────────────────────────────────────────
DEVICE  = os.getenv("DEVICE", "cpu")   # "cuda" if GPU available
USE_TTA = os.getenv("USE_TTA", "true").lower() == "true"


# ── Database ────────────────────────────────────────────────────────────
# SQLite for local dev; swap for postgresql://... in production
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'dermoscopy.db'}"
)


# ── Security ────────────────────────────────────────────────────────────
SECRET_KEY        = os.getenv("SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_USE_LONG_RANDOM_STRING")
ALGORITHM         = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours


# ── File storage ────────────────────────────────────────────────────────
UPLOAD_DIR      = Path(os.getenv("UPLOAD_DIR",      str(BASE_DIR / "uploads")))
REPORTS_DIR     = Path(os.getenv("REPORTS_DIR",     str(BASE_DIR / "reports")))
LAB_REPORTS_DIR = Path(os.getenv("LAB_REPORTS_DIR", str(BASE_DIR / "lab_reports")))

# Create directories on startup if they don't exist
for _dir in (UPLOAD_DIR, REPORTS_DIR, LAB_REPORTS_DIR,
             SEG_MODEL_PATH.parent):
    _dir.mkdir(parents=True, exist_ok=True)


# ── CORS ────────────────────────────────────────────────────────────────
# React dev server runs on port 3000
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")


# ── Google Maps ─────────────────────────────────────────────────────────
# Used by the patient NearbyMap page (frontend uses this key directly)
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
