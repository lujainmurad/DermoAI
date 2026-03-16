import React, { useEffect, useState } from 'react';
import Nav from '../../components/Nav';
import { bookingAPI } from '../../api';
import toast from 'react-hot-toast';

const NAV_LINKS = [
  { label: 'Dashboard', path: '/clinician' },
  { label: 'Analyze',   path: '/clinician/analyze' },
  { label: 'Bookings',  path: '/clinician/bookings' },
];

export default function ClinicianBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');

  const load = () => {
    bookingAPI.clinicianBookings()
      .then(r => setBookings(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    try {
      await bookingAPI.updateStatus(id, status);
      toast.success(`Booking ${status}`);
      load();
    } catch {
      toast.error('Failed to update booking.');
    }
  };

  const filtered = bookings.filter(b =>
    filter === 'all' ? true : b.status === filter
  );

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />
      <div className="container" style={{ padding: '48px 24px' }}>
        <div className="fade-up" style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 30, marginBottom: 8 }}>Appointment bookings</h1>
          <p style={{ color: 'var(--text2)', fontWeight: 300 }}>
            Manage patient appointment requests.
          </p>
        </div>

        {/* Filter */}
        <div style={styles.filterRow}>
          {['all', 'pending', 'confirmed', 'cancelled'].map(f => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
              style={{ textTransform: 'capitalize' }}
            >
              {f}
            </button>
          ))}
        </div>

        {loading && <div className="loading-wrap"><div className="spinner" /></div>}

        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h3>No {filter === 'all' ? '' : filter} bookings</h3>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(b => {
            const dt = new Date(b.slot_datetime);
            const isPast = dt < new Date();
            return (
              <div key={b.id} className="card fade-up" style={{
                display: 'flex', alignItems: 'center', gap: 20,
                opacity: isPast ? 0.75 : 1,
              }}>
                {/* Date block */}
                <div style={styles.dateBlock}>
                  <div style={styles.dateDay}>{dt.getDate()}</div>
                  <div style={styles.dateMonth}>
                    {dt.toLocaleString('en', { month: 'short' })}
                  </div>
                  <div style={styles.dateTime}>
                    {dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    {b.patient_name || 'Patient'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
                    {dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                  {b.notes && (
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>📝 {b.notes}</div>
                  )}
                </div>

                {/* Status + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span className={`badge ${
                    b.status === 'confirmed' ? 'badge-teal' :
                    b.status === 'cancelled' ? 'badge-red' : 'badge-amber'
                  }`}>
                    {b.status}
                  </span>

                  {b.status === 'pending' && !isPast && (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => updateStatus(b.id, 'confirmed')}
                      >
                        Confirm
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => updateStatus(b.id, 'cancelled')}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {b.status === 'confirmed' && !isPast && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => updateStatus(b.id, 'cancelled')}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  filterRow: { display: 'flex', gap: 8, marginBottom: 24 },
  dateBlock: {
    width: 60, flexShrink: 0, textAlign: 'center',
    background: 'var(--bg3)', borderRadius: 'var(--r-md)',
    padding: '10px 4px',
  },
  dateDay: {
    fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700,
    color: 'var(--teal)', lineHeight: 1,
  },
  dateMonth: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', marginTop: 2 },
  dateTime: { fontSize: 11, color: 'var(--text2)', marginTop: 4, fontWeight: 500 },
};
