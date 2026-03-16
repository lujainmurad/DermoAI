// ── PatientFolder.jsx ─────────────────────────────────────────────────────
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Nav from '../../components/Nav';
import { PredictionBadge } from '../../components/ResultComponents';
import { patientAPI, inferenceAPI } from '../../api';
import toast from 'react-hot-toast';

const NAV_LINKS = [
  { label: 'Dashboard', path: '/clinician' },
  { label: 'Analyze',   path: '/clinician/analyze' },
  { label: 'Bookings',  path: '/clinician/bookings' },
];

export function PatientFolder() {
  const { patientId } = useParams();
  const navigate      = useNavigate();
  const labFileRef    = useRef(null);

  const [patient,  setPatient]  = useState(null);
  const [history,  setHistory]  = useState([]);
  const [labs,     setLabs]     = useState([]);
  const [tab,      setTab]      = useState('history');
  const [loading,  setLoading]  = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    Promise.all([
      patientAPI.get(patientId),
      patientAPI.history(patientId),
      patientAPI.labReports(patientId),
    ]).then(([pr, hr, lr]) => {
      setPatient(pr.data);
      setHistory(hr.data);
      setLabs(lr.data);
    }).catch(() => toast.error('Failed to load patient data.'))
      .finally(() => setLoading(false));
  }, [patientId]);

  const uploadLab = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await patientAPI.uploadLabReport(patientId, file, 'Lab Report', '');
      const lr = await patientAPI.labReports(patientId);
      setLabs(lr.data);
      toast.success('Lab report uploaded.');
    } catch {
      toast.error('Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const downloadLab = async (labId) => {
    try {
      const { data } = await patientAPI.downloadLabReport(patientId, labId);
      const url  = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href  = url; link.download = `lab_report_${labId.slice(0,8)}.pdf`; link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed.');
    }
  };

  const downloadAnalysisReport = async (id) => {
    try {
      const { data } = await inferenceAPI.downloadReport(id);
      const url  = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href  = url; link.download = `analysis_${id.slice(0,8)}.pdf`; link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Report not available.');
    }
  };

  if (loading) return (
    <div className="page"><Nav links={NAV_LINKS} />
      <div className="loading-wrap"><div className="spinner" /></div>
    </div>
  );

  if (!patient) return (
    <div className="page"><Nav links={NAV_LINKS} />
      <div className="empty-state"><h3>Patient not found</h3></div>
    </div>
  );

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />
      <div className="container" style={{ padding: '48px 24px' }}>

        {/* Patient header */}
        <div className="card fade-up" style={styles.patientHeader}>
          <div style={styles.bigAvatar}>
            {(patient.full_name || 'P')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 26, marginBottom: 4 }}>{patient.full_name}</h1>
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>{patient.email}</p>
            {patient.date_of_birth && (
              <p style={{ color: 'var(--text2)', fontSize: 13 }}>
                DOB: {patient.date_of_birth}
              </p>
            )}
            {patient.medical_notes && (
              <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 6,
                background: 'var(--bg3)', padding: '8px 12px',
                borderRadius: 'var(--r-sm)', marginTop: 10 }}>
                📋 {patient.medical_notes}
              </p>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/clinician/analyze?patient=${patientId}`)}
          >
            🔬 New analysis
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {[
            ['history',  `Analyses (${history.length})`],
            ['labs',     `Lab reports (${labs.length})`],
          ].map(([t, l]) => (
            <button
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Analysis history */}
        {tab === 'history' && (
          <div className="fade-up">
            {history.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">🔬</div>
                <h3>No analyses yet</h3>
                <p>Run a dermoscopy analysis to see results here.</p>
              </div>
            )}
            {history.map(a => (
              <div key={a.analysis_id} className="card" style={styles.analysisCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
                      {new Date(a.created_at).toLocaleString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                    <PredictionBadge prediction={a.prediction} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {a.report_available && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => downloadAnalysisReport(a.analysis_id)}
                      >
                        📄 Report
                      </button>
                    )}
                    <span className={`badge ${a.biopsy_recommended ? 'badge-red' : 'badge-teal'}`}>
                      {a.biopsy_recommended ? '⚠ Biopsy rec.' : '✓ No biopsy'}
                    </span>
                  </div>
                </div>
                {a.biopsy_reason && (
                  <p style={{ fontSize: 13, color: 'var(--text2)' }}>{a.biopsy_reason}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Lab reports */}
        {tab === 'labs' && (
          <div className="fade-up">
            <div style={{ marginBottom: 16 }}>
              <input ref={labFileRef} type="file" accept="application/pdf"
                style={{ display: 'none' }} onChange={uploadLab} />
              <button
                className="btn btn-primary"
                onClick={() => labFileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : '⬆ Upload lab report (PDF)'}
              </button>
            </div>

            {labs.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <h3>No lab reports</h3>
                <p>Upload lab PDFs to keep them in the patient folder.</p>
              </div>
            )}

            {labs.map(lab => (
              <div key={lab.id} className="card" style={styles.labCard}>
                <div style={{ fontSize: 24 }}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{lab.report_type}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {new Date(lab.uploaded_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                    {' · '}{lab.filename}
                  </div>
                  {lab.notes && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{lab.notes}</div>}
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => downloadLab(lab.id)}
                >
                  ⬇ Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  patientHeader: {
    display: 'flex', alignItems: 'flex-start', gap: 20,
    marginBottom: 28, flexWrap: 'wrap',
  },
  bigAvatar: {
    width: 64, height: 64, borderRadius: '50%',
    background: 'var(--teal-dim)', color: 'var(--teal)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 26, flexShrink: 0,
  },
  tabs: {
    display: 'flex', gap: 4, marginBottom: 24,
    borderBottom: '1px solid var(--border)', paddingBottom: 0,
  },
  tab: {
    padding: '10px 20px',
    background: 'none', border: 'none',
    color: 'var(--text2)', cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", fontSize: 14,
    borderBottom: '2px solid transparent',
    marginBottom: -1, transition: 'all 0.2s',
  },
  tabActive: {
    color: 'var(--teal)',
    borderBottomColor: 'var(--teal)',
  },
  analysisCard: { marginBottom: 12 },
  labCard: {
    display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12,
  },
};

export default PatientFolder;
