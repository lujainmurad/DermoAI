# DermaScan — Skin Lesion Analysis Platform

A clinical web application for dermoscopy image analysis using deep learning.

## Architecture
- **Backend**: FastAPI + ResNetUNetV4 segmentation + feature extraction + classification
- **Frontend**: React (Phase 3 — coming soon)
- **Database**: SQLite (persists in Codespaces)
- **Hosting**: GitHub Codespaces (backend) + Vercel (frontend)

## Setup
See the setup guide for complete step-by-step instructions.

### Quick start (in Codespaces)
```bash
cd backend
cp .env.example .env
# Edit .env: set DEVICE=cpu, USE_TTA=false, SECRET_KEY=...
# Upload best_model.pt to backend/ml/models/
python test_pipeline.py
uvicorn main:app --reload --port 8000
```

## Project Structure
```
.devcontainer/        ← Codespaces auto-setup config
backend/
  main.py             ← FastAPI app entry point
  config.py           ← All paths and settings
  database.py         ← SQLAlchemy models (6 tables)
  test_pipeline.py    ← Run this first to verify ML works
  ml/
    model_def.py      ← ResNetUNetV4 architecture
    segmentation.py   ← Load model + TTA inference
    feature_extraction.py  ← ABCDE + texture + radiomics
    classifier.py     ← 3-class melanoma classifier
    pipeline.py       ← Orchestrates all 3 steps
  routers/
    auth.py           ← Login, register, JWT
    inference.py      ← POST /api/analyze (main endpoint)
    patients.py       ← Patient profiles + history
    clinicians.py     ← Clinician list + slots
    bookings.py       ← Appointment booking
  services/
    report_generator.py  ← PDF report with ReportLab
```
