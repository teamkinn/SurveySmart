<template>
  <div class="page-panel">
    <div class="page-title-row">
      <div>
        <div class="page-title">แบบสอบถามของฉัน</div>
        <div class="page-title-sub">จัดการแบบสอบถามที่สร้างไว้ทั้งหมด — ลากการ์ดไปวางบนอัลบัมด้านซ้ายเพื่อจัดหมวดหมู่</div>
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

    <div class="surveys-layout">
      <AlbumSidebar
        :albums="surveyStore.albums"
        :active-id="activeAlbumId"
        :total-count="surveyStore.list.length"
        :unfiled-count="unfiledCount"
        :creating="creatingAlbum"
        @filter="id => activeAlbumId = id"
        @assign="onAssignAlbum"
        @create="onCreateAlbum"
        @delete="onDeleteAlbum"
        @rename="onRenameAlbum"
      />

      <div class="surveys-main">
        <div v-if="filtered.length === 0" class="empty-state">
          <div class="es-icon">🔍</div>
          <div class="es-title">ไม่พบแบบสอบถาม</div>
          <div class="es-sub">ลองเปลี่ยนคำค้นหาหรือตัวกรองใหม่ หรือลากการ์ดมาวางที่นี่</div>
        </div>
        <div v-else class="survey-grid">
          <div
            v-for="s in filtered"
            :key="s.id"
            class="survey-card draggable-card"
            :class="{ dragging: draggingId === s.id }"
            :style="albumBorderStyle(s)"
            draggable="true"
            @dragstart="onDragStart($event, s.id)"
            @dragend="draggingId = null"
          >
            <div class="survey-card-header">
              <span class="drag-handle" aria-hidden="true">⠿⠿⠿</span>
              <span class="survey-badge" :class="badgeClass(s.status)">{{ badgeText(s.status) }}</span>
            </div>
            <div class="survey-title">{{ s.title }}</div>
            <div class="survey-meta">สร้าง {{ formatDate(s.created_at) }}</div>
            <div class="album-tag" v-if="albumOf(s)">
              <span class="album-tag-dot" :style="{ background: albumOf(s).color }"></span>{{ albumOf(s).name }}
            </div>
            <div class="album-tag album-tag-none" v-else>
              <span class="album-tag-dot"></span>ไม่มีหมวดหมู่
            </div>
            <div class="survey-stats">
              <div class="s-stat"><div class="val">{{ s.response_count || 0 }}</div><div class="lbl">ผู้ตอบ</div></div>
              <div class="s-stat">
                <div class="val">{{ s.avg_score ? parseFloat(s.avg_score).toFixed(1) : '—' }}</div>
                <div class="lbl">คะแนนเฉลี่ย</div>
              </div>
            </div>
            <div class="survey-actions">
              <button class="btn-sm btn-blue" @click="$router.push(`/surveys/${s.id}/responses`)">📊 ดูผล</button>
              <button v-if="s.status === 'draft'" class="btn-sm btn-outline" @click="publish(s.id)">🚀 เผยแพร่</button>
              <button class="btn-sm btn-outline" @click="openEdit(s)">✏️ แก้ไข</button>
              <button v-if="s.google_form_url" class="btn-sm btn-outline" @click="openQR(s)">📱 QR</button>
              <a v-if="s.google_form_url" :href="s.google_form_url" target="_blank" rel="noopener noreferrer" class="btn-sm btn-gforms-link">
                <img src="https://ssl.gstatic.com/docs/forms/device_home/android_192.png" style="width:13px;height:13px;vertical-align:middle;margin-right:3px;" alt="">Google Forms
              </a>
              <button class="btn-sm btn-outline" @click="openShare(s)">📤</button>
              <button class="btn-sm btn-red" @click="remove(s.id)">🗑</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- QR modal -->
    <div class="overlay" :class="{ open: qrModal.open }">
      <div class="modal" style="max-width:380px;text-align:center;">
        <div class="modal-header">
          <h2>📱 QR Code Google Forms</h2>
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

    <EditSurveyModal ref="editModalRef" @saved="surveyStore.fetchAll" />

    <ShareModal ref="shareModalRef" />
  </div>
</template>

<script setup>
import { ref, computed, inject, onMounted } from 'vue';
import { useSurveyStore } from '@/stores/surveys';
import EditSurveyModal from '@/components/Survey/EditSurveyModal.vue';
import ShareModal from '@/components/Survey/ShareModal.vue';
import AlbumSidebar from '@/components/Survey/AlbumSidebar.vue';
import { formatDate, badgeClass, badgeText } from '@/composables/useSurveyStatus';

const surveyStore = useSurveyStore();
const showToast = inject('showToast');

