"""
services/report_generator.py
-----------------------------
Generates a clinical PDF report using ReportLab.

Contents:
  • Header with hospital logo placeholder + patient info
  • Dermoscopy image + segmentation overlay side by side
  • Classification result + 3-class confidence bar
  • Biopsy recommendation box (red if recommended, green if not)
  • Feature table (all ~150 values, grouped by category)
  • Footer with disclaimer
"""

from __future__ import annotations

from pathlib import Path
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable, Image, Paragraph, SimpleDocTemplate,
    Spacer, Table, TableStyle,
)


# ---------------------------------------------------------------------------
# Colour constants
# ---------------------------------------------------------------------------
TEAL       = colors.HexColor("#0D7A6B")
LIGHT_TEAL = colors.HexColor("#E1F5EE")
RED_BG     = colors.HexColor("#FCEBEB")
RED_TEXT   = colors.HexColor("#A32D2D")
GREEN_BG   = colors.HexColor("#EAF3DE")
GREEN_TEXT = colors.HexColor("#3B6D11")
GRAY_BG    = colors.HexColor("#F1EFE8")
DARK_TEXT  = colors.HexColor("#2C2C2A")


# ---------------------------------------------------------------------------
# Feature categories for grouping in the report table
# ---------------------------------------------------------------------------
_FEATURE_GROUPS = {
    "Asymmetry":      ["asym_axis_aligned", "asym_pca", "compactness",
                       "elongation", "axis_ratio"],
    "Border":         ["border_irregularity", "fractal_dim", "convexity",
                       "solidity", "edge_grad_mean", "edge_grad_std"],
    "Color (RGB)":    [f"color_rgb_ch{i}_{s}"
                       for i in range(3)
                       for s in ("mean","std","skew","kurt","entropy")],
    "Color (HSV)":    [f"color_hsv_ch{i}_{s}"
                       for i in range(3)
                       for s in ("mean","std","skew","kurt","entropy")],
    "Color (LAB)":    [f"color_lab_ch{i}_{s}"
                       for i in range(3)
                       for s in ("mean","std","skew","kurt","entropy")],
    "Texture GLCM":   [f"glcm_{k}_{s}"
                       for k in ("contrast","dissimilarity","homogeneity",
                                 "energy","correlation")
                       for s in ("mean","std")],
    "Texture LBP":    ["lbp_mean", "lbp_std", "lbp_entropy"],
    "Gabor":          [f"gabor_s{s}_a{a}_energy"
                       for s in (3,5,9) for a in (0,45,90,135)],
    "Shape":          ["shape_perimeter", "shape_area", "shape_sphericity",
                       "shape_roundness", "shape_pd_ratio",
                       "shape_max_diameter", "shape_min_diameter"],
    "GLRLM":          ["glrlm_sre", "glrlm_lre", "glrlm_gln",
                       "glrlm_rln", "glrlm_rp", "glrlm_lgre", "glrlm_hgre"],
    "Histogram":      ["hist_energy", "hist_entropy", "hist_mean",
                       "hist_variance", "hist_kurtosis", "hist_skewness",
                       "hist_p10", "hist_p25", "hist_p75", "hist_p90",
                       "hist_iqr", "hist_range", "hist_rms",
                       "hist_uniformity", "hist_median", "hist_mad"],
    "Hu Moments":     [f"hu_moment_{i}" for i in range(1, 8)],
    "Fourier":        [f"fourier_desc_{i}" for i in range(1, 11)],
    "Evolution":      ["lesion_to_image_ratio", "bbox_fill_ratio", "extent",
                       "major_axis", "minor_axis", "eccentricity"],
}

