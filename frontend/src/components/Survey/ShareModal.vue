<template>
  <div class="overlay" :class="{ open: isOpen }">
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <h2>📤 แชร์แบบสอบถาม</h2>
        <button class="modal-close" @click="close">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text3);margin-bottom:14px;">{{ survey?.title }}</p>

        <div class="field">
          <label>ค้นหาด้วยอีเมล ชื่อผู้ใช้ หรือชื่อ</label>
          <input v-model="query" type="text" placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร...">
        </div>

        <div v-if="query.trim().length >= 2" class="sm-results">
          <div v-if="searching" style="padding:10px;font-size:12px;color:var(--text3);">กำลังค้นหา...</div>
          <div v-else-if="!results.length" style="padding:10px;font-size:12px;color:var(--text3);">ไม่พบผู้ใช้ที่ตรงกัน</div>
          <div v-else class="sm-result-row" v-for="u in results" :key="u.id">
            <div class="sm-avatar">{{ initials(u) }}</div>
            <div class="sm-user-info">
              <div class="sm-user-name">{{ displayName(u) }}</div>
              <div class="sm-user-email">{{ u.email }}</div>
            </div>
            <button
              class="btn-sm btn-outline"
              :disabled="alreadyShared(u.id) || busyId === u.id"
              @click="addShare(u)"
            >{{ alreadyShared(u.id) ? '✓ แชร์แล้ว' : (busyId === u.id ? '...' : 'เพิ่ม') }}</button>
          </div>
        </div>

        <div style="margin-top:16px;">
          <label style="font-size:12px;font-weight:700;color:var(--text2);display:block;margin-bottom:8px;">แชร์ให้แล้ว ({{ shares.length }})</label>
          <div v-if="loadingShares" style="font-size:12px;color:var(--text3);">กำลังโหลด...</div>
          <div v-else-if="!shares.length" style="font-size:12px;color:var(--text3);">ยังไม่ได้แชร์ให้ใคร</div>
          <div v-else class="sm-chips">
            <span v-for="u in shares" :key="u.id" class="sm-chip">
              {{ u.email }}
              <button class="sm-chip-x" :disabled="busyId === u.id" @click="removeShare(u)" :title="`ยกเลิกแชร์กับ ${u.email}`">✕</button>
            </span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-sm btn-blue" @click="close">เสร็จสิ้น</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, inject } from 'vue';
import { useSurveyStore } from '@/stores/surveys';

const surveyStore = useSurveyStore();
const showToast = inject('showToast');

const isOpen = ref(false);
const survey = ref(null);
const query = ref('');
const results = ref([]);
const searching = ref(false);
const shares = ref([]);
const loadingShares = ref(false);
const busyId = ref(null);

let searchTimer = null;
watch(query, (q) => {
  clearTimeout(searchTimer);
  q = q.trim();
  if (q.length < 2) { results.value = []; return; }
  searchTimer = setTimeout(async () => {
    searching.value = true;
    try {
      results.value = await surveyStore.searchUsers(q);
    } finally {
      searching.value = false;
    }
  }, 300);
});

function displayName(u) {
  return u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username;
}
function initials(u) {
  return (u.first_name?.[0] || u.username?.[0] || '?').toUpperCase();
}
function alreadyShared(userId) {
  return shares.value.some(s => s.id === userId);
}

async function loadShares() {
  if (!survey.value?.id) return;
  loadingShares.value = true;
  try {
    shares.value = await surveyStore.getShares(survey.value.id);
  } catch (e) {
    showToast?.(e.response?.data?.message || 'โหลดรายชื่อที่แชร์ไม่สำเร็จ');
  } finally {
    loadingShares.value = false;
  }
}

async function addShare(u) {
  busyId.value = u.id;
  try {
    await surveyStore.share(survey.value.id, { user_id: u.id });
    shares.value = [{ ...u, shared_at: new Date().toISOString() }, ...shares.value];
    showToast?.(`แชร์ให้ ${displayName(u)} เรียบร้อยแล้ว`);
  } catch (e) {
    showToast?.(e.response?.data?.message || 'แชร์ไม่สำเร็จ');
  } finally {
    busyId.value = null;
  }
}

async function removeShare(u) {
  busyId.value = u.id;
  try {
    await surveyStore.unshare(survey.value.id, u.id);
    shares.value = shares.value.filter(s => s.id !== u.id);
  } catch (e) {
    showToast?.(e.response?.data?.message || 'ยกเลิกแชร์ไม่สำเร็จ');
  } finally {
    busyId.value = null;
  }
}

async function open(s) {
  survey.value = s;
  query.value = '';
  results.value = [];
  isOpen.value = true;
  await loadShares();
}

function close() {
  isOpen.value = false;
}

defineExpose({ open });
</script>

<style scoped>
.sm-results { margin-top: 8px; border: 1px solid var(--line); border-radius: var(--r2); max-height: 180px; overflow-y: auto; }
.sm-result-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
.sm-result-row:last-child { border-bottom: none; }
.sm-avatar { width: 28px; height: 28px; border-radius: 50%; background: rgba(26,86,160,.1); color: var(--royal); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.sm-user-info { flex: 1; min-width: 0; }
.sm-user-name { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-user-email { font-size: 11px; color: var(--text3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.sm-chip { display: inline-flex; align-items: center; gap: 6px; background: rgba(26,86,160,.08); color: var(--royal); font-size: 12px; padding: 4px 6px 4px 10px; border-radius: 20px; }
.sm-chip-x { background: none; border: none; cursor: pointer; color: var(--royal); font-size: 11px; padding: 2px; line-height: 1; }
.sm-chip-x:disabled { opacity: .5; cursor: default; }
</style>
