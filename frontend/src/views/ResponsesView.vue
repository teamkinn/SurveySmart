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

      <!-- ── Charts Row: Pie Chart (gender) + Avg Score Bar ── -->
      <div class="charts-2col">

        <!-- SVG Pie/Donut for categorical (gender) -->
        <div v-for="c in categoricalCharts" :key="c.question_id" class="chart-card">
          <div class="chart-q-text">{{ c.question_text }}</div>
          <div class="chart-q-meta">{{ c.total }} คำตอบ · การแจกแจง</div>
          <div v-if="!c.total" class="text-empty">ยังไม่มีคำตอบ</div>
          <div v-else class="donut-area">
            <svg viewBox="0 0 36 36" class="donut-svg">
              <!-- background ring -->
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e8edf5" stroke-width="3.8"/>
              <!-- segments -->
              <circle
                v-for="seg in donutSegments(c.data, c.total)"
                :key="seg.label"
                cx="18" cy="18" r="15.9"
                fill="none"
                :stroke="seg.color"
                stroke-width="3.8"
                pathLength="100"
                :stroke-dasharray="`${seg.pct} ${100 - seg.pct}`"
                :stroke-dashoffset="seg.offset"
              />
              <!-- center label -->
              <text x="18" y="16.5" text-anchor="middle" class="svg-num">{{ c.total }}</text>
              <text x="18" y="21.5" text-anchor="middle" class="svg-sub">คน</text>
            </svg>
            <div class="donut-legend">
              <div v-for="(item, i) in c.data" :key="item.label"
                   class="legend-item" :class="{ 'legend-item-zero': item.count === 0 }">
                <span class="legend-dot"
                      :style="{ background: item.count > 0 ? donutColors[i % donutColors.length] : '#dde3ee' }"></span>
                <span class="legend-label">{{ item.label }}</span>
                <span class="legend-count">
                  {{ item.count }}
                  <span v-if="item.count > 0" class="legend-pct">({{ Math.round(item.count / c.total * 100) }}%)</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Average Score Bar Card -->
        <div class="chart-card">
          <div class="chart-q-text">ค่าเฉลี่ยความพึงพอใจ</div>
          <div class="chart-q-meta">{{ filteredResponses.length }} ผู้ตอบ</div>
          <div v-if="avgScore === '—'" class="text-empty">ยังไม่มีข้อมูล</div>
          <template v-else>
            <div class="score-display">
              <span class="score-big" :class="scoreColorClass">{{ avgScore }}</span>
              <span class="score-max">/ 5.00</span>
            </div>
            <!-- Bar -->
            <div class="score-bar-wrap">
              <div class="score-bar-track">
                <div class="score-bar-fill" :class="scoreColorClass + '-bg'"
                     :style="{ width: (parseFloat(avgScore) / 5 * 100) + '%' }"></div>
              </div>
              <div class="score-bar-ticks">
                <span v-for="n in 5" :key="n">{{ n }}</span>
              </div>
            </div>
            <!-- Per-score breakdown bars -->
            <div class="score-breakdown" v-if="scoreBreakdown.length">
              <div v-for="item in scoreBreakdown" :key="item.label" class="breakdown-row">
                <span class="breakdown-label">{{ item.label }}</span>
                <div class="breakdown-track">
                  <div class="breakdown-fill" :style="{ width: item.pct + '%', background: satisfactionColor(item.label) }"></div>
                </div>
                <span class="breakdown-count">{{ item.count }}</span>
              </div>
            </div>
            <span class="interp-badge" :class="interpClass(parseFloat(avgScore))" style="margin-top:14px;display:inline-block;">{{ interpText(parseFloat(avgScore)) }}</span>
          </template>
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

const filterFrom   = ref('');
const filterTo     = ref('');
const filterGender = ref('');

