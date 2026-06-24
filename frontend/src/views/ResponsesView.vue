<template>
  <div class="page-panel">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <button @click="$router.back()" style="background:none;border:1px solid var(--line);border-radius:var(--r2);padding:6px 10px;cursor:pointer;font-size:12px;color:var(--text2);font-family:'Sarabun',sans-serif;">← กลับ</button>
      <div style="flex:1;">
        <div style="font-size:17px;font-weight:800;color:var(--navy);">{{ survey?.title }}</div>
        <div style="font-size:11px;color:var(--text3);">ผลการตอบกลับ</div>
      </div>
      <span v-if="isShared" style="font-size:11px;background:rgba(26,86,160,.08);color:var(--royal);border:1px solid rgba(26,86,160,.2);border-radius:20px;padding:3px 10px;font-weight:600;">👁️ View Only</span>
      <span v-if="survey" class="survey-badge" :class="badgeClass(survey.status)">{{ badgeText(survey.status) }}</span>
    </div>

    <!-- Tabs -->
    <div class="resp-tab-bar">
      <button class="resp-tab" :class="{ active: activeTab === 'list' }" @click="activeTab = 'list'">📋 รายการคำตอบ</button>
      <button class="resp-tab" :class="{ active: activeTab === 'dash' }" @click="activeTab = 'dash'">📊 Dashboard</button>
    </div>

    <!-- ══════════════ LIST TAB ══════════════ -->
    <div v-if="activeTab === 'list'">
      <div class="stats-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
        <div class="stat-card"><div class="stat-card-accent"></div><div class="stat-label">ผู้ตอบทั้งหมด</div><div class="stat-value">{{ responses.length }}</div></div>
        <div class="stat-card">
          <div class="stat-card-accent gold"></div>
          <div class="stat-label">ค่าเฉลี่ย (x̄)</div>
          <div style="display:flex;align-items:baseline;gap:4px;margin:4px 0 2px;">
            <div class="stat-value" style="font-size:24px;">{{ avgScore }}</div>
            <div v-if="avgScore !== '—'" style="font-size:12px;color:var(--text3);">/ 5.0</div>
          </div>
        </div>
        <div class="stat-card"><div class="stat-card-accent"></div><div class="stat-label">เป้าหมาย</div><div class="stat-value">{{ survey?.target_responses || '—' }}</div></div>
        <div class="stat-card"><div class="stat-card-accent"></div><div class="stat-label">ตอบล่าสุด</div><div class="stat-value" style="font-size:16px;">{{ lastDate }}</div></div>
      </div>

      <div class="chart-card">
        <table class="response-table">
          <thead>
            <tr><th>#</th><th>ชื่อ-นามสกุล</th><th>คะแนน</th><th>ข้อเสนอแนะ</th><th>วันที่</th></tr>
          </thead>
          <tbody>
            <tr v-if="responses.length === 0">
              <td colspan="5" style="text-align:center;padding:32px;color:var(--text3);">ยังไม่มีคำตอบ</td>
            </tr>
            <tr v-for="(r, i) in responses" :key="r.id">
              <td>{{ i + 1 }}</td>
              <td><b>{{ r.respondent_name }}</b></td>
              <td>
                <div class="rating-stars">
                  <span v-for="n in 5" :key="n" class="star" :class="{ empty: n > Math.round(parseFloat(r.overall_score) || 0) }">★</span>
                </div>
              </td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ r.note || '—' }}</td>
              <td style="color:var(--text3);font-size:11px;">{{ formatDate(r.submitted_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ══════════════ DASHBOARD TAB ══════════════ -->
    <div v-else>

      <!-- ── Filter bar ── -->
      <div class="filter-bar">
        <div class="filter-group">
          <label class="filter-label">จากวันที่</label>
          <input type="date" v-model="filterFrom" class="filter-input" />
        </div>
        <div class="filter-group">
          <label class="filter-label">ถึงวันที่</label>
          <input type="date" v-model="filterTo" class="filter-input" />
        </div>
        <div class="filter-group" v-if="genderOptions.length">
          <label class="filter-label">เพศ</label>
          <select v-model="filterGender" class="filter-select" style="min-width:120px;">
            <option value="">ทั้งหมด</option>
            <option v-for="opt in genderOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>
        <div style="flex:1;"></div>
        <button @click="exportCSV" class="export-btn">📥 Export CSV</button>
      </div>

      <!-- ── KPI Row ── -->
      <div class="kpi-row">
        <div class="kpi-mini-card">
          <div class="kpi-mini-icon">👥</div>
          <div>
            <div class="kpi-mini-val">{{ filteredResponses.length }}</div>
            <div class="kpi-mini-label">ผู้ตอบทั้งหมด</div>
          </div>
        </div>
        <div class="kpi-mini-card">
          <div class="kpi-mini-icon">⭐</div>
          <div>
            <div class="kpi-mini-val" :class="scoreColorClass">
              {{ avgScore }}<span v-if="avgScore !== '—'" class="kpi-mini-denom"> / 5.00</span>
            </div>
            <div class="kpi-mini-label" style="display:flex;align-items:center;gap:6px;">
              ค่าเฉลี่ย
              <span v-if="avgScore !== '—'" class="interp-badge" :class="interpClass(parseFloat(avgScore))">{{ interpText(parseFloat(avgScore)) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Charts Row: Categorical (Donut) + Satisfaction (Bar) ── -->
      <div v-if="categoricalCharts.length || satisfactionCharts.length" class="charts-2col">

        <!-- Donut charts for categorical questions (e.g. gender) -->
        <div v-for="c in categoricalCharts" :key="c.question_id" class="chart-card">
          <div class="chart-q-text">{{ c.question_text }}</div>
          <div class="chart-q-meta">{{ c.total }} คำตอบ · การแจกแจงหมวดหมู่</div>
          <div v-if="!c.total" class="text-empty">ยังไม่มีคำตอบ</div>
          <div v-else class="donut-area">
            <div class="donut-ring" :style="donutStyle(c.data, c.total)">
              <div class="donut-hole">
                <div class="donut-total">{{ c.total }}</div>
                <div class="donut-sub">คน</div>
              </div>
            </div>
            <div class="donut-legend">
              <div v-for="(item, i) in c.data.filter(d => d.count > 0)" :key="item.label" class="legend-item">
                <span class="legend-dot" :style="{ background: donutColors[i % donutColors.length] }"></span>
                <span class="legend-label">{{ item.label }}</span>
                <span class="legend-count">{{ item.count }} ({{ Math.round(item.count / c.total * 100) }}%)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Bar charts for satisfaction/score questions -->
        <div v-for="c in satisfactionCharts" :key="c.question_id" class="chart-card">
          <div class="chart-q-text">{{ c.question_text }}</div>
          <div class="chart-q-meta">{{ c.total }} คำตอบ · ระดับความพึงพอใจ</div>
          <div v-if="!c.total" class="text-empty">ยังไม่มีคำตอบ</div>
          <div v-else class="bar-chart">
            <div v-for="item in c.data" :key="item.label" class="bar-row">
              <div class="bar-label">{{ item.label }}</div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: c.total ? (item.count / c.total * 100) + '%' : '0%', background: satisfactionColor(item.label) }"></div>
              </div>
              <div class="bar-count">{{ item.count }}</div>
              <div class="bar-pct">{{ c.total ? Math.round(item.count / c.total * 100) : 0 }}%</div>
            </div>
          </div>
        </div>

      </div>

      <!-- ── Raw Data: Respondents Table + Comments Feed ── -->
      <div class="bottom-grid">
        <div class="chart-card">
          <h3>👥 ข้อมูลผู้ตอบ</h3>
          <div v-if="!filteredResponses.length" style="color:var(--text3);font-size:13px;margin-top:8px;">ยังไม่มีคำตอบ</div>
          <table v-else class="stat-table">
            <thead><tr><th>#</th><th>ชื่อ</th><th>คะแนน</th><th>วันที่</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in filteredResponses" :key="r.id">
                <td>{{ i + 1 }}</td>
                <td><b>{{ r.respondent_name }}</b></td>
                <td>
                  <span v-if="r.overall_score" class="score-cell">
                    <span v-for="n in 5" :key="n" :style="{ color: n <= Math.round(r.overall_score) ? '#f59e0b' : '#e2e8f0', fontSize: '11px' }">★</span>
                    {{ parseFloat(r.overall_score).toFixed(1) }}
                  </span>
                  <span v-else style="color:var(--text3);">—</span>
                </td>
                <td style="color:var(--text3);font-size:11px;">{{ formatDate(r.submitted_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="chart-card">
          <h3>💬 ความคิดเห็น</h3>
          <div v-if="!comments.length" style="color:var(--text3);font-size:13px;margin-top:8px;">ยังไม่มีความคิดเห็น</div>
          <div v-else style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
            <div v-for="c in comments" :key="c.id" class="comment-bubble">
              <div class="cb-name">{{ c.respondent_name }}</div>
              <div class="cb-text">{{ c.note }}</div>
              <div class="cb-date">{{ formatDate(c.submitted_at) }}</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useSurveyStore } from '@/stores/surveys';
import api from '@/api';

const route       = useRoute();
const surveyStore = useSurveyStore();
const responses   = ref([]);
const charts      = ref([]);
const activeTab   = ref('list');

// Filters
const filterFrom   = ref('');
const filterTo     = ref('');
const filterGender = ref('');

const donutColors = ['#1a56a0', '#f59e0b', '#64748b', '#22c55e', '#ef4444', '#8b5cf6'];

const survey   = computed(() =>
  surveyStore.list.find(s => s.id === Number(route.params.id)) ||
  surveyStore.shared.find(s => s.id === Number(route.params.id)) ||
  null
);
const isShared = computed(() =>
  !surveyStore.list.find(s => s.id === Number(route.params.id)) &&
  !!surveyStore.shared.find(s => s.id === Number(route.params.id))
);

// ── Chart categorisation ──
const isScoreLabel = label => /\(\d+(?:\.\d+)?\)\s*$/.test(label);

const categoricalCharts = computed(() =>
  charts.value.filter(c => c.chartType === 'bar' && !c.data.some(d => isScoreLabel(d.label)))
);
const satisfactionCharts = computed(() =>
  charts.value.filter(c => c.chartType === 'bar' && c.data.some(d => isScoreLabel(d.label)))
);

// Gender options derived from the first categorical chart
const genderOptions = computed(() => {
  const cat = categoricalCharts.value[0];
  if (!cat) return [];
  return cat.data.filter(d => d.count > 0).map(d => d.label);
});

// ── Filtered responses ──
const filteredResponses = computed(() =>
  responses.value.filter(r => {
    if (filterFrom.value && r.submitted_at < filterFrom.value) return false;
    if (filterTo.value   && r.submitted_at.slice(0, 10) > filterTo.value) return false;
    if (filterGender.value) {
      const answers = Array.isArray(r.answers) ? r.answers : [];
      const genderAns = answers.find(a => a.question_type === 'radio' && !isScoreLabel(a.answer_text || ''));
      if (!genderAns || genderAns.answer_text !== filterGender.value) return false;
    }
    return true;
  })
);

const avgScore = computed(() => {
  const scores = filteredResponses.value.map(r => parseFloat(r.overall_score)).filter(s => !isNaN(s));
  if (!scores.length) return '—';
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
});

const scoreColorClass = computed(() => {
  const s = parseFloat(avgScore.value);
  if (isNaN(s)) return '';
  if (s >= 4.5) return 'score-excellent';
  if (s >= 3.5) return 'score-good';
  if (s >= 2.5) return 'score-mid';
  if (s >= 1.5) return 'score-low';
  return 'score-bad';
});

const comments = computed(() => filteredResponses.value.filter(r => r.note));

const lastDate = computed(() =>
  responses.value.length ? formatDate(responses.value[0].submitted_at) : '—'
);

// ── Donut style ──
function donutStyle(data, total) {
  if (!total) return {};
  let offset = 0;
  const stops = data.map((d, i) => {
    const pct = (d.count / total) * 100;
    const s = `${donutColors[i % donutColors.length]} ${offset}% ${offset + pct}%`;
    offset += pct;
    return s;
  });
  return { background: `conic-gradient(${stops.join(', ')})` };
}

// ── Satisfaction bar color ──
function satisfactionColor(label) {
  if (/ดีมาก|\(5\)/.test(label)) return '#22c55e';
  if (/\bดี\b|\(4\)/.test(label)) return '#3b82f6';
  if (/ปานกลาง|\(3\)/.test(label)) return '#f59e0b';
  if (/พอใช้|\(2\)/.test(label)) return '#f97316';
  return '#ef4444';
}

// ── Export CSV ──
function exportCSV() {
  const rows = [['#', 'ชื่อ-นามสกุล', 'คะแนน', 'วันที่', 'ความคิดเห็น']];
  filteredResponses.value.forEach((r, i) => {
    rows.push([i + 1, r.respondent_name || '', r.overall_score != null ? parseFloat(r.overall_score).toFixed(1) : '', formatDate(r.submitted_at), r.note || '']);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${survey.value?.title || 'responses'}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
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

onMounted(async () => {
  await surveyStore.fetchAll();
  const [r1, r2] = await Promise.all([
    api.get(`/surveys/${route.params.id}/responses`),
    api.get(`/surveys/${route.params.id}/responses/chart-data`),
  ]);
  charts.value = r2.data;
  responses.value = r1.data.map(r => {
    let answers = r.answers;
    if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = []; } }
    answers = Array.isArray(answers) ? answers.filter(a => a && a.question_id) : [];
    const paraAns = answers.find(a => a.question_type === 'para' && a.answer_text);
    return { ...r, answers, note: paraAns?.answer_text || null };
  });
});
</script>

<style scoped>
/* ── Filter Bar ── */
.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 12px 16px;
  margin-bottom: 14px;
  box-shadow: var(--sh);
}
.filter-group { display: flex; flex-direction: column; gap: 3px; }
.filter-label { font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: .4px; }
.filter-input { border: 1px solid var(--line); border-radius: var(--r2); padding: 5px 8px; font-size: 12px; font-family: 'Sarabun', sans-serif; color: var(--text); background: var(--slate); }
.export-btn {
  background: var(--navy);
  color: #fff;
  border: none;
  border-radius: var(--r2);
  padding: 7px 14px;
  font-size: 12px;
  font-family: 'Sarabun', sans-serif;
  font-weight: 700;
  cursor: pointer;
  transition: opacity .15s;
}
.export-btn:hover { opacity: .85; }

/* ── KPI Row ── */
.kpi-row {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 12px;
  margin-bottom: 14px;
}
.kpi-mini-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 16px 20px;
  box-shadow: var(--sh);
}
.kpi-mini-icon { font-size: 28px; flex-shrink: 0; }
.kpi-mini-val  { font-size: 32px; font-weight: 800; color: var(--navy); line-height: 1.1; }
.kpi-mini-denom { font-size: 14px; font-weight: 400; color: var(--text3); }
.kpi-mini-label { font-size: 12px; color: var(--text3); margin-top: 2px; }

/* Score dynamic colors */
.score-excellent { color: #22c55e !important; }
.score-good      { color: #3b82f6 !important; }
.score-mid       { color: #f59e0b !important; }
.score-low       { color: #f97316 !important; }
.score-bad       { color: #ef4444 !important; }

/* ── Charts 2-column ── */
.charts-2col {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

/* ── Donut ── */
.donut-area { display: flex; align-items: center; gap: 20px; margin-top: 12px; flex-wrap: wrap; }
.donut-ring {
  width: 130px;
  height: 130px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
}
.donut-hole {
  position: absolute;
  inset: 22%;
  background: var(--white);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.donut-total { font-size: 20px; font-weight: 800; color: var(--navy); }
.donut-sub   { font-size: 10px; color: var(--text3); }
.donut-legend { display: flex; flex-direction: column; gap: 7px; flex: 1; min-width: 120px; }
.legend-item  { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.legend-dot   { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.legend-label { flex: 1; color: var(--text); }
.legend-count { color: var(--text3); font-size: 11px; white-space: nowrap; }

/* ── Satisfaction bar ── */
.chart-q-text { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 3px; line-height: 1.4; }
.chart-q-meta { font-size: 10px; color: var(--text3); margin-bottom: 12px; }
.bar-chart { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.bar-row   { display: flex; align-items: center; gap: 8px; }
.bar-label { width: 140px; font-size: 11px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; text-align: right; }
.bar-track { flex: 1; height: 20px; background: var(--slate2); border-radius: 10px; overflow: hidden; }
.bar-fill  { height: 100%; border-radius: 10px; transition: width .4s ease; min-width: 3px; }
.bar-count { width: 24px; font-size: 11px; color: var(--text2); text-align: right; flex-shrink: 0; }
.bar-pct   { width: 36px; font-size: 10px; color: var(--text3); flex-shrink: 0; }
.text-empty  { font-size: 12px; color: var(--text3); font-style: italic; margin-top: 10px; }

/* ── Bottom grid ── */
.bottom-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 14px; align-items: start; }

/* ── Stat table ── */
.stat-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
.stat-table th { background: var(--navy); color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; }
.stat-table td { padding: 8px 10px; border-bottom: 1px solid var(--line); color: var(--text); }
.stat-table tr:last-child td { border-bottom: none; }
.stat-table tr:hover td { background: var(--slate); }
.score-cell { display: flex; align-items: center; gap: 4px; font-weight: 700; color: var(--navy); }
</style>
