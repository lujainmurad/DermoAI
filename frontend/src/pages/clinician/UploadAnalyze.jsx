import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Nav from '../../components/Nav';
import { ConfidenceBar, MaskOverlay, BiopsyAlert, PredictionBadge } from '../../components/ResultComponents';
import { inferenceAPI, patientAPI } from '../../api';
import toast from 'react-hot-toast';

const NAV_LINKS = [
  { label: 'Dashboard', path: '/clinician' },
  { label: 'Analyze',   path: '/clinician/analyze' },
  { label: 'Bookings',  path: '/clinician/bookings' },
];

export default function UploadAnalyze() {
  const navigate  = useNavigate();
  const fileRef   = useRef(null);

  const [patients,   setPatients]  = useState([]);
  const [patientId,  setPatientId] = useState('');
  const [file,       setFile]      = useState(null);
  const [preview,    setPreview]   = useState(null);
  const [loading,    setLoading]   = useState(false);
  const [step,       setStep]      = useState('');
  const [result,     setResult]    = useState(null);
  const [analysisId, setAnalysisId] = useState(null);

  useEffect(() => {
    patientAPI.list().then(r => setPatients(r.data)).catch(() => {});
  }, []);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
  };

  const analyze = async () => {
    if (!file)      { toast.error('Please select an image.'); return; }
    if (!patientId) { toast.error('Please select a patient.'); return; }

    setLoading(true);
    setResult(null);

    try {
      setStep('Uploading image…');
      setStep('Running segmentation (10–30s)…');
      const { data } = await inferenceAPI.analyze(file, patientId);
      setResult(data);
      setAnalysisId(data.analysis_id);
      toast.success('Analysis complete!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Analysis failed.');
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  const downloadReport = async () => {
    if (!analysisId) return;
    try {
      const { data } = await inferenceAPI.downloadReport(analysisId);
      const url  = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `report_${analysisId.slice(0, 8)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Report not available yet.');
    }
  };

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />
      <div className="container" style={{ padding: '48px 24px' }}>
        <div className="fade-up" style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 30, marginBottom: 8 }}>Dermoscopy analysis</h1>
          <p style={{ color: 'var(--text2)', fontWeight: 300 }}>
            Upload a dermoscopy image to run segmentation, feature extraction, and classification.
          </p>
        </div>

        <div style={styles.grid}>
          {/* Upload panel */}
          <div>
            <div className="card fade-up-delay-1" style={{ marginBottom: 20 }}>
              <h3 style={styles.sectionTitle}>1. Select patient</h3>
              <select
                className="form-input"
                value={patientId}
                onChange={e => setPatientId(e.target.value)}
                style={{ marginTop: 12 }}
              >
                <option value="">— Select a patient —</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
                ))}
              </select>
              {patients.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                  No assigned patients. Patients appear here once assigned to you.
                </p>
              )}
            </div>

            <div className="card fade-up-delay-1" style={{ marginBottom: 20 }}>
              <h3 style={styles.sectionTitle}>2. Upload dermoscopy image</h3>
              <div
                style={{
                  ...styles.dropZone,
                  borderColor: file ? 'var(--teal)' : 'var(--border2)',
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); }
                }}
              >
                {preview ? (
                  <img src={preview} alt="Preview" style={styles.preview} />
                ) : (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>🔬</div>
                    <p style={{ color: 'var(--text2)', marginBottom: 4 }}>
                      Click or drag dermoscopy image here
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text3)' }}>JPG / PNG · max 20 MB</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png"
                  style={{ display: 'none' }} onChange={handleFile} />
              </div>
              {file && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => { setFile(null); setPreview(null); setResult(null); }}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="fade-up-delay-2">
              {loading && (
                <div style={styles.loadingBox}>
                  <div className="spinner" style={{ width: 28, height: 28 }} />
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 2 }}>Analyzing…</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{step}</div>
                  </div>
                </div>
              )}
              <button
                className="btn btn-primary btn-full btn-lg"
                style={{ marginTop: loading ? 12 : 0 }}
                onClick={analyze}
                disabled={loading || !file || !patientId}
              >
                {loading ? 'Running pipeline…' : '▶ Run analysis'}
              </button>
            </div>
          </div>

          {/* Results panel */}
          <div>
            {!result && !loading && (
              <div className="card" style={{ ...styles.emptyResult }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🔬</div>
                <p style={{ color: 'var(--text3)', fontSize: 14 }}>
                  Upload an image and click Run analysis to see results here.
                </p>
              </div>
            )}

            {result && (
              <>
                {/* Overlay */}
                <div className="card fade-up" style={{ marginBottom: 16 }}>
                  <div style={styles.resultHeader}>
                    <h3 style={styles.sectionTitle}>Segmentation overlay</h3>
                    <PredictionBadge prediction={result.prediction} />
                  </div>
                  {result.overlay_b64 ? (
                    <MaskOverlay overlayB64={result.overlay_b64} />
                  ) : (
                    <div style={styles.noOverlay}>No overlay available</div>
                  )}
                </div>

                {/* Biopsy */}
                <div className="fade-up" style={{ marginBottom: 16 }}>
                  <BiopsyAlert
                    recommended={result.biopsy_recommended}
                    reason={result.biopsy_reason}
                  />
                </div>

                {/* Confidence */}
                {result.classifier_ok && (
                  <div className="card fade-up" style={{ marginBottom: 16 }}>
                    <h3 style={styles.sectionTitle}>Classification</h3>
                    <div style={{ marginTop: 12 }}>
                      <ConfidenceBar confidence={result.confidence} />
                    </div>
                  </div>
                )}

                {/* Key features */}
                <div className="card fade-up" style={{ marginBottom: 16 }}>
                  <h3 style={styles.sectionTitle}>Key features</h3>
                  <div style={styles.featGrid}>
                    {[
                      ['Asymmetry',         (result.features?.asym_pca * 100 || 0).toFixed(1) + '%'],
                      ['Border irreg.',     (result.features?.border_irregularity || 0).toFixed(3)],
                      ['Solidity',          (result.features?.solidity || 0).toFixed(3)],
                      ['Fractal dim.',      (result.features?.fractal_dim || 0).toFixed(3)],
                      ['Colour entropy',    (result.features?.color_rgb_ch0_entropy || 0).toFixed(3)],
                      ['Lesion ratio',      (result.features?.lesion_to_image_ratio * 100 || 0).toFixed(1) + '%'],
                    ].map(([k, v]) => (
                      <div key={k} style={styles.featItem}>
                        <div style={styles.featLabel}>{k}</div>
                        <div style={styles.featVal}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {result.report_available && (
                    <button className="btn btn-secondary" onClick={downloadReport}>
                      📄 Download PDF report
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={() => navigate(`/clinician/patient/${result.patient_id || patientId}`)}
                  >
                    👤 View patient folder
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  dropZone: {
    border: '2px dashed',
    borderRadius: 'var(--r-lg)',
    padding: '32px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    marginTop: 12,
    minHeight: 200,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    transition: 'border-color 0.2s',
  },
  preview: {
    width: '100%', maxHeight: 280, objectFit: 'contain',
    borderRadius: 'var(--r-md)', display: 'block',
  },
  loadingBox: {
    display: 'flex', alignItems: 'center', gap: 14,
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)', padding: '14px 18px',
    marginBottom: 12,
  },
  emptyResult: {
    minHeight: 300, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  },
  resultHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  noOverlay: {
    background: 'var(--bg3)', borderRadius: 'var(--r-md)',
    padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: 13,
  },
  featGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12,
  },
  featItem: {
    background: 'var(--bg3)', borderRadius: 'var(--r-sm)', padding: '10px 12px',
  },
  featLabel: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 },
  featVal: { fontSize: 17, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: 'var(--teal)' },
};