PREDICTION_LABELS = {
    "melanoma":             "Melanoma",
    "nevi":                 "Melanocytic Nevi",
    "seborrheic_keratosis": "Seborrheic Keratosis",
    "unknown":              "Unknown",
}


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def generate_pdf_report(
    output_path:       Path,
    image_path:        Path,
    overlay_path:      Path,
    prediction:        str,
    confidence:        dict[str, float],
    features:          dict[str, float],
    biopsy_recommended: bool,
    biopsy_reason:     str,
    patient_name:      str = "Unknown",
) -> None:
    """
    Generate a clinical PDF report and write it to output_path.
    All parameters except output_path match PipelineResult fields.
    """
    doc    = SimpleDocTemplate(
        str(output_path),
        pagesize     = A4,
        leftMargin   = 2*cm, rightMargin  = 2*cm,
        topMargin    = 2*cm, bottomMargin = 2*cm,
    )
    styles = getSampleStyleSheet()
    story  = []

    # ── Styles ──────────────────────────────────────────────────────
    h1 = ParagraphStyle("h1", fontSize=18, textColor=TEAL,
                         spaceAfter=4, fontName="Helvetica-Bold")
    h2 = ParagraphStyle("h2", fontSize=12, textColor=DARK_TEXT,
                         spaceAfter=6, fontName="Helvetica-Bold",
                         spaceBefore=14)
    body = ParagraphStyle("body", fontSize=9, textColor=DARK_TEXT,
                           leading=14)
    small = ParagraphStyle("small", fontSize=8,
                            textColor=colors.HexColor("#888780"), leading=11)
    center = ParagraphStyle("center", fontSize=9, alignment=TA_CENTER,
                             textColor=DARK_TEXT)

    # ── Header ───────────────────────────────────────────────────────
    story.append(Paragraph("DermaScan Clinical Report", h1))
    story.append(HRFlowable(width="100%", thickness=1,
                             color=TEAL, spaceAfter=8))

    meta = [
        ["Patient:",      patient_name,
         "Date:",         datetime.now().strftime("%d %B %Y  %H:%M")],
        ["Prediction:",   PREDICTION_LABELS.get(prediction, prediction),
         "Analysis ID:",  str(output_path.stem)[:16]],
    ]
    meta_tbl = Table(meta, colWidths=[3*cm, 7*cm, 3*cm, 5.5*cm])
    meta_tbl.setStyle(TableStyle([
        ("FONTNAME",   (0,0),(-1,-1), "Helvetica"),
        ("FONTSIZE",   (0,0),(-1,-1), 9),
        ("FONTNAME",   (0,0),(0,-1),  "Helvetica-Bold"),
        ("FONTNAME",   (2,0),(2,-1),  "Helvetica-Bold"),
        ("TEXTCOLOR",  (0,0),(-1,-1), DARK_TEXT),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── Images side by side ──────────────────────────────────────────
    story.append(Paragraph("Dermoscopy Images", h2))

    img_w = 8.2*cm
    img_h = 6.0*cm

    def _img_cell(path: Path, caption: str) -> list:
        if path and path.exists():
            return [Image(str(path), width=img_w, height=img_h),
                    Paragraph(caption, center)]
        return [Paragraph(f"[{caption} not available]", center), ""]

    img_data = [_img_cell(image_path, "Original"),
                _img_cell(overlay_path, "Segmentation overlay")]
    img_tbl  = Table([img_data], colWidths=[img_w + 0.5*cm, img_w + 0.5*cm])
    img_tbl.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                                  ("ALIGN",  (0,0), (-1,-1), "CENTER")]))
    story.append(img_tbl)
    story.append(Spacer(1, 0.3*cm))

    # ── Classification result ────────────────────────────────────────
    story.append(Paragraph("Classification Result", h2))

    conf_rows = [["Class", "Confidence", "Bar"]]
    for label, key in [
        ("Melanoma",             "melanoma"),
        ("Melanocytic Nevi",     "nevi"),
        ("Seborrheic Keratosis", "seborrheic_keratosis"),
    ]:
        score = confidence.get(key, 0.0)
        bar   = "█" * int(score * 30) + "░" * (30 - int(score * 30))
        conf_rows.append([label, f"{score:.1%}", bar])

    conf_tbl = Table(conf_rows, colWidths=[5.5*cm, 3*cm, 10*cm])
    conf_tbl.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,0),  TEAL),
        ("TEXTCOLOR",   (0,0), (-1,0),  colors.white),
        ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,-1), 9),
        ("BACKGROUND",  (0,1), (-1,-1), GRAY_BG),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, GRAY_BG]),
        ("GRID",        (0,0), (-1,-1), 0.5, colors.HexColor("#D3D1C7")),
        ("ALIGN",       (1,0), (1,-1),  "CENTER"),
        ("FONTNAME",    (0,0), (-1,-1), "Helvetica"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
    ]))
    story.append(conf_tbl)
    story.append(Spacer(1, 0.3*cm))

    # ── Biopsy recommendation box ────────────────────────────────────
    story.append(Paragraph("Biopsy Recommendation", h2))

    if biopsy_recommended:
        bx_bg, bx_fg = RED_BG, RED_TEXT
        bx_title = "⚠  BIOPSY ESCALATION RECOMMENDED"
    else:
        bx_bg, bx_fg = GREEN_BG, GREEN_TEXT
        bx_title = "✓  NO IMMEDIATE BIOPSY REQUIRED"

    biopsy_style = ParagraphStyle(
        "biopsy", fontSize=10, textColor=bx_fg,
        fontName="Helvetica-Bold", backColor=bx_bg,
        borderPad=8, leading=16,
    )
    reason_style = ParagraphStyle(
        "reason", fontSize=9, textColor=bx_fg,
        backColor=bx_bg, borderPad=8, leading=14,
    )
    story.append(Paragraph(bx_title, biopsy_style))
    story.append(Paragraph(biopsy_reason or "—", reason_style))
    story.append(Spacer(1, 0.4*cm))

    # ── Feature table ────────────────────────────────────────────────
    story.append(Paragraph("Extracted Lesion Features", h2))
    story.append(Paragraph(
        "All quantitative features extracted from the segmented lesion region. "
        "Values are provided to aid clinical interpretation.",
        body,
    ))
    story.append(Spacer(1, 0.2*cm))

    for group_name, keys in _FEATURE_GROUPS.items():
        group_rows = [
            [Paragraph(f"<b>{group_name}</b>", body), "", "", ""],
        ]
        row_buf = []
        for k in keys:
            v = features.get(k)
            if v is None:
                continue
            row_buf.append((k, f"{v:.4f}"))
            if len(row_buf) == 2:
                group_rows.append([
                    row_buf[0][0], row_buf[0][1],
                    row_buf[1][0], row_buf[1][1],
                ])
                row_buf = []
        if row_buf:
            group_rows.append([row_buf[0][0], row_buf[0][1], "", ""])

        if len(group_rows) <= 1:
            continue

        feat_tbl = Table(group_rows, colWidths=[6.5*cm, 3*cm, 6.5*cm, 3*cm])
        feat_tbl.setStyle(TableStyle([
            ("SPAN",        (0,0), (-1,0)),
            ("BACKGROUND",  (0,0), (-1,0),  LIGHT_TEAL),
            ("FONTNAME",    (0,0), (-1,-1),  "Helvetica"),
            ("FONTSIZE",    (0,0), (-1,-1),  8),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, GRAY_BG]),
            ("GRID",        (0,0), (-1,-1),  0.3, colors.HexColor("#D3D1C7")),
            ("BOTTOMPADDING", (0,0), (-1,-1), 3),
            ("TOPPADDING",    (0,0), (-1,-1), 3),
        ]))
        story.append(feat_tbl)
        story.append(Spacer(1, 0.15*cm))

    # ── Footer / disclaimer ──────────────────────────────────────────
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=0.5,
                             color=colors.HexColor("#D3D1C7")))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "DISCLAIMER: This report is generated by an AI-assisted system and is "
        "intended to support, not replace, clinical judgment. All results must "
        "be reviewed and interpreted by a qualified dermatologist or clinician. "
        "This system is not approved as a standalone diagnostic device.",
        small,
    ))

    doc.build(story)
