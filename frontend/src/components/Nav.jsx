import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Nav({ links = [] }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const name      = localStorage.getItem('full_name') || 'User';
  const role      = localStorage.getItem('role');

  const logout = () => {
    localStorage.clear();
    toast.success('Signed out');
    navigate('/login');
  };

  return (
    <nav className="nav">
      <div className="nav-logo">
        Derma<span>Scan</span>
        <span style={{
          fontSize: 11,
          background: 'var(--teal-dim)',
          color: 'var(--teal)',
          border: '1px solid rgba(0,212,170,0.3)',
          borderRadius: 20,
          padding: '2px 8px',
          marginLeft: 4,
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
          letterSpacing: '0.04em',
        }}>
          {role === 'clinician' ? 'Clinician' : 'Patient'}
        </span>
      </div>

      <div className="nav-links">
        {links.map(({ label, path }) => (
          <button
            key={path}
            className={`nav-link ${location.pathname === path ? 'active' : ''}`}
            onClick={() => navigate(path)}
          >
            {label}
          </button>
        ))}

        <div style={{
          width: 1,
          height: 20,
          background: 'var(--border)',
          margin: '0 6px',
        }} />

        <div style={{
          fontSize: 13,
          color: 'var(--text2)',
          padding: '0 8px',
        }}>
          {name}
        </div>

        <button className="btn btn-secondary btn-sm" onClick={logout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
