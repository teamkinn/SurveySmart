<template>
  <div class="page-panel">
    <div class="page-title-row">
      <div>
        <div class="page-title">แบบสอบถามของฉัน</div>
        <div class="page-title-sub">จัดการแบบสอบถามที่สร้างไว้ทั้งหมด</div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input class="search-input" v-model="search" placeholder="ค้นหาชื่อแบบสอบถาม...">
      </div>
      <select class="filter-select" v-model="statusFilter">
        <option value="">📌 ทุกสถานะ</option>
        <option value="active">🟢 Active</option>
        <option value="draft">✏️ Draft</option>
        <option value="closed">⬜ Closed</option>
      </select>
      <select class="filter-select" v-model="sortBy">
        <option value="newest">🕐 ล่าสุดก่อน</option>
        <option value="avg-desc">⭐ คะแนนสูง→ต่ำ</option>
        <option value="resp-desc">👥 ผู้ตอบมาก→น้อย</option>
      </select>
      <button class="btn-sm btn-outline" @click="clearFilters">✕ ล้าง</button>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div class="filter-result-count">แสดง {{ filtered.length }} จาก {{ surveyStore.list.length }} รายการ</div>
    </div>

    <div v-if="filtered.length === 0" class="empty-state">
      <div class="es-icon">🔍</div>
      <div class="es-title">ไม่พบแบบสอบถาม</div>
      <div class="es-sub">ลองเปลี่ยนคำค้นหาหรือตัวกรองใหม่</div>
    </div>
    <div v-else class="survey-table-wrap">
      <table class="survey-table">
        <thead>
          <tr>
            <th>ชื่อแบบสอบถาม</th>
            <th>สถานะ</th>
            <th>ผู้ตอบ</th>
            <th>คะแนนเฉลี่ย</th>
            <th>วันที่สร้าง</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filtered" :key="s.id">
            <td><div class="title-cell">{{ s.title }}</div></td>
            <td><span class="survey-badge" :class="badgeClass(s.status)">{{ badgeText(s.status) }}</span></td>
            <td><span style="font-weight:700;color:var(--navy);">{{ s.response_count || 0 }}</span></td>
            <td>
              <div class="rating-stars">
                <span v-for="n in 5" :key="n" class="star" :class="{ empty: n > Math.round(parseFloat(s.avg_score) || 0) }">★</span>
              </div>
              <span style="font-size:11px;font-weight:700;color:var(--royal);margin-left:4px;">
                {{ s.avg_score ? parseFloat(s.avg_score).toFixed(1) : '' }}
              </span>
            </td>
            <td class="date-cell">{{ formatDate(s.created_at) }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-blue" @click="$router.push(`/surveys/${s.id}/responses`)">📊 ดูผล</button>
              <button v-if="s.status === 'draft'" class="btn-sm btn-outline" @click="publish(s.id)">🚀 เผยแพร่</button>
              <button v-if="s.status === 'active' && s.share_token" class="btn-sm btn-outline" @click="openQR(s)">📱 QR</button>
              <a v-if="s.google_form_url" :href="s.google_form_url" target="_blank" class="btn-sm btn-gforms-link">
                <img src="https://ssl.gstatic.com/docs/forms/device_home/android_192.png" style="width:13px;height:13px;vertical-align:middle;margin-right:3px;" alt="">Google Forms
              </a>
              <button class="btn-sm btn-outline" @click="openShare(s)">📤</button>
              <button class="btn-sm btn-red" @click="remove(s.id)">🗑</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- QR modal -->
    <div class="overlay" :class="{ open: qrModal.open }">
      <div class="modal" style="max-width:380px;text-align:center;">
        <div class="modal-header">
          <h2>📱 QR Code แบบสอบถาม</h2>
          <button class="modal-close" @click="qrModal.open = false">✕</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;align-items:center;gap:14px;">
          <div style="font-size:13px;font-weight:700;color:var(--navy);">{{ qrModal.title }}</div>
          <img v-if="qrModal.dataUrl" :src="qrModal.dataUrl" style="width:220px;height:220px;border:1px solid var(--line);border-radius:10px;padding:8px;background:#fff;" alt="QR Code">
          <div style="width:100%;">
            <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">ลิงก์แบบสอบถาม</div>
            <div style="display:flex;gap:6px;align-items:center;">
              <input readonly :value="qrModal.url" style="flex:1;font-size:11px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--slate);color:var(--text2);">
              <button class="btn-sm btn-blue" @click="copyLink">{{ copied ? '✓ คัดลอก' : '📋 คัดลอก' }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Share modal -->
    <div class="overlay" :class="{ open: shareModal.open }">
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <h2>📤 แชร์แบบสอบถาม</h2>
          <button class="modal-close" @click="shareModal.open = false">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--text3);margin-bottom:12px;">กรอกอีเมลผู้ใช้ที่ต้องการแชร์</p>
          <div class="field"><label>อีเมล</label><input type="email" v-model="shareModal.email" placeholder="email@example.com"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-sm btn-outline" @click="shareModal.open = false">ยกเลิก</button>
          <button class="btn-sm btn-blue" @click="doShare">แชร์</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject, onMounted } from 'vue';
