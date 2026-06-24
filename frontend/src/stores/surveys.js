import { defineStore } from 'pinia';
import api from '@/api';

export const useSurveyStore = defineStore('surveys', {
  state: () => ({
    list:   [],
    shared: [],
    others: [],
    stats:  {},
    loading: false,
  }),
  actions: {
    async fetchAll() {
      this.loading = true;
      try {
        const [s, sh, ot, st] = await Promise.all([
          api.get('/surveys'),
          api.get('/surveys/shared'),
          api.get('/surveys/others'),
          api.get('/surveys/stats'),
        ]);
        this.list   = s.data;
        this.shared = sh.data;
        this.others = ot.data;
        this.stats  = st.data;
      } finally {
        this.loading = false;
      }
    },
    async create(payload) {
      const { data } = await api.post('/surveys', payload);
      this.list.unshift(data);
      return data;
    },
    async update(id, payload) {
      const { data } = await api.put(`/surveys/${id}`, payload);
      const idx = this.list.findIndex(s => s.id === id);
      if (idx >= 0) this.list[idx] = data;
      return data;
    },
    async publish(id) {
      await api.patch(`/surveys/${id}/publish`);
      const s = this.list.find(x => x.id === id);
      if (s) s.status = 'active';
    },
    async remove(id) {
      await api.delete(`/surveys/${id}`);
      this.list = this.list.filter(s => s.id !== id);
    },
    async share(id, email) {
      await api.post(`/surveys/${id}/share`, { email });
    },
  },
});
