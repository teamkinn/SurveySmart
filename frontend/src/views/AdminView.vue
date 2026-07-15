<template>
  <div class="page-panel">
    <div class="page-title-row">
      <div>
        <div class="page-title">⚙️ Admin Panel</div>
        <div class="page-title-sub">จัดการผู้ใช้งานและแบบสอบถามทั้งหมดในระบบ</div>
      </div>
    </div>

    <div class="admin-tabs">
      <button class="admin-tab" :class="{ active: tab === 'users' }" @click="tab = 'users'">
        👤 รายชื่อผู้ใช้ทั้งหมด
      </button>
      <button class="admin-tab" :class="{ active: tab === 'surveys' }" @click="tab = 'surveys'">
        📋 แบบสอบถามทั้งหมด
      </button>
    </div>

    <!-- ===================== USERS TAB ===================== -->
    <div v-if="tab === 'users'" class="chart-card">
      <h3 style="margin-bottom:12px;">👤 รายชื่อผู้ใช้ทั้งหมด</h3>
      <div v-if="loadingUsers" style="color:var(--text3);font-size:13px;">กำลังโหลด...</div>
      <table v-else class="stat-table">
        <thead>
          <tr>
            <th>#</th>
            <th>ชื่อ</th>
            <th>Username</th>
            <th>Email</th>
            <th>Role</th>
            <th>สถานะ</th>
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
              <span class="role-badge" :class="roleBadgeClass(u.role)">
                {{ roleLabel(u.role) }}
              </span>
            </td>
            <td>
              <span class="role-badge" :class="u.is_active ? 'role-user' : 'role-admin'">
                {{ u.is_active ? '🟢 ใช้งานได้' : '⛔ ถูกระงับ' }}
              </span>
            </td>
            <td style="font-size:11px;color:var(--text3);">{{ formatDate(u.created_at) }}</td>
            <td class="actions-cell">
              <button v-if="isHeadAdmin && u.id !== self.id && u.role === 'user'" class="icon-btn icon-btn-green"
                      title="เลื่อนเป็น Admin" aria-label="เลื่อนเป็น Admin" @click="setRole(u, 'admin')">
                <span class="tri-up"></span>
              </button>
              <button v-if="isHeadAdmin && u.id !== self.id && u.role === 'admin'" class="icon-btn icon-btn-red"
                      title="ลดเป็น User" aria-label="ลดเป็น User" @click="setRole(u, 'user')">
                <span class="tri-down"></span>
              </button>
              <button v-if="isHeadAdmin && u.id !== self.id && u.is_active" class="icon-btn icon-btn-amber"
                      title="ระงับการใช้งาน" aria-label="ระงับการใช้งาน" @click="setStatus(u, false)">⛔</button>
              <button v-if="isHeadAdmin && u.id !== self.id && !u.is_active" class="icon-btn icon-btn-green"
                      title="เปิดใช้งาน" aria-label="เปิดใช้งาน" @click="setStatus(u, true)">✅</button>
              <button v-if="isHeadAdmin && u.id !== self.id" class="icon-btn icon-btn-delete"
                      title="ลบบัญชี" aria-label="ลบบัญชี" @click="deleteUser(u)"><span class="delete-icon">🗑</span></button>
              <span v-if="u.id === self.id" style="color:var(--text3);">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ===================== SURVEYS TAB ===================== -->
    <div v-if="tab === 'surveys'" class="chart-card">
      <h3 style="margin-bottom:12px;">📋 แบบสอบถามทั้งหมดในระบบ</h3>
      <div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.25);border-radius:var(--r);padding:10px 14px;margin-bottom:14px;font-size:12px;color:#dc2626;">
        ⚙️ รวมแบบสอบถามของผู้ใช้ทุกคน ทั้งที่แชร์และไม่ได้แชร์ (รวมถึง Draft ที่ยังไม่เผยแพร่)
      </div>
      <div v-if="loadingSurveys" style="color:var(--text3);font-size:13px;">กำลังโหลด...</div>
      <table v-else class="stat-table">
        <thead>
          <tr>
            <th>#</th>
            <th>ชื่อแบบสอบถาม</th>
            <th>เจ้าของ</th>
            <th>สถานะ</th>
            <th>ผู้ตอบ</th>
            <th>คะแนนเฉลี่ย</th>
            <th>วันที่สร้าง</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, i) in surveys" :key="s.id">
            <td>{{ i + 1 }}</td>
            <td><b>{{ s.title }}</b></td>
            <td style="font-size:12px;color:var(--text3);">
              {{ s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : s.owner_username }}
              <div style="font-size:10px;color:var(--text3);">{{ s.owner_email }}</div>
            </td>
            <td><span class="role-badge" :class="statusBadgeClass(s.status)">{{ statusLabel(s.status) }}</span></td>
            <td><b>{{ s.response_count || 0 }}</b></td>
            <td>{{ s.avg_score ? parseFloat(s.avg_score).toFixed(1) : '—' }}</td>
            <td style="font-size:11px;color:var(--text3);">{{ formatDate(s.created_at) }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-blue" @click="$router.push(`/surveys/${s.id}/responses`)">📊 ดูผล</button>
              <button v-if="isHeadAdmin && s.status === 'draft'" class="btn-sm btn-outline" @click="publishSurvey(s)">🚀 เผยแพร่</button>
              <button v-if="isHeadAdmin" class="btn-sm btn-red" @click="removeSurvey(s)">🗑</button>
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
const self = authStore.user;
const isHeadAdmin = self?.role === 'head_admin';

const tab = ref('users');

const users = ref([]);
const loadingUsers = ref(true);
const surveys = ref([]);
const loadingSurveys = ref(true);

function roleLabel(role) {
  if (role === 'head_admin') return '👑 Head Admin';
  if (role === 'admin') return '⚙️ Admin';
  return '👤 User';
}
function roleBadgeClass(role) {
  if (role === 'head_admin') return 'role-head-admin';
  if (role === 'admin') return 'role-admin';
  return 'role-user';
}
function statusLabel(status) {
  return status === 'active' ? '🟢 Active' : status === 'draft' ? '✏️ Draft' : '⬜ Closed';
}
function statusBadgeClass(status) {
  return status === 'active' ? 'role-user' : status === 'draft' ? 'role-head-admin' : 'role-admin';
}

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const { data } = await api.get('/admin/users');
    users.value = data;
  } finally {
    loadingUsers.value = false;
  }
}

