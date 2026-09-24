import { defineStore } from 'pinia';
import api from '@/api';

export const useSurveyStore = defineStore('surveys', {
  state: () => ({
    list: [],
    shared: [],
    others: [],
    stats: {},
    albums: [],
    loading: false,
  }),
  actions: {
    async fetchAll() {
      this.loading = true;
      try {
        // /surveys/others is admin-only server-side (returns [] for everyone
        // else) — skip the request entirely for regular users.
        let role = null;
        try { role = JSON.parse(localStorage.getItem('user') || 'null')?.role; } catch { /* malformed — treat as non-admin */ }
        const isAdmin = ['admin', 'head_admin'].includes(role);
        const [s, sh, ot, st, al] = await Promise.all([
          api.get('/surveys'),
          api.get('/surveys/shared'),
          isAdmin ? api.get('/surveys/others') : Promise.resolve({ data: [] }),
          api.get('/surveys/stats'),
          api.get('/albums'),
        ]);
        this.list = s.data;
        this.shared = sh.data;
        this.others = ot.data;
        this.stats = st.data;
        this.albums = al.data;
      } finally {
        this.loading = false;
      }
    },
    async createAlbum(payload) {
      const { data } = await api.post('/albums', payload);
      this.albums.push(data);
      return data;
    },
    async renameAlbum(id, payload) {
      const { data } = await api.patch(`/albums/${id}`, payload);
      const idx = this.albums.findIndex(a => a.id === id);
      if (idx >= 0) this.albums[idx] = { ...this.albums[idx], ...data };
      return data;
    },
    async deleteAlbum(id) {
      await api.delete(`/albums/${id}`);
      this.albums = this.albums.filter(a => a.id !== id);
      // Deleting an album un-categorizes its surveys server-side (ON DELETE
      // SET NULL) — mirror that locally so cards immediately show as
      // uncategorized instead of pointing at an album that no longer exists.
      this.list.forEach(s => { if (s.album_id === id) s.album_id = null; });
    },
    // albumId may be a number (assign) or null (un-categorize).
    async assignAlbum(surveyId, albumId) {
      const { data } = await api.patch(`/surveys/${surveyId}/album`, { album_id: albumId });
      const s = this.list.find(x => x.id === surveyId);
      const prevAlbumId = s?.album_id;
      if (s) s.album_id = data.album_id;
      const prevAlbum = this.albums.find(a => a.id === prevAlbumId);
      if (prevAlbum) prevAlbum.survey_count = Math.max(0, (prevAlbum.survey_count || 0) - 1);
      const nextAlbum = this.albums.find(a => a.id === data.album_id);
      if (nextAlbum) nextAlbum.survey_count = (nextAlbum.survey_count || 0) + 1;
      return data;
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
      const removed = this.list.find(s => s.id === id);
      const album = this.albums.find(a => a.id === removed?.album_id);
      if (album) album.survey_count = Math.max(0, (album.survey_count || 0) - 1);
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
