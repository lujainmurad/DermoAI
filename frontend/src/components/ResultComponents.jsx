import React from 'react';

// ── Confidence bars ───────────────────────────────────────────────────────
export function ConfidenceBar({ confidence = {} }) {
  const classes = [
    { key: 'melanoma',             label: 'Melanoma',             cls: 'melanoma'   },
    { key: 'nevi',                 label: 'Melanocytic Nevi',     cls: 'nevi'       },
    { key: 'seborrheic_keratosis', label: 'Seborrheic Keratosis', cls: 'seborrheic' },
  ];

  return (
    <div>
      {classes.map(({ key, label, cls }) => {
        const score = confidence[key] ?? 0;
        return (
          <div className="conf-bar-wrap" key={key}>
            <div className="conf-bar-label">
              <strong>{label}</strong>
              <span>{(score * 100).toFixed(1)}%</span>
            </div>
            <div className="conf-bar-track">
              <div
                className={`conf-bar-fill ${cls}`}
                style={{ width: `${(score * 100).toFixed(1)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Mask overlay ──────────────────────────────────────────────────────────
export function MaskOverlay({ overlayB64, width = '100%' }) {
  if (!overlayB64) return null;
  return (
    <div style={{ borderRadius: 'var(--r-md)', overflow: 'hidden', width }}>
      <img
        src={`data:image/png;base64,${overlayB64}`}
        alt="Segmentation overlay"
        style={{ width: '100%', display: 'block' }}
      />
    </div>
  );
}

// ── Biopsy alert ──────────────────────────────────────────────────────────
export function BiopsyAlert({ recommended, reason }) {
  return (
    <div className={`biopsy-alert ${recommended ? 'recommend' : 'no-recommend'}`}>
      <div className="biopsy-alert-icon">
        {recommended ? '⚠️' : '✅'}
      </div>
      <div>
        <div className="biopsy-alert-title">
          {recommended
            ? 'Biopsy escalation recommended'
            : 'No immediate biopsy required'}
        </div>
        <div className="biopsy-alert-reason">{reason}</div>
      </div>
    </div>
  );
}

// ── Prediction badge ──────────────────────────────────────────────────────
export function PredictionBadge({ prediction }) {
  const map = {
    melanoma:             { label: 'Melanoma',             cls: 'badge-red'   },
    nevi:                 { label: 'Melanocytic Nevi',     cls: 'badge-teal'  },
    seborrheic_keratosis: { label: 'Seborrheic Keratosis', cls: 'badge-blue'  },
    unknown:              { label: 'Unknown',              cls: 'badge-amber' },
  };
  const { label, cls } = map[prediction] || map.unknown;
  return <span className={`badge ${cls}`} style={{ fontSize: 14, padding: '5px 14px' }}>{label}</span>;
}
