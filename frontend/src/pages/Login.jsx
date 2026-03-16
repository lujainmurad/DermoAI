import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authAPI.login(form.email, form.password);
      localStorage.setItem('token',     data.access_token);
      localStorage.setItem('role',      data.role);
      localStorage.setItem('user_id',   data.user_id);
      localStorage.setItem('full_name', data.full_name);
      toast.success(`Welcome back, ${data.full_name.split(' ')[0]}!`);
      navigate(data.role === 'clinician' ? '/clinician' : '/patient');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.left}>
        <div style={styles.leftContent}>
          <div style={styles.logo}>Derma<span style={{ color: 'var(--teal)' }}>Scan</span></div>
          <h1 style={styles.hero}>AI-powered skin lesion analysis for clinical excellence</h1>
          <p style={styles.heroSub}>
            Dermoscopy segmentation, feature extraction, and melanoma classification —
            designed for dermatologists and patients alike.
          </p>
          <div style={styles.stats}>
            {[['3 Classes', 'Melanoma · Nevi · SK'],
              ['ResNet-50', 'Dual ASPP encoder'],
              ['150+', 'Clinical features']].map(([n, l]) => (
              <div key={n} style={styles.stat}>
                <div style={styles.statNum}>{n}</div>
                <div style={styles.statLabel}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.formCard} className="fade-up">
          <h2 style={styles.formTitle}>Sign in</h2>
          <p style={styles.formSub}>Access your clinical dashboard or patient portal</p>

          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                className="form-input"
                type="email"
                placeholder="you@hospital.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p style={styles.switch}>
            Don't have an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
  },
  left: {
    flex: 1,
    background: 'linear-gradient(135deg, #0b0f1a 0%, #0d1f2d 50%, #0b1a2e 100%)',
    display: 'flex',
    alignItems: 'center',
    padding: '60px',
    position: 'relative',
    overflow: 'hidden',
  },
  leftContent: { position: 'relative', zIndex: 1, maxWidth: 480 },
  logo: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 40,
    color: 'var(--text)',
  },
  hero: {
    fontSize: 42,
    fontWeight: 700,
    lineHeight: 1.15,
    marginBottom: 20,
    color: 'var(--text)',
  },
  heroSub: {
    fontSize: 16,
    color: 'var(--text2)',
    lineHeight: 1.7,
    marginBottom: 48,
    fontWeight: 300,
  },
  stats: { display: 'flex', gap: 32 },
  stat: {},
  statNum: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--teal)',
  },
  statLabel: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  right: {
    width: 480,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 48px',
    background: 'var(--bg2)',
    borderLeft: '1px solid var(--border)',
  },
  formCard: { width: '100%' },
  formTitle: { fontSize: 28, marginBottom: 8 },
  formSub: { fontSize: 14, color: 'var(--text2)', marginBottom: 32, fontWeight: 300 },
  switch: { textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text2)' },
};