const donutColors = ['#1a56a0', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#f97316'];

const survey = computed(() =>
  surveyStore.list.find(s => s.id === Number(route.params.id)) ||
  surveyStore.shared.find(s => s.id === Number(route.params.id)) || null
);
const isShared = computed(() =>
  !surveyStore.list.find(s => s.id === Number(route.params.id)) &&
  !!surveyStore.shared.find(s => s.id === Number(route.params.id))
);

const isScoreLabel = label => /\(\d+(?:\.\d+)?\)\s*$/.test(label);

// Only categorical radio charts (no score pattern in labels) → donut
const categoricalCharts = computed(() =>
  charts.value.filter(c => c.chartType === 'bar' && !c.data.some(d => isScoreLabel(d.label)))
);

// Satisfaction charts (score pattern in labels) → used for scoreBreakdown
const satisfactionChart = computed(() =>
  charts.value.find(c => c.chartType === 'bar' && c.data.some(d => isScoreLabel(d.label))) || null
);

const scoreBreakdown = computed(() => {
  const c = satisfactionChart.value;
  if (!c || !c.total) return [];
  return c.data.filter(d => d.count > 0).map(d => ({
    label: d.label,
    count: d.count,
    pct: Math.round(d.count / c.total * 100),
  }));
});

const genderOptions = computed(() => {
  const cat = categoricalCharts.value[0];
  if (!cat) return [];
  return cat.data.filter(d => d.count > 0).map(d => d.label);
});

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
const lastDate  = computed(() => responses.value.length ? formatDate(responses.value[0].submitted_at) : '—');

// SVG donut segments (circumference = 100 at r=15.9)
function donutSegments(data, total) {
  if (!total) return [];
  let cumulative = 0;
  return data.map((d, i) => {
    const pct    = (d.count / total) * 100;
    const offset = 25 - cumulative; // 25 = shift start to 12 o'clock
    cumulative  += pct;
    return { pct, offset, color: donutColors[i % donutColors.length], label: d.label };
  }).filter(s => s.pct > 0);
}

function satisfactionColor(label) {
  if (/ดีมาก|\(5\)/.test(label)) return '#22c55e';
  if (/\bดี\b|\(4\)/.test(label)) return '#3b82f6';
  if (/ปานกลาง|\(3\)/.test(label)) return '#f59e0b';
  if (/พอใช้|\(2\)/.test(label)) return '#f97316';
  return '#ef4444';
}

function exportCSV() {
  const rows = [['#', 'ชื่อ-นามสกุล', 'คะแนน', 'วันที่', 'ความคิดเห็น']];
  filteredResponses.value.forEach((r, i) => {
    rows.push([i + 1, r.respondent_name || '', r.overall_score != null ? parseFloat(r.overall_score).toFixed(1) : '', formatDate(r.submitted_at), r.note || '']);
  });
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
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
.export-btn { background: var(--navy); color: #fff; border: none; border-radius: var(--r2); padding: 7px 14px; font-size: 12px; font-family: 'Sarabun', sans-serif; font-weight: 700; cursor: pointer; transition: opacity .15s; }
.export-btn:hover { opacity: .85; }

/* ── KPI Row ── */
.kpi-row { display: grid; grid-template-columns: 1fr 2fr; gap: 12px; margin-bottom: 14px; }
.kpi-mini-card { display: flex; align-items: center; gap: 14px; background: var(--white); border: 1px solid var(--line); border-radius: var(--r); padding: 16px 20px; box-shadow: var(--sh); }
.kpi-mini-icon  { font-size: 28px; flex-shrink: 0; }
.kpi-mini-val   { font-size: 32px; font-weight: 800; color: var(--navy); line-height: 1.1; }
.kpi-mini-denom { font-size: 14px; font-weight: 400; color: var(--text3); }
.kpi-mini-label { font-size: 12px; color: var(--text3); margin-top: 2px; }

/* Score dynamic colors */
.score-excellent { color: #22c55e !important; }
.score-good      { color: #3b82f6 !important; }
.score-mid       { color: #f59e0b !important; }
.score-low       { color: #f97316 !important; }
.score-bad       { color: #ef4444 !important; }

/* ── Charts 2-column ── */
.charts-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }

/* ── SVG Donut ── */
.donut-area { display: flex; align-items: center; gap: 20px; margin-top: 14px; flex-wrap: wrap; }
.donut-svg  { width: 140px; height: 140px; flex-shrink: 0; transform: rotate(-90deg); }
.svg-num    { font-size: 7px; font-weight: 700; fill: var(--navy); transform: rotate(90deg); transform-origin: 18px 16.5px; }
.svg-sub    { font-size: 3.5px; fill: var(--text3); transform: rotate(90deg); transform-origin: 18px 21.5px; }
.donut-legend  { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 100px; }
.legend-item   { display: flex; align-items: center; gap: 7px; font-size: 12px; }
.legend-dot    { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.legend-label  { flex: 1; color: var(--text); }
.legend-count  { color: var(--text3); font-size: 11px; white-space: nowrap; }
.legend-pct    { font-size: 10px; opacity: .75; }
.legend-item-zero .legend-label { color: var(--text3); }
.legend-item-zero .legend-count { opacity: .5; }

/* ── Avg Score Bar ── */
.chart-q-text { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 3px; line-height: 1.4; }
.chart-q-meta { font-size: 10px; color: var(--text3); margin-bottom: 8px; }
.score-display { display: flex; align-items: baseline; gap: 8px; margin: 10px 0 6px; }
.score-big  { font-size: 38px; font-weight: 800; }
.score-max  { font-size: 14px; color: var(--text3); }
.score-bar-wrap  { margin: 4px 0 6px; }
.score-bar-track { height: 18px; background: var(--slate2); border-radius: 99px; overflow: hidden; }
.score-bar-fill  { height: 100%; border-radius: 99px; transition: width .6s ease; }
.score-excellent-bg { background: #22c55e; }
.score-good-bg      { background: #3b82f6; }
.score-mid-bg       { background: #f59e0b; }
.score-low-bg       { background: #f97316; }
.score-bad-bg       { background: #ef4444; }
.score-bar-ticks { display: flex; justify-content: space-between; margin-top: 4px; font-size: 10px; color: var(--text3); padding: 0 2px; }

/* Breakdown bars inside score card */
.score-breakdown { display: flex; flex-direction: column; gap: 5px; margin-top: 14px; }
.breakdown-row   { display: flex; align-items: center; gap: 7px; }
.breakdown-label { width: 110px; font-size: 10px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; text-align: right; }
.breakdown-track { flex: 1; height: 12px; background: var(--slate2); border-radius: 6px; overflow: hidden; }
.breakdown-fill  { height: 100%; border-radius: 6px; transition: width .4s ease; }
.breakdown-count { width: 20px; font-size: 10px; color: var(--text3); text-align: right; flex-shrink: 0; }

.text-empty { font-size: 12px; color: var(--text3); font-style: italic; margin-top: 10px; }

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
