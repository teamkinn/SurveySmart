import { defineStore } from 'pinia';
import api from '@/api';
import { useSurveyStore } from './surveys';

// Guarded — localStorage['user'] can end up malformed (a crashed tab mid-write,
// manual tampering, quota eviction) and JSON.parse throwing here happens at
// store creation (app boot), which took the whole app down instead of just
// falling back to a logged-out state.
function loadStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    user: loadStoredUser(),
  }),
  actions: {
    async login(identifier, password) {
      const { data } = await api.post('/auth/login', { identifier, password });
      this.setSession(data);
    },
    async register(payload) {
      const { data } = await api.post('/auth/register', payload);
      this.setSession(data);
    },
    setSession({ token, user }) {
      this.token = token;
      this.user = user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Without this, the previous user's survey list/stats/albums stayed
      // in memory (Pinia stores survive an SPA route change) and flashed on
      // screen for whoever logs in next in the same tab — a real, if brief,
      // cross-account data exposure on a shared/kiosk machine.
      useSurveyStore().$reset();
    },
  },
});
