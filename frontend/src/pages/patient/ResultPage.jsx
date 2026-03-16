import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Nav from '../../components/Nav';
import { ConfidenceBar, MaskOverlay, BiopsyAlert, PredictionBadge } from '../../components/ResultComponents';
import { inferenceAPI } from '../../api';
import toast from 'react-hot-toast';

const NAV_LINKS = [
  { label: 'Home', path: '/patient' },
  { label: 'Book appointment', path: '/patient/book' },
  { label: 'Nearby clinics', path: '/patient/nearby' },
];

export default function ResultPage() {
  const { analysisId } = useParams();
  const location        = useLocation();
  const navigate        = useNavigate();
  const [result, setResult] = useState(location.state?.result || null);
  const [loading, setLoading] = useState(!result);

  useEffect(() => {
    if (!result) {
      inferenceAPI.getAnalysis(analysisId)
        .then(r => setResult(r.data))
        .catch(() => toast.error('Could not load result.'))
        .finally(() => setLoading(false));
    }
  }, [analysisId, result]);

  const downloadReport = async () => {
    try {
      const { data } = await inferenceAPI.downloadReport(analysisId);
      const url  = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `dermascan_report_${analysisId.slice(0, 8)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Report not yet available. Try again in a moment.');
    }
  };

  if (loading) return (
    <div className="page">
      <Nav links={NAV_LINKS} />
      <div className="loading-wrap"><div className="spinner" /><p>Loading result…</p></div>
    </div>
  );

  if (!result) return (
    <div className="page">
      <Nav links={NAV_LINKS} />
      <div className="empty-state"><div className="empty-state-icon">❌</div><h3>Result not found</h3></div>
    </div>
  );

  const isMelanoma = result.prediction === 'melanoma';

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />

      <div className="container" style={{ padding: '40px 24px' }}>
        {/* Header */}
        <div className="fade-up" style={styles.header}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
              Analysis result
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <h1 style={{ fontSize: 28 }}>Lesion Analysis</h1>
              <PredictionBadge prediction={result.prediction} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {result.report_available && (
              <button className="btn btn-secondary" onClick={downloadReport}>
                📄 Download report
              </button>
            )}
            {isMelanoma && (
              <button className="btn btn-primary" onClick={() => navigate('/patient/book')}>
                📅 Book appointment
              </button>
            )}
          </div>
        </div>

        <div style={styles.grid}>
          {/* Left col — image */}
          <div>
            <div className="card fade-up-delay-1" style={{ marginBottom: 20 }}>
              <h3 style={styles.cardTitle}>Segmentation overlay</h3>
              <p style={styles.cardDesc}>
                Red region shows the detected lesion boundary
              </p>
              {result.overlay_b64 ? (
                <MaskOverlay overlayB64={result.overlay_b64} />
              ) : (
                <div style={styles.noOverlay}>
                  Overlay image not available
                </div>
              )}
            </div>

            {/* Biopsy */}
            <div className="fade-up-delay-2">
              <BiopsyAlert
                recommended={result.biopsy_recommended}
                reason={result.biopsy_reason}
              />
            </div>

            {/* Actions */}
            {isMelanoma && (
              <div className="card fade-up-delay-3" style={{ marginTop: 20 }}>
                <h3 style={styles.cardTitle}>Recommended next steps</h3>
                {[
                  { icon: '📅', text: 'Book a dermatology appointment', path: '/patient/book' },
                  { icon: '🗺️', text: 'Find nearby dermatology clinics', path: '/patient/nearby' },
                ].map(({ icon, text, path }) => (
                  <button
                    key={path}
                    className="btn btn-secondary btn-full"
                    style={{ marginTop: 10, justifyContent: 'flex-start' }}
                    onClick={() => navigate(path)}
                  >
                    {icon} {text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right col — results */}
          <div>
            {/* Classification */}
            <div className="card fade-up-delay-1" style={{ marginBottom: 20 }}>
              <h3 style={styles.cardTitle}>Classification confidence</h3>
              {result.classifier_ok ? (
                <ConfidenceBar confidence={result.confidence} />
              ) : (
                <div style={styles.noClassifier}>
                  <span style={{ fontSize: 24 }}>⚙️</span>
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      Classifier not yet configured
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                      Segmentation and features were extracted successfully.
                      The clinician can view detailed features in the report.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Key features */}
            <div className="card fade-up-delay-2" style={{ marginBottom: 20 }}>
              <h3 style={styles.cardTitle}>Key clinical features</h3>
              <div style={styles.featuresGrid}>
                {[
                  ['Asymmetry',          (result.features?.asym_pca * 100 || 0).toFixed(1) + '%'],
                  ['Border irregularity', (result.features?.border_irregularity || 0).toFixed(3)],
                  ['Colour spread',       (result.features?.color_dominant_spread || 0).toFixed(1)],
                  ['Lesion coverage',     (result.features?.lesion_to_image_ratio * 100 || 0).toFixed(1) + '%'],
                  ['Fractal dimension',   (result.features?.fractal_dim || 0).toFixed(3)],
                  ['Sphericity',          (result.features?.shape_sphericity || 0).toFixed(3)],
                ].map(([label, val]) => (
                  <div key={label} style={styles.featureItem}>
                    <div style={styles.featureLabel}>{label}</div>
                    <div style={styles.featureVal}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Meta */}
            <div className="card fade-up-delay-3">
              <h3 style={styles.cardTitle}>Analysis details</h3>
              <div style={styles.metaGrid}>
                {[
                  ['Inference time', `${(result.inference_time_ms / 1000).toFixed(1)}s`],
                  ['Segmentation',   result.segmentation_ok ? '✓ Success' : '✗ Failed'],
                  ['Classifier',     result.classifier_ok   ? '✓ Active'  : '⚠ Not configured'],
                  ['Features',       `${Object.keys(result.features || {}).length} extracted`],
                ].map(([k, v]) => (
                  <div key={k} style={styles.metaRow}>
                    <span style={{ color: 'var(--text2)', fontSize: 13 }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={styles.disclaimer}>
                ⚠️ This AI analysis is a screening aid only and does not constitute a
                medical diagnosis. Please consult a qualified dermatologist.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
    gap: 16,
    flexWrap: 'wrap',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
  },
  cardTitle: { fontSize: 15, fontWeight: 600, marginBottom: 4 },
  cardDesc: { fontSize: 12, color: 'var(--text2)', marginBottom: 14 },
  noOverlay: {
    background: 'var(--bg3)',
    borderRadius: 'var(--r-md)',
    padding: '60px 20px',
    textAlign: 'center',
    color: 'var(--text3)',
    fontSize: 14,
  },
  noClassifier: {
    display: 'flex',
    gap: 14,
    alignItems: 'flex-start',
    background: 'var(--amber-dim)',
    border: '1px solid rgba(255,179,71,0.2)',
    borderRadius: 'var(--r-md)',
    padding: '14px 16px',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginTop: 12,
  },
  featureItem: {
    background: 'var(--bg3)',
    borderRadius: 'var(--r-sm)',
    padding: '10px 14px',
  },
  featureLabel: { fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  featureVal: { fontSize: 18, fontFamily: "'Syne', sans-serif", fontWeight: 600, color: 'var(--teal)' },
  metaGrid: { display: 'flex', flexDirection: 'column', gap: 10 },
  metaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  disclaimer: {
    marginTop: 16,
    fontSize: 11,
    color: 'var(--text3)',
    lineHeight: 1.6,
    borderTop: '1px solid var(--border)',
    paddingTop: 12,
  },
};