async function loadSurveys() {
  loadingSurveys.value = true;
  try {
    const { data } = await api.get('/admin/surveys');
    surveys.value = data;
  } finally {
    loadingSurveys.value = false;
  }
}

async function setRole(u, role) {
  await api.patch(`/admin/users/${u.id}/role`, { role });
  u.role = role;
  showToast(`เปลี่ยน ${u.username} เป็น ${role} แล้ว`);
}

async function setStatus(u, active) {
  await api.patch(`/admin/users/${u.id}/status`, { is_active: active });
  u.is_active = active ? 1 : 0;
  showToast(active ? `เปิดใช้งานบัญชี ${u.username} แล้ว` : `ระงับบัญชี ${u.username} แล้ว`);
}

async function deleteUser(u) {
  if (!confirm(`ลบผู้ใช้ "${u.username}" หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
  await api.delete(`/admin/users/${u.id}`);
  users.value = users.value.filter(x => x.id !== u.id);
  showToast('ลบผู้ใช้เรียบร้อยแล้ว');
}

async function publishSurvey(s) {
  await api.patch(`/surveys/${s.id}/publish`);
  s.status = 'active';
  showToast(`เผยแพร่ "${s.title}" แล้ว 🚀`);
}

async function removeSurvey(s) {
  if (!confirm(`ลบแบบสอบถาม "${s.title}" หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
  await api.delete(`/surveys/${s.id}`);
  surveys.value = surveys.value.filter(x => x.id !== s.id);
  showToast('ลบแบบสอบถามแล้ว');
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('th-TH') : '—';
}

onMounted(() => {
  loadUsers();
  loadSurveys();
});
</script>

<style scoped>
.role-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 99px; }
.role-admin { background: rgba(239,68,68,.1); color: #dc2626; }
.role-user  { background: rgba(26,86,160,.08); color: var(--royal); }
.role-head-admin { background: rgba(124,58,237,.1); color: #7c3aed; }

.admin-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.admin-tab {
  font-size: 13px; font-weight: 700; padding: 8px 16px; border-radius: 99px;
  border: 1px solid var(--border, #e2e8f0); background: #fff; color: var(--text3);
  cursor: pointer;
}
.admin-tab.active { background: var(--royal); color: #fff; border-color: var(--royal); }

.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border, #e2e8f0);
  cursor: pointer; margin-right: 6px; font-size: 13px; background: #fff;
}
.icon-btn-green { background: rgba(16,185,129,.1); }
.icon-btn-red   { background: rgba(239,68,68,.1); }
.icon-btn-amber { background: rgba(245,158,11,.12); }
.icon-btn-delete {
  width: 32px; height: 32px; background: #dc2626; border-color: #dc2626;
  font-size: 15px;
}
.icon-btn-delete:hover { background: #b91c1c; border-color: #b91c1c; }
.delete-icon { filter: grayscale(1) brightness(2.2); }
.tri-up {
  width: 0; height: 0;
  border-left: 6px solid transparent; border-right: 6px solid transparent;
  border-bottom: 10px solid #10b981;
}
.tri-down {
  width: 0; height: 0;
  border-left: 6px solid transparent; border-right: 6px solid transparent;
  border-top: 10px solid #dc2626;
}
</style>
