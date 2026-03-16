import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api';
import toast from 'react-hot-toast';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', role: 'patient',
    specialty: '', hospital: '',
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authAPI.register(form);
      localStorage.setItem('token',     data.access_token);
      localStorage.setItem('role',      data.role);
      localStorage.setItem('user_id',   data.user_id);
      localStorage.setItem('full_name', data.full_name);
      toast.success('Account created successfully!');
      navigate(data.role === 'clinician' ? '/clinician' : '/patient');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrap} className="fade-up">
        <div style={styles.logo}>
          Derma<span style={{ color: 'var(--teal)' }}>Scan</span>
        </div>
        <h2 style={styles.title}>Create your account</h2>
        <p style={styles.sub}>Join as a patient or clinician</p>

        {/* Role toggle */}
        <div style={styles.roleWrap}>
          {['patient', 'clinician'].map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setForm({ ...form, role: r })}
              style={{
                ...styles.roleBtn,
                ...(form.role === r ? styles.roleBtnActive : {}),
              }}
            >
              {r === 'patient' ? '🧑‍⚕️ Patient' : '👨‍⚕️ Clinician'}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input className="form-input" type="text" placeholder="Dr. Jane Smith"
              value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input className="form-input" type="email" placeholder="you@hospital.com"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Min. 8 characters"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })} required />
          </div>

          {form.role === 'clinician' && (
            <>
              <div className="form-group">
                <label className="form-label">Specialty</label>
                <input className="form-input" type="text" placeholder="Dermatology"
                  value={form.specialty}
                  onChange={e => setForm({ ...form, specialty: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Hospital / Clinic</label>
                <input className="form-input" type="text" placeholder="City Medical Centre"
                  value={form.hospital}
                  onChange={e => setForm({ ...form, hospital: e.target.value })} />
              </div>
            </>
          )}

          <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={styles.switch}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    padding: '40px 24px',
  },
  wrap: {
    width: '100%',
    maxWidth: 480,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-xl)',
    padding: '40px',
  },
  logo: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 24,
    color: 'var(--text)',
  },
  title: { fontSize: 26, marginBottom: 6 },
  sub: { fontSize: 14, color: 'var(--text2)', marginBottom: 28, fontWeight: 300 },
  roleWrap: {
    display: 'flex',
    gap: 8,
    marginBottom: 24,
    background: 'var(--bg3)',
    padding: 4,
    borderRadius: 'var(--r-md)',
  },
  roleBtn: {
    flex: 1,
    padding: '9px 16px',
    border: 'none',
    borderRadius: 'calc(var(--r-md) - 2px)',
    background: 'none',
    color: 'var(--text2)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  roleBtnActive: {
    background: 'var(--teal)',
    color: '#0b0f1a',
  },
  switch: { textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text2)' },
};
