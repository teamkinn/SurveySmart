<template>
  <div class="page-panel">
    <div class="page-title-row">
      <div>
        <div class="page-title">⚙️ Admin Panel</div>
        <div class="page-title-sub">จัดการผู้ใช้งานทั้งหมดในระบบ</div>
      </div>
    </div>

    <div class="chart-card">
      <h3 style="margin-bottom:12px;">👤 รายชื่อผู้ใช้ทั้งหมด</h3>
      <div v-if="loading" style="color:var(--text3);font-size:13px;">กำลังโหลด...</div>
      <table v-else class="stat-table">
        <thead>
          <tr>
            <th>#</th>
            <th>ชื่อ</th>
            <th>Username</th>
            <th>Email</th>
            <th>Role</th>
            <th>สมัครเมื่อ</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(u, i) in users" :key="u.id">
            <td>{{ i + 1 }}</td>
            <td><b>{{ u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : '—' }}</b></td>
            <td style="color:var(--text3);">{{ u.username }}</td>
            <td style="font-size:11px;color:var(--text3);">{{ u.email }}</td>
            <td>
              <span class="role-badge" :class="u.role === 'admin' ? 'role-admin' : 'role-user'">
                {{ u.role === 'admin' ? '⚙️ Admin' : '👤 User' }}
              </span>
            </td>
            <td style="font-size:11px;color:var(--text3);">{{ formatDate(u.created_at) }}</td>
            <td class="actions-cell">
              <button v-if="u.id !== self.id && u.role !== 'admin'" class="btn-sm btn-outline"
                      @click="setRole(u, 'admin')">⬆️ Admin</button>
              <button v-if="u.id !== self.id && u.role === 'admin'" class="btn-sm btn-outline"
                      @click="setRole(u, 'user')">⬇️ User</button>
              <button v-if="u.id !== self.id" class="btn-sm btn-red"
                      @click="deleteUser(u)">🗑</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue';
import { useAuthStore } from '@/stores/auth';
import api from '@/api';

const authStore = useAuthStore();
const showToast = inject('showToast');
const self      = authStore.user;
const users     = ref([]);
const loading   = ref(true);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/users');
    users.value = data;
  } finally {
    loading.value = false;
  }
}

async function setRole(u, role) {
  await api.patch(`/admin/users/${u.id}/role`, { role });
  u.role = role;
  showToast(`เปลี่ยน ${u.username} เป็น ${role} แล้ว`);
}

async function deleteUser(u) {
  if (!confirm(`ลบผู้ใช้ "${u.username}" หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
  await api.delete(`/admin/users/${u.id}`);
  users.value = users.value.filter(x => x.id !== u.id);
  showToast('ลบผู้ใช้เรียบร้อยแล้ว');
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('th-TH') : '—';
}

onMounted(load);
</script>

<style scoped>
.role-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 99px; }
.role-admin { background: rgba(239,68,68,.1); color: #dc2626; }
.role-user  { background: rgba(26,86,160,.08); color: var(--royal); }
</style>
