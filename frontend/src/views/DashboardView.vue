<template>
  <div class="page-panel">
    <div class="page-title-row">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-title-sub">สถิติและการวิเคราะห์ผลแบบสอบถาม</div>
      </div>
    </div>

    <div class="dash-selector-bar">
      <label>📋 เลือกแบบสอบถาม</label>
      <select class="filter-select" style="flex:1;" v-model="selectedId">
        <option v-for="s in withResponses" :key="s.id" :value="s.id">{{ s.title }}</option>
      </select>
    </div>

    <div v-if="!selected" class="empty-state">
      <div class="es-icon">📊</div>
      <div class="es-title">เลือกแบบสอบถามเพื่อดู Dashboard</div>
    </div>

    <template v-else>
      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-label">ผู้ตอบทั้งหมด</div>
          <div class="stat-value">{{ selected.response_count || 0 }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">ค่าเฉลี่ยรวม (x̄)</div>
          <div style="display:flex;align-items:baseline;gap:4px;margin:6px 0 2px;">
            <div class="stat-value">{{ avgScore }}</div>
            <div v-if="avgScore !== '—'" style="font-size:13px;color:var(--text3);">/ 5.00</div>
          </div>
          <span v-if="avgScore !== '—'" class="interp-badge" :class="interpClass(parseFloat(avgScore))">{{ interpText(parseFloat(avgScore)) }}</span>
        </div>
        <div class="stat-card">
          <div class="stat-label">สถานะ</div>
          <div class="stat-value" style="font-size:16px;">
            <span class="survey-badge" :class="badgeClass(selected.status)">{{ badgeText(selected.status) }}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">วันที่สร้าง</div>
          <div class="stat-value" style="font-size:16px;">{{ formatDate(selected.created_at) }}</div>
        </div>
      </div>

      <!-- Per-question charts -->
      <div v-if="charts.length" class="section-heading">📊 ผลตอบรับรายคำถาม</div>
      <div class="charts-grid">
        <div v-for="c in charts" :key="c.question_id" class="chart-card">
          <div class="chart-q-text">{{ c.question_text }}</div>
          <div class="chart-q-meta">{{ c.total }} คำตอบ · {{ typeLabel(c.question_type) }}</div>

          <!-- Bar chart for radio/checkbox/dropdown -->
          <div v-if="c.chartType === 'bar' && c.data.length" class="bar-chart">
            <div v-for="item in c.data" :key="item.label" class="bar-row">
              <div class="bar-label">{{ item.label }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :style="{ width: c.total ? (item.count / c.total * 100) + '%' : '0%' }"
                ></div>
              </div>
              <div class="bar-count">{{ item.count }}</div>
              <div class="bar-pct">{{ c.total ? Math.round(item.count / c.total * 100) : 0 }}%</div>
            </div>
          </div>

          <!-- Score distribution for scale/star -->
          <div v-else-if="c.chartType === 'score' && c.data.length" class="bar-chart">
            <div v-for="item in c.data" :key="item.label" class="bar-row">
              <div class="bar-label score-label">{{ item.label }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill bar-fill-gold"
                  :style="{ width: c.total ? (item.count / c.total * 100) + '%' : '0%' }"
                ></div>
              </div>
              <div class="bar-count">{{ item.count }}</div>
            </div>
          </div>

          <!-- Text answers -->
          <div v-else-if="c.chartType === 'text'" class="text-answers">
            <div v-if="!c.data.length" class="text-empty">ยังไม่มีคำตอบ</div>
            <div v-else v-for="(t, i) in c.data" :key="i" class="text-bubble">{{ t }}</div>
          </div>

          <div v-else class="text-empty">ยังไม่มีข้อมูลเพียงพอ</div>
        </div>
      </div>

      <!-- Respondents table + Comments -->
      <div style="display:grid;grid-template-columns:3fr 2fr;gap:14px;align-items:start;margin-top:14px;">
        <div class="chart-card">
          <h3>👥 ข้อมูลผู้ตอบ</h3>
          <div v-if="responses.length === 0" style="color:var(--text3);font-size:13px;">ยังไม่มีคำตอบ</div>
          <table v-else class="stat-table">
            <thead><tr><th>ชื่อ</th><th>คะแนน</th><th>วันที่</th></tr></thead>
            <tbody>
              <tr v-for="r in responses" :key="r.id">
                <td>{{ r.respondent_name }}</td>
                <td class="avg-cell">{{ r.score ? parseFloat(r.score).toFixed(1) : '—' }}</td>
                <td style="font-size:11px;color:var(--text3);">{{ formatDate(r.submitted_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="chart-card">
          <h3>💬 ความคิดเห็นล่าสุด</h3>
          <div v-if="comments.length === 0" style="color:var(--text3);font-size:13px;">ยังไม่มีความคิดเห็น</div>
          <div v-else style="display:flex;flex-direction:column;gap:8px;">
            <div v-for="c in comments" :key="c.id" class="comment-bubble">
              <div class="cb-name">{{ c.respondent_name }}</div>
              <div class="cb-text">{{ c.note }}</div>
              <div class="cb-date">{{ formatDate(c.submitted_at) }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useSurveyStore } from '@/stores/surveys';
import api from '@/api';

const surveyStore = useSurveyStore();
const selectedId  = ref(null);
const responses   = ref([]);
const charts      = ref([]);

const withResponses = computed(() => surveyStore.list.filter(s => (s.response_count || 0) > 0));
const selected      = computed(() => surveyStore.list.find(s => s.id === selectedId.value) || null);
const avgScore = computed(() => {
  const a = parseFloat(selected.value?.avg_score);
  return isNaN(a) ? '—' : a.toFixed(2);
});
const comments = computed(() => responses.value.filter(r => r.note));

const Q_TYPE_LABELS = {
  short: 'คำตอบสั้นๆ', para: 'ย่อหน้า', radio: 'หลายตัวเลือก',
  checkbox: 'ช่องทำเครื่องหมาย', dropdown: 'เลื่อนลง', scale: 'สเกล',
  star: 'ดาว', date: 'วันที่', time: 'เวลา',
};
function typeLabel(t) { return Q_TYPE_LABELS[t] || t; }

watch(selectedId, async (id) => {
  if (!id) { responses.value = []; charts.value = []; return; }
  const [r1, r2] = await Promise.all([
    api.get(`/surveys/${id}/responses`),
    api.get(`/surveys/${id}/responses/chart-data`),
  ]);
  responses.value = r1.data;
  charts.value    = r2.data;
});

watch(withResponses, (list) => {
  if (list.length && !selectedId.value) selectedId.value = list[0].id;
}, { immediate: true });

function formatDate(d) { return d ? new Date(d).toLocaleDateString('th-TH') : '—'; }
function badgeClass(s) { return { 'badge-active': s === 'active', 'badge-draft': s === 'draft', 'badge-closed': s === 'closed' }; }
function badgeText(s)  { return s === 'active' ? '🟢 Active' : s === 'draft' ? '✏️ Draft' : '⬜ Closed'; }

function interpClass(avg) {
  if (avg >= 4.5) return 'interp-5';
  if (avg >= 3.5) return 'interp-4';
  if (avg >= 2.5) return 'interp-3';
  if (avg >= 1.5) return 'interp-2';
  return 'interp-1';
}
function interpText(avg) {
  if (avg >= 4.5) return 'ดีมาก';
  if (avg >= 3.5) return 'ดี';
  if (avg >= 2.5) return 'ปานกลาง';
  if (avg >= 1.5) return 'พอใช้';
  return 'ควรปรับปรุง';
}

onMounted(() => surveyStore.fetchAll());
</script>

<style scoped>
.section-heading {
  font-size: 14px; font-weight: 700; color: var(--navy);
  margin: 18px 0 10px; letter-spacing: .2px;
}
.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.chart-q-text {
  font-size: 13px; font-weight: 700; color: var(--text);
  margin-bottom: 3px; line-height: 1.4;
}
.chart-q-meta { font-size: 10px; color: var(--text3); margin-bottom: 12px; }

/* ── Bar chart ── */
.bar-chart { display: flex; flex-direction: column; gap: 8px; }
.bar-row   { display: flex; align-items: center; gap: 8px; }
.bar-label {
  width: 130px; font-size: 11px; color: var(--text2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 0; text-align: right;
}
.score-label { width: 28px; text-align: center; font-weight: 700; }
.bar-track {
  flex: 1; height: 18px; background: var(--slate2);
  border-radius: 9px; overflow: hidden;
}
.bar-fill {
  height: 100%; background: var(--royal);
  border-radius: 9px; transition: width .4s ease;
  min-width: 2px;
}
.bar-fill-gold { background: var(--gold); }
.bar-count { width: 24px; font-size: 11px; color: var(--text2); text-align: right; flex-shrink: 0; }
.bar-pct   { width: 34px; font-size: 10px; color: var(--text3); flex-shrink: 0; }

/* ── Text answers ── */
.text-answers { display: flex; flex-direction: column; gap: 6px; }
.text-bubble {
  background: var(--slate); border-radius: var(--r2);
  padding: 7px 10px; font-size: 12px; color: var(--text);
  border-left: 3px solid var(--royal2);
}
.text-empty { font-size: 12px; color: var(--text3); font-style: italic; }
</style>
