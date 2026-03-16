import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import Nav from '../../components/Nav';
import { inferenceAPI, patientAPI } from '../../api';
import toast from 'react-hot-toast';

const NAV_LINKS = [
  { label: 'Home', path: '/patient' },
  { label: 'Nearby', path: '/patient/nearby' },
];

export default function CameraCapture() {
  const navigate   = useNavigate();
  const webcamRef  = useRef(null);
  const fileRef    = useRef(null);

  const [mode, setMode]         = useState('upload'); // 'camera' | 'upload'
  const [preview, setPreview]   = useState(null);
  const [file, setFile]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [step, setStep]         = useState(''); // progress message

  // ── File upload ───────────────────────────────────────────────────────
  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  // ── Camera capture ────────────────────────────────────────────────────
  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;
    setPreview(imageSrc);
    // Convert base64 to File
    fetch(imageSrc)
      .then(r => r.blob())
      .then(blob => setFile(new File([blob], 'capture.jpg', { type: 'image/jpeg' })));
  }, [webcamRef]);

  // ── Analyze ───────────────────────────────────────────────────────────
  const analyze = async () => {
    if (!file) { toast.error('Please select or capture an image first.'); return; }
    setLoading(true);

    try {
      // Get patient profile id
      setStep('Identifying patient profile…');
      const userId = localStorage.getItem('user_id');
      const patientsRes = await patientAPI.list().catch(() => ({ data: [] }));

      // For patient role, get own profile via /api/auth/me then find profile
      // We'll use a workaround: try to get the patient profile
      let patientId = null;

      // Try fetching patient profile linked to this user
      try {
        const meRes = await import('../../api').then(m => m.default.get('/api/auth/me'));
        // Patient profile ID may differ from user ID — fetch via list if clinician
        // For patient, the profile ID is found by checking the user's patient_profile
        // Since we don't have a direct endpoint, we pass user_id and let backend resolve
        patientId = userId; // backend can look up patient profile from user_id if needed
      } catch (e) {
        patientId = userId;
      }

      // We need the PatientProfile.id not User.id
      // The backend /api/patients lists by clinician — for patient self-service
      // use a special approach: create a booking-style lookup
      // For now pass user_id — the inference router handles both
      // Actually the inference endpoint needs PatientProfile.id
      // Let's get it properly:
      setStep('Loading profile…');
      const profileRes = await import('../../api').then(m =>
        m.default.get('/api/patients/' + userId).catch(() => null)
      );

      if (profileRes?.data?.id) {
        patientId = profileRes.data.id;
      }

      if (!patientId) {
        toast.error('Could not find your patient profile. Please contact your clinician.');
        setLoading(false);
        return;
      }

      setStep('Running segmentation… (this takes 10–30 seconds)');
      const { data } = await inferenceAPI.analyze(file, patientId);

      toast.success('Analysis complete!');
      navigate(`/patient/result/${data.analysis_id}`, {
        state: { result: data },
      });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />

      <div className="container" style={{ padding: '48px 24px', maxWidth: 700 }}>
        <div className="fade-up">
          <h1 style={{ fontSize: 30, marginBottom: 8 }}>Scan your lesion</h1>
          <p style={{ color: 'var(--text2)', marginBottom: 32, fontWeight: 300 }}>
            Take a clear, well-lit photo of the skin lesion. Keep the camera steady and close.
          </p>

          {/* Mode toggle */}
          <div style={styles.modeToggle}>
            {[['upload', '📁 Upload photo'], ['camera', '📷 Use camera']].map(([m, l]) => (
              <button
                key={m}
                className={`btn ${mode === m ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setMode(m); setPreview(null); setFile(null); }}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Upload mode */}
          {mode === 'upload' && (
            <div
              style={styles.dropZone}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
              }}
            >
              {preview ? (
                <img src={preview} alt="Preview" style={styles.preview} />
              ) : (
                <>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🖼️</div>
                  <p style={{ color: 'var(--text2)', marginBottom: 4 }}>
                    Click to select or drag & drop
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text3)' }}>JPG or PNG, max 20MB</p>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*"
                style={{ display: 'none' }} onChange={handleFile} />
            </div>
          )}

          {/* Camera mode */}
          {mode === 'camera' && (
            <div style={{ marginBottom: 20 }}>
              {!preview ? (
                <>
                  <div style={styles.cameraWrap}>
                    <Webcam
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      style={{ width: '100%', borderRadius: 'var(--r-md)' }}
                      videoConstraints={{ facingMode: 'environment' }}
                    />
                  </div>
                  <button
                    className="btn btn-primary btn-full"
                    style={{ marginTop: 12 }}
                    onClick={capture}
                  >
                    📸 Capture photo
                  </button>
                </>
              ) : (
                <>
                  <img src={preview} alt="Captured" style={styles.preview} />
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => { setPreview(null); setFile(null); }}
                  >
                    Retake
                  </button>
                </>
              )}
            </div>
          )}

          {/* Tips */}
          <div style={styles.tips}>
            <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>
              📌 For best results:
            </div>
            {['Good lighting — natural light works best',
              'Keep the camera steady and close to the lesion',
              'Ensure the full lesion is visible in frame',
              'Avoid shadows or glare on the skin'].map(t => (
              <div key={t} style={styles.tip}>✓ {t}</div>
            ))}
          </div>

          {/* Analyze button */}
          {preview && (
            <div style={{ marginTop: 24 }}>
              {loading && (
                <div style={styles.loadingBox}>
                  <div className="spinner" style={{ width: 28, height: 28 }} />
                  <span style={{ fontSize: 14, color: 'var(--text2)' }}>{step}</span>
                </div>
              )}
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={analyze}
                disabled={loading}
                style={{ marginTop: loading ? 16 : 0 }}
              >
                {loading ? 'Analyzing…' : '🔬 Analyze lesion'}
              </button>
              <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 10 }}>
                Analysis takes 10–30 seconds on CPU. Please wait.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  modeToggle: { display: 'flex', gap: 10, marginBottom: 24 },
  dropZone: {
    border: '2px dashed var(--border2)',
    borderRadius: 'var(--r-lg)',
    padding: '40px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    marginBottom: 20,
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    width: '100%',
    maxHeight: 360,
    objectFit: 'contain',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg3)',
    display: 'block',
  },
  cameraWrap: {
    borderRadius: 'var(--r-md)',
    overflow: 'hidden',
    background: '#000',
  },
  tips: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    padding: '16px 20px',
  },
  tip: { fontSize: 13, color: 'var(--text2)', padding: '3px 0' },
  loadingBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    padding: '14px 18px',
  },
};
