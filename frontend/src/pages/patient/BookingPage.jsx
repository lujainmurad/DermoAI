// ── BookingPage.jsx ───────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Nav from '../../components/Nav';
import { clinicianAPI, bookingAPI } from '../../api';
import toast from 'react-hot-toast';

const NAV_LINKS = [
  { label: 'Home', path: '/patient' },
  { label: 'My bookings', path: '/patient/bookings' },
];

export function BookingPage() {
  const navigate = useNavigate();
  const [clinicians, setClinicians] = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [date,       setDate]       = useState('');
  const [slots,      setSlots]      = useState([]);
  const [chosenSlot, setChosenSlot] = useState(null);
  const [notes,      setNotes]      = useState('');
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    clinicianAPI.list().then(r => setClinicians(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selected && date) {
      clinicianAPI.slots(selected.id, date)
        .then(r => setSlots(r.data.slots))
        .catch(() => {});
    }
  }, [selected, date]);

  const book = async () => {
    if (!selected || !chosenSlot) {
      toast.error('Please select a clinician and time slot.');
      return;
    }
    setLoading(true);
    try {
      await bookingAPI.create({
        clinician_id:  selected.id,
        slot_datetime: chosenSlot,
        notes,
      });
      toast.success('Appointment booked successfully!');
      navigate('/patient/bookings');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Booking failed.');
    } finally {
      setLoading(false);
    }
  };

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="page">
      <Nav links={NAV_LINKS} />
      <div className="container" style={{ padding: '48px 24px', maxWidth: 700 }}>
        <div className="fade-up">
          <h1 style={{ fontSize: 30, marginBottom: 8 }}>Book an appointment</h1>
          <p style={{ color: 'var(--text2)', marginBottom: 32, fontWeight: 300 }}>
            Select a dermatologist and choose a convenient time slot.
          </p>

          {/* Step 1 — Clinician */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={st.stepTitle}><span style={st.stepNum}>1</span> Choose a clinician</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {clinicians.length === 0 && (
                <p style={{ color: 'var(--text2)', fontSize: 14 }}>
                  No clinicians registered yet. Ask your clinician to create an account.
                </p>
              )}
              {clinicians.map(c => (
                <div
                  key={c.id}
                  style={{
                    ...st.clinicianCard,
                    ...(selected?.id === c.id ? st.clinicianSelected : {}),
                  }}
                  onClick={() => { setSelected(c); setSlots([]); setChosenSlot(null); }}
                >
                  <div style={st.clinicianAvatar}>👨‍⚕️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>Dr. {c.full_name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                      {c.specialty} · {c.hospital || 'Private practice'}
                    </div>
                  </div>
                  {selected?.id === c.id && (
                    <span style={{ color: 'var(--teal)', fontSize: 18 }}>✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step 2 — Date */}
          {selected && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={st.stepTitle}><span style={st.stepNum}>2</span> Choose a date</h3>
              <input
                className="form-input"
                type="date"
                min={minDate}
                value={date}
                onChange={e => { setDate(e.target.value); setChosenSlot(null); }}
                style={{ marginTop: 16, maxWidth: 240 }}
              />
            </div>
          )}

          {/* Step 3 — Slot */}
          {date && slots.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={st.stepTitle}><span style={st.stepNum}>3</span> Choose a time slot</h3>
              <div style={st.slotsGrid}>
                {slots.map(s => (
                  <button
                    key={s.datetime}
                    disabled={!s.available}
                    onClick={() => setChosenSlot(s.datetime)}
                    style={{
                      ...st.slot,
                      ...(chosenSlot === s.datetime ? st.slotSelected : {}),
                      ...(!s.available ? st.slotTaken : {}),
                    }}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4 — Notes + confirm */}
          {chosenSlot && (
            <div className="card fade-up">
              <h3 style={st.stepTitle}><span style={st.stepNum}>4</span> Confirm booking</h3>
              <div style={st.summary}>
                <div>👨‍⚕️ Dr. {selected.full_name}</div>
                <div>📅 {new Date(chosenSlot).toLocaleString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                  hour: '2-digit', minute: '2-digit',
                })}</div>
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Notes (optional)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Describe your concern or reason for visit…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={book}
                disabled={loading}
              >
                {loading ? 'Booking…' : '✓ Confirm appointment'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const st = {
  stepTitle: {
    fontSize: 15,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  stepNum: {
    width: 26, height: 26,
    background: 'var(--teal)',
    color: '#0b0f1a',
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  clinicianCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  clinicianSelected: {
    borderColor: 'var(--teal)',
    background: 'var(--teal-dim)',
  },
  clinicianAvatar: { fontSize: 28, width: 44, textAlign: 'center' },
  slotsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
    marginTop: 16,
  },
  slot: {
    padding: '10px 0',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    background: 'var(--bg3)',
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: "'DM Sans', sans-serif",
  },
  slotSelected: {
    background: 'var(--teal)',
    color: '#0b0f1a',
    borderColor: 'var(--teal)',
  },
  slotTaken: {
    opacity: 0.35,
    cursor: 'not-allowed',
    textDecoration: 'line-through',
  },
  summary: {
    background: 'var(--bg3)',
    borderRadius: 'var(--r-md)',
    padding: '14px 18px',
    marginTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 14,
  },
};

export default BookingPage;
