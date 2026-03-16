import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL ||
  'https://fantastic-space-capybara-g4qvxg9rr7r6c9gwq-8000.app.github.dev';

const api = axios.create({
  baseURL: API_URL,
  timeout: 120000, // 2 min — inference can take ~30s on CPU
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/api/auth/register', data),
  login:    (email, password) => api.post('/api/auth/login',
    new URLSearchParams({ username: email, password }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  ),
  me: () => api.get('/api/auth/me'),
};

// ── Inference ─────────────────────────────────────────────────────────────
export const inferenceAPI = {
  analyze: (imageFile, patientId) => {
    const form = new FormData();
    form.append('image', imageFile);
    form.append('patient_id', patientId);
    return api.post('/api/analyze', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getAnalysis: (id) => api.get(`/api/analyses/${id}`),
  downloadReport: (id) => api.get(`/api/reports/${id}`, { responseType: 'blob' }),
};

// ── Patients ──────────────────────────────────────────────────────────────
export const patientAPI = {
  list:          ()         => api.get('/api/patients'),
  get:           (id)       => api.get(`/api/patients/${id}`),
  history:       (id)       => api.get(`/api/patients/${id}/history`),
  labReports:    (id)       => api.get(`/api/patients/${id}/lab-reports`),
  uploadLabReport: (id, file, reportType, notes) => {
    const form = new FormData();
    form.append('file', file);
    form.append('report_type', reportType);
    form.append('notes', notes);
    return api.post(`/api/patients/${id}/lab-reports`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  downloadLabReport: (patientId, labId) =>
    api.get(`/api/patients/${patientId}/lab-reports/${labId}/download`, { responseType: 'blob' }),
};

// ── Clinicians ────────────────────────────────────────────────────────────
export const clinicianAPI = {
  list:     ()           => api.get('/api/clinicians'),
  get:      (id)         => api.get(`/api/clinicians/${id}`),
  slots:    (id, date)   => api.get(`/api/clinicians/${id}/slots?date=${date}`),
};

// ── Bookings ──────────────────────────────────────────────────────────────
export const bookingAPI = {
  create:          (data) => api.post('/api/bookings', data),
  mine:            ()     => api.get('/api/bookings/mine'),
  clinicianBookings: ()   => api.get('/api/bookings/clinician'),
  updateStatus:    (id, status) => api.patch(`/api/bookings/${id}/status?status=${status}`),
};

export default api;
