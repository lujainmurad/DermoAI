import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Nav from '../../components/Nav';
import { bookingAPI, patientAPI } from '../../api';

const NAV_LINKS = [
  { label: 'Home',      path: '/patient' },
  { label: 'My Bookings', path: '/patient/bookings' },
  { label: 'Nearby',    path: '/patient/nearby' },
];

export default function PatientHome() {
  const navigate  = useNavigate();
  const name      = localStorage.getItem('full_name') || 'there';
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    bookingAPI.mine().then(r => setBookings(r.data.slice(0, 3))).catch(() => {});
  }, []);

  const actions = [
    {
      icon: '📷',
      title: 'Scan a lesion',
      desc: 'Take a photo of a skin lesion for AI analysis',
      color: 'var(--teal)',
      path: '/patient/camera',
    },
    {
      icon: '📅',
      title: 'Book appointment',
      desc: 'Schedule a consultation with a dermatologist',
      color: 'var(--blue)',
      path: '/patient/book',
    },
    {
      icon: '🗺️',
      title: 'Find nearby clinics',
      desc: 'Locate dermatology clinics and hospitals near you',
      color: 'var(--amber)',
      path: '/patient/nearby',
    },
    {
      icon: '📋',
      title: 'My appointments',
      desc: 'View and manage your scheduled appointments',
      color: 'var(--text2)',
      path: '/patient/bookings',
    },
  ];

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />

      <div className="container" style={{ padding: '48px 24px' }}>
        {/* Hero */}
        <div className="fade-up" style={styles.hero}>
          <div style={styles.heroText}>
            <h1 style={{ fontSize: 36, marginBottom: 10 }}>
              Hello, {name.split(' ')[0]} 👋
            </h1>
            <p style={{ color: 'var(--text2)', fontSize: 16, fontWeight: 300, maxWidth: 500 }}>
              Monitor your skin health with AI-powered dermoscopy analysis.
              Capture a lesion photo and get instant clinical-grade insights.
            </p>
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/patient/camera')}
            style={{ flexShrink: 0 }}
          >
            📷 Scan lesion now
          </button>
        </div>

        {/* Action cards */}
        <div className="grid-2 fade-up-delay-1" style={{ marginBottom: 40 }}>
          {actions.map(({ icon, title, desc, color, path }) => (
            <div
              key={path}
              className="card"
              style={styles.actionCard}
              onClick={() => navigate(path)}
            >
              <div style={{ ...styles.actionIcon, color }}>
                {icon}
              </div>
              <div>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 300 }}>{desc}</p>
              </div>
              <div style={styles.actionArrow}>→</div>
            </div>
          ))}
        </div>

        {/* Upcoming appointments */}
        {bookings.length > 0 && (
          <div className="card fade-up-delay-2">
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Upcoming appointments</h2>
            {bookings.map(b => (
              <div key={b.id} style={styles.bookingRow}>
                <div style={styles.bookingIcon}>📅</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    Dr. {b.clinician_name || 'Clinician'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    {new Date(b.slot_datetime).toLocaleString('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                <span className={`badge ${
                  b.status === 'confirmed' ? 'badge-teal' :
                  b.status === 'cancelled' ? 'badge-red' : 'badge-amber'
                }`}>
                  {b.status}
                </span>
              </div>
            ))}
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 16 }}
              onClick={() => navigate('/patient/bookings')}
            >
              View all appointments →
            </button>
          </div>
        )}

        {/* Info banner */}
        <div className="fade-up-delay-3" style={styles.infoBanner}>
          <span style={{ fontSize: 20 }}>ℹ️</span>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)' }}>Important: </strong>
            AI analysis is a screening aid and not a medical diagnosis.
            Always consult a qualified dermatologist for clinical decisions.
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  hero: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
    marginBottom: 40,
    background: 'linear-gradient(135deg, var(--bg2) 0%, var(--bg3) 100%)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-xl)',
    padding: '36px 40px',
    flexWrap: 'wrap',
  },
  heroText: { flex: 1 },
  actionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative',
  },
  actionIcon: { fontSize: 32, flexShrink: 0 },
  actionArrow: {
    position: 'absolute',
    right: 20,
    color: 'var(--text3)',
    fontSize: 18,
  },
  bookingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 0',
    borderBottom: '1px solid var(--border)',
  },
  bookingIcon: { fontSize: 20, width: 36, textAlign: 'center' },
  infoBanner: {
    marginTop: 24,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    background: 'var(--blue-dim)',
    border: '1px solid rgba(77,166,255,0.2)',
    borderRadius: 'var(--r-md)',
    padding: '14px 18px',
  },
};
