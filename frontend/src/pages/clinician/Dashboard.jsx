import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Nav from '../../components/Nav';
import { patientAPI, bookingAPI } from '../../api';

const NAV_LINKS = [
  { label: 'Dashboard',  path: '/clinician' },
  { label: 'Analyze',    path: '/clinician/analyze' },
  { label: 'Bookings',   path: '/clinician/bookings' },
];

export default function ClinicianDashboard() {
  const navigate  = useNavigate();
  const name      = localStorage.getItem('full_name') || 'Doctor';
  const [patients, setPatients]   = useState([]);
  const [bookings, setBookings]   = useState([]);
  const [loading,  setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([
      patientAPI.list(),
      bookingAPI.clinicianBookings(),
    ]).then(([pr, br]) => {
      setPatients(pr.data);
      setBookings(br.data.filter(b => b.status !== 'cancelled').slice(0, 5));
    }).finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Assigned patients', value: patients.length, icon: '👥' },
    { label: 'Upcoming bookings', value: bookings.filter(b => new Date(b.slot_datetime) > new Date()).length, icon: '📅' },
    { label: 'Total analyses',    value: '—', icon: '🔬' },
  ];

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />
      <div className="container" style={{ padding: '48px 24px' }}>

        {/* Header */}
        <div className="fade-up" style={styles.header}>
          <div>
            <h1 style={{ fontSize: 32, marginBottom: 6 }}>
              Good day, Dr. {name.split(' ').slice(-1)[0]} 👋
            </h1>
            <p style={{ color: 'var(--text2)', fontWeight: 300 }}>
              Your clinical dashboard — patients, analyses, and appointments.
            </p>
          </div>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/clinician/analyze')}
          >
            🔬 New analysis
          </button>
        </div>

        {/* Stats */}
        <div className="grid-3 fade-up-delay-1" style={{ marginBottom: 32 }}>
          {stats.map(({ label, value, icon }) => (
            <div key={label} className="card" style={styles.statCard}>
              <div style={styles.statIcon}>{icon}</div>
              <div style={styles.statValue}>{value}</div>
              <div style={styles.statLabel}>{label}</div>
            </div>
          ))}
        </div>

        <div style={styles.grid}>
          {/* Patients */}
          <div className="card fade-up-delay-2">
            <div style={styles.sectionHeader}>
              <h2 style={{ fontSize: 18 }}>Assigned patients</h2>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{patients.length} total</span>
            </div>

            {loading && <div className="loading-wrap"><div className="spinner" /></div>}

            {!loading && patients.length === 0 && (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon" style={{ fontSize: 32 }}>👥</div>
                <h3 style={{ fontSize: 15 }}>No patients assigned</h3>
                <p>Patients are assigned when they register and select you as their clinician.</p>
              </div>
            )}

            {patients.map(p => (
              <div
                key={p.id}
                style={styles.patientRow}
                onClick={() => navigate(`/clinician/patient/${p.id}`)}
              >
                <div style={styles.avatar}>
                  {(p.full_name || 'P')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{p.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{p.email}</div>
                </div>
                <span style={{ color: 'var(--text3)', fontSize: 16 }}>→</span>
              </div>
            ))}
          </div>

          {/* Upcoming bookings */}
          <div className="card fade-up-delay-2">
            <div style={styles.sectionHeader}>
              <h2 style={{ fontSize: 18 }}>Upcoming appointments</h2>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/clinician/bookings')}
              >
                View all
              </button>
            </div>

            {bookings.length === 0 && !loading && (
              <div className="empty-state" style={{ padding: '30px 0' }}>
                <div className="empty-state-icon" style={{ fontSize: 32 }}>📅</div>
                <h3 style={{ fontSize: 15 }}>No upcoming appointments</h3>
              </div>
            )}

            {bookings.map(b => {
              const dt = new Date(b.slot_datetime);
              return (
                <div key={b.id} style={styles.bookingRow}>
                  <div style={styles.bookingDate}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)', lineHeight: 1 }}>
                      {dt.getDate()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>
                      {dt.toLocaleString('en', { month: 'short' })}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                      {b.patient_name || 'Patient'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span className={`badge ${b.status === 'confirmed' ? 'badge-teal' : 'badge-amber'}`}>
                    {b.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 32, gap: 16, flexWrap: 'wrap',
  },
  statCard: { textAlign: 'center', padding: '28px 20px' },
  statIcon: { fontSize: 28, marginBottom: 12 },
  statValue: {
    fontFamily: "'Syne', sans-serif", fontSize: 36, fontWeight: 700,
    color: 'var(--teal)', marginBottom: 4,
  },
  statLabel: { fontSize: 13, color: 'var(--text2)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  sectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  patientRow: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '12px 0', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', transition: 'opacity 0.2s',
  },
  avatar: {
    width: 38, height: 38, borderRadius: '50%',
    background: 'var(--teal-dim)', color: 'var(--teal)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, flexShrink: 0,
  },
  bookingRow: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '12px 0', borderBottom: '1px solid var(--border)',
  },
  bookingDate: {
    width: 44, flexShrink: 0, textAlign: 'center',
    background: 'var(--bg3)', borderRadius: 'var(--r-sm)',
    padding: '8px 4px',
  },
};
