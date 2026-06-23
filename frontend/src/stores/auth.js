import { defineStore } from 'pinia';
import api from '@/api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    user:  JSON.parse(localStorage.getItem('user') || 'null'),
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
      this.user  = user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    logout() {
      this.token = null;
      this.user  = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
  },
});
