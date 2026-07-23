import { defineStore } from 'pinia';
import api from '@/api';

export const useSurveyStore = defineStore('surveys', {
  state: () => ({
    list: [],
    shared: [],
    others: [],
    stats: {},
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
        this.list = s.data;
        this.shared = sh.data;
        this.others = ot.data;
        this.stats = st.data;
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
      // Admins can also edit other users' surveys, shown in `others` — keep
      // that list in sync too so the table reflects the save immediately.
      const oIdx = this.others.findIndex(s => s.id === id);
      if (oIdx >= 0) this.others[oIdx] = { ...this.others[oIdx], ...data };
      return data;
    },
    async publish(id) {
      await api.patch(`/surveys/${id}/publish`);
      const s = this.list.find(x => x.id === id);
      if (s) s.status = 'active';
      const o = this.others.find(x => x.id === id);
      if (o) o.status = 'active';
      const sh = this.shared.find(x => x.id === id);
      if (sh) sh.status = 'active';
    },
    async remove(id) {
      await api.delete(`/surveys/${id}`);
      this.list = this.list.filter(s => s.id !== id);
    },
    async share(id, payload) {
      await api.post(`/surveys/${id}/share`, payload);
    },
    async setSharedAll(id, enabled) {
      const { data } = await api.patch(`/surveys/${id}/share-all`, { enabled });
      const s = this.list.find(x => x.id === id);
      if (s) s.shared_all = data.shared_all;
      return data;
    },
    async getShares(id) {
      const { data } = await api.get(`/surveys/${id}/shares`);
      return data;
    },
    async unshare(id, userId) {
      await api.delete(`/surveys/${id}/share/${userId}`);
    },
    async searchUsers(q) {
      const { data } = await api.get('/users/search', { params: { q } });
      return data;
    },
  },
});