import { useSurveyStore } from '@/stores/surveys';

const surveyStore = useSurveyStore();
const showToast   = inject('showToast');

const search       = ref('');
const statusFilter = ref('');
const sortBy       = ref('newest');
const shareModal   = ref({ open: false, surveyId: null, email: '' });
const qrModal      = ref({ open: false, title: '', url: '', dataUrl: '' });
const copied       = ref(false);

const filtered = computed(() => {
  let result = surveyStore.list.filter(s => {
    const matchQ  = !search.value || s.title.toLowerCase().includes(search.value.toLowerCase());
    const matchSt = !statusFilter.value || s.status === statusFilter.value;
    return matchQ && matchSt;
  });
  if (sortBy.value === 'avg-desc')  result = [...result].sort((a, b) => (parseFloat(b.avg_score) || 0) - (parseFloat(a.avg_score) || 0));
  if (sortBy.value === 'resp-desc') result = [...result].sort((a, b) => (b.response_count || 0) - (a.response_count || 0));
  return result;
});

function badgeClass(status) {
  return { 'badge-active': status === 'active', 'badge-draft': status === 'draft', 'badge-closed': status === 'closed' };
}
function badgeText(status) {
  return status === 'active' ? '🟢 Active' : status === 'draft' ? '✏️ Draft' : '⬜ Closed';
}
function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('th-TH') : '—';
}
function clearFilters() {
  search.value = ''; statusFilter.value = ''; sortBy.value = 'newest';
}

async function publish(id) {
  await surveyStore.publish(id);
  showToast('เผยแพร่แบบสอบถามเรียบร้อยแล้ว 🚀');
}

async function remove(id) {
  if (!confirm('ต้องการลบแบบสอบถามนี้หรือไม่?')) return;
  await surveyStore.remove(id);
  showToast('ลบแบบสอบถามแล้ว');
}

async function openQR(s) {
  const url = `${window.location.origin}/fill/${s.share_token}`;
  const { default: QRCode } = await import('qrcode');
  const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
  qrModal.value = { open: true, title: s.title, url, dataUrl };
  copied.value = false;
}

function copyLink() {
  navigator.clipboard.writeText(qrModal.value.url);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

function openShare(s) {
  shareModal.value = { open: true, surveyId: s.id, email: '' };
}

async function doShare() {
  try {
    await surveyStore.share(shareModal.value.surveyId, shareModal.value.email);
    shareModal.value.open = false;
    showToast('แชร์แบบสอบถามเรียบร้อยแล้ว');
  } catch (e) {
    showToast(e.response?.data?.message || 'เกิดข้อผิดพลาด');
  }
}

onMounted(() => surveyStore.fetchAll());
</script>

<style scoped>
.btn-gforms-link {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  background: white;
  border: 1.5px solid #dadce0;
  border-radius: var(--r2);
  font-size: 11px;
  font-weight: 600;
  color: #3c4043;
  text-decoration: none;
  white-space: nowrap;
}
.btn-gforms-link:hover { background: #f8f9fa; border-color: #c6c6c6; }
</style>