const search = ref('');
const statusFilter = ref('');
const sortBy = ref('newest');
const qrModal = ref({ open: false, title: '', url: '', dataUrl: '' });
const copied = ref(false);
const editModalRef = ref(null);
const shareModalRef = ref(null);

// null = "ทั้งหมด" (no album filter), 'unfiled' = only uncategorized
// surveys, a number = only that album's surveys.
const activeAlbumId = ref(null);
const draggingId = ref(null);
const creatingAlbum = ref(false);

const unfiledCount = computed(() => surveyStore.list.filter(s => !s.album_id).length);

function albumOf(s) {
  return surveyStore.albums.find(a => a.id === s.album_id) || null;
}
function albumBorderStyle(s) {
  const a = albumOf(s);
  return a ? { border: `3px solid ${a.color}` } : {};
}

const filtered = computed(() => {
  let result = surveyStore.list.filter(s => {
    const matchQ = !search.value || s.title.toLowerCase().includes(search.value.toLowerCase());
    const matchSt = !statusFilter.value || s.status === statusFilter.value;
    const matchAlbum = activeAlbumId.value === null
      ? true
      : activeAlbumId.value === 'unfiled'
        ? !s.album_id
        : s.album_id === activeAlbumId.value;
    return matchQ && matchSt && matchAlbum;
  });
  if (sortBy.value === 'avg-desc')  result = [...result].sort((a, b) => (parseFloat(b.avg_score) || 0) - (parseFloat(a.avg_score) || 0));
  if (sortBy.value === 'resp-desc') result = [...result].sort((a, b) => (b.response_count || 0) - (a.response_count || 0));
  return result;
});

function clearFilters() {
  search.value = ''; statusFilter.value = ''; sortBy.value = 'newest';
}

function onDragStart(e, id) {
  e.dataTransfer.setData('text/plain', String(id));
  draggingId.value = id;
}

async function onAssignAlbum(surveyId, albumId) {
  const survey = surveyStore.list.find(s => s.id === surveyId);
  if (!survey || survey.album_id === albumId) return;
  try {
    await surveyStore.assignAlbum(surveyId, albumId);
    const album = albumId ? surveyStore.albums.find(a => a.id === albumId) : null;
    showToast(album ? `ย้าย "${survey.title}" ไปที่ ${album.name} แล้ว` : `เอา "${survey.title}" ออกจากอัลบัมแล้ว`);
  } catch (e) {
    showToast(e.response?.data?.message || 'จัดหมวดหมู่ไม่สำเร็จ');
  }
}

async function onCreateAlbum(payload) {
  if (creatingAlbum.value) return;
  creatingAlbum.value = true;
  try {
    await surveyStore.createAlbum(payload);
    showToast(`สร้างอัลบัม "${payload.name}" แล้ว`);
  } catch (e) {
    showToast(e.response?.data?.message || 'สร้างอัลบัมไม่สำเร็จ');
  } finally {
    creatingAlbum.value = false;
  }
}

async function onRenameAlbum(id, payload) {
  try {
    await surveyStore.renameAlbum(id, payload);
    showToast('เปลี่ยนชื่ออัลบัมแล้ว');
  } catch (e) {
    showToast(e.response?.data?.message || 'เปลี่ยนชื่ออัลบัมไม่สำเร็จ');
  }
}

async function onDeleteAlbum(id) {
  try {
    await surveyStore.deleteAlbum(id);
    // Only clear the active filter once the album is actually gone — resetting
    // it beforehand (optimistically) briefly showed "ทั้งหมด" as selected even
    // if the delete request went on to fail, which looked like the filter had
    // silently changed for no reason.
    if (activeAlbumId.value === id) activeAlbumId.value = null;
    showToast('ลบอัลบัมแล้ว');
  } catch (e) {
    showToast(e.response?.data?.message || 'ลบอัลบัมไม่สำเร็จ');
  }
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
  const url = s.google_form_url;
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
  shareModalRef.value?.open(s);
}

function openEdit(s) {
  editModalRef.value?.open(s);
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

.surveys-layout { display: flex; gap: 14px; align-items: flex-start; }
.surveys-main { flex: 1; min-width: 0; }

/* The default .survey-card::before top accent strip clashes with the
   album-color border below (both compete for the same top edge) — this
   view's cards signal category via the full border instead. */
.draggable-card::before { display: none; }
.draggable-card { cursor: grab; border-width: 1px; transition: transform .12s, box-shadow .12s, opacity .12s, border-color .12s; }
.draggable-card:active { cursor: grabbing; }
.draggable-card.dragging { opacity: .4; }
.drag-handle { color: var(--text3); font-size: 11px; letter-spacing: 1px; }

.album-tag { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--text3); margin-bottom: 8px; }
.album-tag-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.album-tag-none .album-tag-dot { background: var(--line); }
</style>
