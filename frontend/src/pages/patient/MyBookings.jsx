import React, { useEffect, useState } from 'react';
import Nav from '../../components/Nav';
import { bookingAPI } from '../../api';

const NAV_LINKS = [
  { label: 'Home', path: '/patient' },
  { label: 'Book', path: '/patient/book' },
];

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    bookingAPI.mine()
      .then(r => setBookings(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />
      <div className="container" style={{ padding: '48px 24px' }}>
        <h1 style={{ fontSize: 30, marginBottom: 8 }} className="fade-up">My appointments</h1>
        <p style={{ color: 'var(--text2)', marginBottom: 32, fontWeight: 300 }} className="fade-up">
          All your scheduled dermatology consultations.
        </p>

        {loading && <div className="loading-wrap"><div className="spinner" /></div>}

        {!loading && bookings.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h3>No appointments yet</h3>
            <p>Book a consultation with a dermatologist.</p>
          </div>
        )}

        {!loading && bookings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {bookings.map(b => {
              const dt = new Date(b.slot_datetime);
              const isPast = dt < new Date();
              return (
                <div key={b.id} className="card fade-up" style={{
                  display: 'flex', alignItems: 'center', gap: 20,
                  opacity: isPast ? 0.7 : 1,
                }}>
                  <div style={{
                    width: 56, height: 56, flexShrink: 0,
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ fontSize: 18, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: 'var(--teal)', lineHeight: 1 }}>
                      {dt.getDate()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>
                      {dt.toLocaleString('en', { month: 'short' })}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>
                      Dr. {b.clinician_name || 'Clinician'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                      {dt.toLocaleString('en-GB', {
                        weekday: 'long', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                    {b.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                        {b.notes}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${
                    b.status === 'confirmed' ? 'badge-teal' :
                    b.status === 'cancelled' ? 'badge-red' : 'badge-amber'
                  }`}>
                    {b.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
