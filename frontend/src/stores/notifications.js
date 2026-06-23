import { defineStore } from 'pinia';
import api from '@/api';

export const useNotifStore = defineStore('notifs', {
  state: () => ({
    items: [],
  }),
  getters: {
    unreadCount: (s) => s.items.filter(n => !n.is_read).length,
  },
  actions: {
    async fetch() {
      const { data } = await api.get('/notifications');
      this.items = data;
    },
    async markRead(id) {
      await api.patch(`/notifications/${id}/read`);
      const n = this.items.find(x => x.id === id);
      if (n) n.is_read = 1;
    },
    async markAllRead() {
      await api.patch('/notifications/read-all');
      this.items.forEach(n => (n.is_read = 1));
    },
  },
});
