import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // A 401 from the login/register endpoints just means "wrong credentials"
    // or "validation failed" — that should surface as an inline error on the
    // form, not force a hard redirect/reload while the user is mid-attempt.
    const url = err.config?.url || '';
    const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/register');
    if (err.response?.status === 401 && !isAuthAttempt) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
