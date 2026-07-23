<template>
  <div class="page-panel">
    <div class="page-title-row">
      <div>
        <div class="page-title">แชร์ให้ฉันดู</div>
        <div class="page-title-sub">แบบสอบถามที่มีคนแชร์ให้คุณโดยตรง — ดูได้อย่างเดียว</div>
      </div>
    </div>

    <div v-if="!isHeadAdmin" style="background:rgba(26,86,160,.06);border:1px solid rgba(26,86,160,.18);border-radius:var(--r);padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--royal);">
      👁️ สิทธิ์ <b>View Only</b> — ดูผลได้ ไม่สามารถแก้ไขหรือลบได้
    </div>
    <div v-else style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.25);border-radius:var(--r);padding:10px 14px;margin-bottom:14px;font-size:12px;color:#dc2626;">
      ⚙️ โหมด <b>Head Admin</b> — มีสิทธิ์เต็มกับแบบสอบถามที่แชร์มาให้
    </div>

    <div class="filter-bar">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input class="search-input" v-model="search" placeholder="ค้นหา...">
      </div>
      <select class="filter-select" v-model="statusFilter">
        <option value="">📌 ทุกสถานะ</option>
        <option value="active">🟢 Active</option>
        <option value="draft">✏️ Draft</option>
        <option value="closed">⬜ Closed</option>
      </select>
      <button class="btn-sm btn-outline" @click="search = ''; statusFilter = ''">✕ ล้าง</button>
    </div>

    <div style="margin-bottom:10px;" class="filter-result-count">แสดง {{ filtered.length }} จาก {{ surveyStore.shared.length }} รายการ</div>

    <div v-if="filtered.length === 0" class="empty-state">
      <div class="es-icon">👁️</div>
      <div class="es-title">ยังไม่มีใครแชร์แบบสอบถามให้คุณ</div>
      <div class="es-sub">เมื่อมีคนกดแชร์แบบสอบถามให้คุณ จะแสดงที่นี่</div>
    </div>
    <div v-else class="survey-table-wrap">
      <table class="survey-table">
        <thead>
          <tr>
            <th>ชื่อแบบสอบถาม</th>
            <th>แชร์โดย</th>
            <th>สถานะ</th>
            <th>ผู้ตอบ</th>
            <th>คะแนนเฉลี่ย</th>
            <th>แชร์เมื่อ</th>
            <th>ดูผล</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filtered" :key="s.id">
            <td><div class="title-cell">{{ s.title }}</div></td>
            <td style="font-size:12px;color:var(--text3);">{{ s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : s.owner_username }}</td>
            <td><span class="survey-badge" :class="badgeClass(s.status)">{{ badgeText(s.status) }}</span></td>
            <td><span style="font-weight:700;">{{ s.response_count || 0 }}</span></td>
            <td>{{ s.avg_score ? parseFloat(s.avg_score).toFixed(1) : '—' }}</td>
            <td style="color:var(--text3);font-size:11px;">{{ formatDate(s.shared_at) }}</td>
            <td class="actions-cell">
              <button class="btn-sm btn-blue" @click="$router.push(`/surveys/${s.id}/responses`)">📊 ดูผล</button>
              <template v-if="isHeadAdmin">
                <button v-if="s.status === 'draft'" class="btn-sm btn-outline" @click="adminPublish(s.id)">🚀 เผยแพร่</button>
                <button class="btn-sm btn-outline" @click="openEdit(s)">✏️ แก้ไข</button>
                <button class="btn-sm btn-red" @click="adminRemove(s.id)">🗑</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EditSurveyModal ref="editModalRef" @saved="surveyStore.fetchAll" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import { useSurveyStore } from '@/stores/surveys';
import { useAuthStore }   from '@/stores/auth';
import EditSurveyModal from '@/components/Survey/EditSurveyModal.vue';
import { formatDate, badgeClass, badgeText } from '@/composables/useSurveyStatus';

const surveyStore = useSurveyStore();
const authStore = useAuthStore();
const showToast = inject('showToast');
const search = ref('');
const statusFilter = ref('');
const isHeadAdmin = computed(() => authStore.user?.role === 'head_admin');

const editModalRef = ref(null);

const filtered = computed(() =>
  surveyStore.shared.filter(s => {
    const q = search.value.toLowerCase();
    const ok = !q || s.title.toLowerCase().includes(q);
    const st = !statusFilter.value || s.status === statusFilter.value;
    return ok && st;
  })
);

async function adminPublish(id) {
  await surveyStore.publish(id);
  showToast('เผยแพร่แบบสอบถามเรียบร้อยแล้ว 🚀');
}

async function adminRemove(id) {
  if (!confirm('ต้องการลบแบบสอบถามนี้หรือไม่?')) return;
  await surveyStore.remove(id);
  await surveyStore.fetchAll();
  showToast('ลบแบบสอบถามแล้ว');
}

function openEdit(s) {
  const owner = s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : s.owner_username;
  editModalRef.value?.open(s, owner);
}

onMounted(() => surveyStore.fetchAll());
</script>
