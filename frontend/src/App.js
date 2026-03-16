import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Auth
import Login    from './pages/Login';
import Register from './pages/Register';

// Patient pages
import PatientHome   from './pages/patient/PatientHome';
import CameraCapture from './pages/patient/CameraCapture';
import ResultPage    from './pages/patient/ResultPage';
import BookingPage   from './pages/patient/BookingPage';
import NearbyMap     from './pages/patient/NearbyMap';
import MyBookings    from './pages/patient/MyBookings';

// Clinician pages
import ClinicianDashboard from './pages/clinician/Dashboard';
import UploadAnalyze      from './pages/clinician/UploadAnalyze';
import PatientFolder      from './pages/clinician/PatientFolder';
import ClinicianBookings  from './pages/clinician/ClinicianBookings';

// Guards
function RequireAuth({ children, role }) {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('role');
  if (!token) return <Navigate to="/login" replace />;
  if (role && userRole !== role) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1f2e',
            color: '#e2e8f0',
            border: '1px solid #2d3748',
            borderRadius: '10px',
            fontFamily: "'DM Sans', sans-serif",
          },
        }}
      />
      <Routes>
        {/* Public */}
        <Route path="/"        element={<Navigate to="/login" replace />} />
        <Route path="/login"   element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Patient routes */}
        <Route path="/patient" element={
          <RequireAuth role="patient"><PatientHome /></RequireAuth>
        } />
        <Route path="/patient/camera" element={
          <RequireAuth role="patient"><CameraCapture /></RequireAuth>
        } />
        <Route path="/patient/result/:analysisId" element={
          <RequireAuth role="patient"><ResultPage /></RequireAuth>
        } />
        <Route path="/patient/book" element={
          <RequireAuth role="patient"><BookingPage /></RequireAuth>
        } />
        <Route path="/patient/nearby" element={
          <RequireAuth role="patient"><NearbyMap /></RequireAuth>
        } />
        <Route path="/patient/bookings" element={
          <RequireAuth role="patient"><MyBookings /></RequireAuth>
        } />

        {/* Clinician routes */}
        <Route path="/clinician" element={
          <RequireAuth role="clinician"><ClinicianDashboard /></RequireAuth>
        } />
        <Route path="/clinician/analyze" element={
          <RequireAuth role="clinician"><UploadAnalyze /></RequireAuth>
        } />
        <Route path="/clinician/patient/:patientId" element={
          <RequireAuth role="clinician"><PatientFolder /></RequireAuth>
        } />
        <Route path="/clinician/bookings" element={
          <RequireAuth role="clinician"><ClinicianBookings /></RequireAuth>
        } />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
