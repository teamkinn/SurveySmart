<template>
  <div class="page-panel">
    <div class="page-title-row">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-title-sub">สถิติและการวิเคราะห์ผลแบบสอบถาม</div>
      </div>
    </div>

    <!-- ── Global KPI cards ── -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-icon">📋</div>
        <div class="kpi-body">
          <div class="kpi-value">{{ surveyStore.stats.total || 0 }}</div>
          <div class="kpi-label">แบบสอบถามทั้งหมด</div>
        </div>
        <div class="kpi-sub">🟢 {{ surveyStore.stats.active || 0 }} กำลังใช้งาน</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">👥</div>
        <div class="kpi-body">
          <div class="kpi-value">{{ surveyStore.stats.total_responses || 0 }}</div>
          <div class="kpi-label">ผู้ตอบรวมทั้งหมด</div>
        </div>
        <div class="kpi-sub">จากทุกแบบสอบถาม</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">⭐</div>
        <div class="kpi-body">
          <div class="kpi-value">
            {{ overallAvg }}
            <span v-if="overallAvg !== '—'" style="font-size:14px;color:var(--text3);font-weight:400;">/ 5.00</span>
          </div>
          <div class="kpi-label">คะแนนเฉลี่ยรวม</div>
        </div>
        <div class="kpi-sub">
          <span v-if="overallAvg !== '—'" class="interp-badge" :class="interpClass(parseFloat(overallAvg))">{{ interpText(parseFloat(overallAvg)) }}</span>
          <span v-else style="color:var(--text3);">ยังไม่มีข้อมูล</span>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">📊</div>
        <div class="kpi-body">
          <div class="kpi-value" style="font-size:18px;line-height:1.6;">
            <div class="status-row"><span class="dot dot-active"></span>Active <b>{{ surveyStore.stats.active || 0 }}</b></div>
            <div class="status-row"><span class="dot dot-draft"></span>Draft <b>{{ surveyStore.stats.draft || 0 }}</b></div>
            <div class="status-row"><span class="dot dot-closed"></span>Closed <b>{{ surveyStore.stats.closed || 0 }}</b></div>
          </div>
          <div class="kpi-label">สถานะแบบสอบถาม</div>
        </div>
      </div>
    </div>

    <!-- ── Survey selector ── -->
    <div class="dash-selector-bar" style="margin-top:20px;">
      <label style="font-size:13px;font-weight:700;color:var(--navy);white-space:nowrap;">📋 เลือกแบบสอบถาม</label>
      <select class="filter-select" style="flex:1;" v-model="selectedId">
        <option v-for="s in surveyStore.list" :key="s.id" :value="s.id">
          {{ s.title }} — {{ s.response_count || 0 }} คำตอบ
        </option>
      </select>
    </div>

    <div v-if="!selected" class="empty-state">
      <div class="es-icon">📊</div>
      <div class="es-title">ยังไม่มีแบบสอบถาม</div>
      <div class="es-sub">สร้างแบบสอบถามและรับคำตอบเพื่อดูข้อมูลที่นี่</div>
    </div>

    <template v-else>
      <!-- ── Per-survey stats ── -->
      <div class="stats-row" style="margin-top:14px;">
        <div class="stat-card">
          <div class="stat-card-accent"></div>
          <div class="stat-label">ผู้ตอบ</div>
          <div class="stat-value">{{ selected.response_count || 0 }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-accent gold"></div>
          <div class="stat-label">คะแนนเฉลี่ย (x̄)</div>
          <div style="display:flex;align-items:baseline;gap:4px;margin:6px 0 2px;">
            <div class="stat-value">{{ avgScore }}</div>
            <div v-if="avgScore !== '—'" style="font-size:13px;color:var(--text3);">/ 5.00</div>
          </div>
          <span v-if="avgScore !== '—'" class="interp-badge" :class="interpClass(parseFloat(avgScore))">{{ interpText(parseFloat(avgScore)) }}</span>
        </div>
        <div class="stat-card">
          <div class="stat-card-accent"></div>
          <div class="stat-label">สถานะ</div>
          <div class="stat-value" style="font-size:16px;margin-top:6px;">
            <span class="survey-badge" :class="badgeClass(selected.status)">{{ badgeText(selected.status) }}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-accent"></div>
          <div class="stat-label">วันที่สร้าง</div>
          <div class="stat-value" style="font-size:15px;margin-top:6px;">{{ formatDate(selected.created_at) }}</div>
        </div>
      </div>

      <!-- ── Target progress ── -->
      <div v-if="selected.target_responses" class="chart-card" style="margin-top:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3>🎯 ความคืบหน้าสู่เป้าหมาย</h3>
          <span style="font-size:12px;font-weight:700;color:var(--navy);">
            {{ selected.response_count || 0 }} / {{ selected.target_responses }} คน
          </span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :class="{ 'progress-done': progressPct >= 100 }" :style="{ width: Math.min(progressPct, 100) + '%' }"></div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:6px;">{{ progressPct }}% ของเป้าหมาย</div>
      </div>

      <!-- ── 7-day response trend ── -->
      <div class="chart-card" style="margin-top:14px;">
        <h3>📈 ผู้ตอบย้อนหลัง 7 วัน</h3>
        <div v-if="!responses.length" style="color:var(--text3);font-size:13px;margin-top:8px;">ยังไม่มีคำตอบ</div>
        <div v-else class="trend-chart">
          <div v-for="d in trend" :key="d.label" class="trend-col">
            <div class="trend-bar-wrap">
              <div class="trend-count-top">{{ d.count || '' }}</div>
              <div class="trend-bar" :style="{ height: trendMaxCount ? Math.max(d.count / trendMaxCount * 80, d.count ? 4 : 0) + 'px' : '0px' }"></div>
            </div>
            <div class="trend-label">{{ d.label }}</div>
          </div>
        </div>
      </div>

      <!-- ── Per-question charts ── -->
      <div v-if="charts.length" class="section-heading" style="margin-top:18px;">📊 ผลตอบรับรายคำถาม</div>
      <div class="charts-grid">
        <div v-for="c in charts" :key="c.question_id" class="chart-card">
          <div class="chart-q-text">{{ c.question_text }}</div>
          <div class="chart-q-meta">{{ c.total }} คำตอบ · {{ typeLabel(c.question_type) }}</div>

          <div v-if="c.chartType === 'bar' && c.data.length" class="bar-chart">
            <div v-for="item in c.data" :key="item.label" class="bar-row">
              <div class="bar-label">{{ item.label }}</div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: c.total ? (item.count / c.total * 100) + '%' : '0%' }"></div>
              </div>
              <div class="bar-count">{{ item.count }}</div>
              <div class="bar-pct">{{ c.total ? Math.round(item.count / c.total * 100) : 0 }}%</div>
            </div>
          </div>

          <div v-else-if="c.chartType === 'score' && c.data.length" class="bar-chart">
            <div v-for="item in c.data" :key="item.label" class="bar-row">
              <div class="bar-label score-label">{{ item.label }}</div>
              <div class="bar-track">
                <div class="bar-fill bar-fill-gold" :style="{ width: c.total ? (item.count / c.total * 100) + '%' : '0%' }"></div>
              </div>
              <div class="bar-count">{{ item.count }}</div>
            </div>
          </div>

          <div v-else-if="c.chartType === 'text'" class="text-answers">
            <div v-if="!c.data.length" class="text-empty">ยังไม่มีคำตอบ</div>
            <div v-else v-for="(t, i) in c.data" :key="i" class="text-bubble">{{ t }}</div>
          </div>

          <div v-else-if="c.chartType === 'grid' && c.data.rows?.length" class="grid-chart">
            <table class="grid-chart-table">
              <thead>
                <tr>
                  <th></th>
                  <th v-for="col in c.data.cols" :key="col">{{ col }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in c.data.rows" :key="row.row">
                  <td class="grid-row-label">{{ row.row }}</td>
                  <td v-for="col in c.data.cols" :key="col" class="grid-cell-count">{{ row.counts[col] || 0 }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-else class="text-empty">ยังไม่มีข้อมูลเพียงพอ</div>
        </div>
      </div>

      <!-- ── Respondents + Comments ── -->
      <div class="bottom-grid">
        <div class="chart-card">
          <h3>👥 ข้อมูลผู้ตอบล่าสุด</h3>
          <div v-if="!recentResponses.length" style="color:var(--text3);font-size:13px;margin-top:8px;">ยังไม่มีคำตอบ</div>
          <table v-else class="stat-table">
            <thead><tr><th>#</th><th>ชื่อ</th><th>คะแนน</th><th>วันที่</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in recentResponses" :key="r.id">
                <td style="color:var(--text3);font-size:11px;">{{ i + 1 }}</td>
                <td>{{ r.respondent_name }}</td>
                <td class="avg-cell">
                  <span v-if="r.overall_score">
                    <span v-for="n in 5" :key="n" style="font-size:10px;" :style="{ color: n <= Math.round(r.overall_score) ? '#f59e0b' : '#e2e8f0' }">★</span>
                    {{ parseFloat(r.overall_score).toFixed(1) }}
                  </span>
                  <span v-else style="color:var(--text3);">—</span>
                </td>
                <td style="font-size:11px;color:var(--text3);">{{ formatDate(r.submitted_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="chart-card">
          <h3>💬 ความคิดเห็นล่าสุด</h3>
          <div v-if="!comments.length" style="color:var(--text3);font-size:13px;margin-top:8px;">ยังไม่มีความคิดเห็น</div>
          <div v-else style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
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
import { formatDate, badgeClass, badgeText, interpClass, interpText } from '@/composables/useSurveyStatus';

const surveyStore = useSurveyStore();
const selectedId = ref(null);
const responses = ref([]);
const charts = ref([]);

const overallAvg = computed(() => {
  const a = parseFloat(surveyStore.stats.overall_avg);
  return isNaN(a) ? '—' : a.toFixed(2);
});

const selected = computed(() => surveyStore.list.find(s => s.id === selectedId.value) || null);

const avgScore = computed(() => {
  const a = parseFloat(selected.value?.avg_score);
  return isNaN(a) ? '—' : a.toFixed(2);
});

const recentResponses = computed(() =>
  [...responses.value]
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .slice(0, 5)
);

const comments = computed(() =>
  responses.value
    .filter(r => r.note)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .slice(0, 5)
);

const progressPct = computed(() => {
  if (!selected.value?.target_responses) return 0;
  return Math.round((selected.value.response_count || 0) / selected.value.target_responses * 100);
});

// Last 7 days trend
const trend = computed(() => {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('th-TH', { weekday: 'short' });
    const count = responses.value.filter(r => r.submitted_at?.slice(0, 10) === dateStr).length;
    days.push({ label, count, dateStr });
  }
  return days;
});
const trendMaxCount = computed(() => Math.max(...trend.value.map(d => d.count), 1));

const Q_TYPE_LABELS = {
  short: 'คำตอบสั้นๆ', para: 'ย่อหน้า', radio: 'หลายตัวเลือก',
  checkbox: 'ช่องทำเครื่องหมาย', dropdown: 'เลื่อนลง', scale: 'สเกล',
  star: 'ดาว', date: 'วันที่', time: 'เวลา',
  mcgrid: 'ตารางกริด (เลือกตอบ)', cbgrid: 'ตารางกริด (ช่องทำเครื่องหมาย)', file: 'อัปโหลดไฟล์',
};
function typeLabel(t) { return Q_TYPE_LABELS[t] || t; }

watch(selectedId, async (id) => {
  if (!id) { responses.value = []; charts.value = []; return; }
  const [r1, r2] = await Promise.all([
    api.get(`/surveys/${id}/responses`),
    api.get(`/surveys/${id}/responses/chart-data`),
  ]);
  responses.value = r1.data.map(r => {
    let answers = r.answers;
    if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = []; } }
    answers = Array.isArray(answers) ? answers.filter(a => a && a.question_id) : [];
    const paraAns = answers.find(a => a.question_type === 'para' && a.answer_text);
    return { ...r, answers, note: paraAns?.answer_text || null };
  });
  charts.value = r2.data;
});

watch(() => surveyStore.list, (list) => {
  if (list.length && !selectedId.value) selectedId.value = list[0].id;
}, { immediate: true });

onMounted(() => surveyStore.fetchAll());
</script>

<style scoped>
/* ── Global KPI grid ── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.kpi-card {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: var(--sh);
}
.kpi-icon { font-size: 22px; }
.kpi-body { flex: 1; }
.kpi-value { font-size: 28px; font-weight: 800; color: var(--navy); line-height: 1.2; }
.kpi-label { font-size: 11px; color: var(--text3); margin-top: 2px; }
.kpi-sub { font-size: 11px; color: var(--text2); border-top: 1px solid var(--line); padding-top: 6px; margin-top: 4px; }
.status-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text2); }
.status-row b { color: var(--navy); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-active { background: #22c55e; }
.dot-draft  { background: var(--gold); }
.dot-closed { background: var(--text3); }

/* ── Target progress ── */
.progress-track { height: 12px; background: var(--slate2); border-radius: 99px; overflow: hidden; }
.progress-fill  { height: 100%; background: var(--royal); border-radius: 99px; transition: width .5s ease; }
.progress-done  { background: #22c55e; }

/* ── 7-day trend ── */
.trend-chart {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 14px;
  padding: 0 4px;
}
.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.trend-bar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100px;
  width: 100%;
}
.trend-count-top {
  font-size: 10px;
  font-weight: 700;
  color: var(--royal);
  margin-bottom: 3px;
  min-height: 14px;
}
.trend-bar {
  width: 70%;
  background: var(--royal);
  border-radius: 4px 4px 0 0;
  min-width: 8px;
  transition: height .4s ease;
}
.trend-label {
  font-size: 10px;
  color: var(--text3);
  text-align: center;
  white-space: nowrap;
}

/* ── Charts ── */
.section-heading { font-size: 14px; font-weight: 700; color: var(--navy); margin-bottom: 10px; letter-spacing: .2px; }
.charts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.chart-q-text { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 3px; line-height: 1.4; }
.chart-q-meta { font-size: 10px; color: var(--text3); margin-bottom: 12px; }
.bar-chart { display: flex; flex-direction: column; gap: 8px; }
.bar-row   { display: flex; align-items: center; gap: 8px; }
.bar-label { width: 130px; font-size: 11px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; text-align: right; }
.score-label { width: 28px; text-align: center; font-weight: 700; }
.bar-track { flex: 1; height: 18px; background: var(--slate2); border-radius: 9px; overflow: hidden; }
.bar-fill  { height: 100%; background: var(--royal); border-radius: 9px; transition: width .4s ease; min-width: 2px; }
.bar-fill-gold { background: var(--gold); }
.bar-count { width: 24px; font-size: 11px; color: var(--text2); text-align: right; flex-shrink: 0; }
.bar-pct   { width: 34px; font-size: 10px; color: var(--text3); flex-shrink: 0; }
.text-answers { display: flex; flex-direction: column; gap: 6px; }
.text-bubble { background: var(--slate); border-radius: var(--r2); padding: 7px 10px; font-size: 12px; color: var(--text); border-left: 3px solid var(--royal2); }
.text-empty  { font-size: 12px; color: var(--text3); font-style: italic; }

/* ── Grid question chart (mcgrid/cbgrid) ── */
.grid-chart { overflow-x: auto; }
.grid-chart-table { border-collapse: collapse; font-size: 11px; width: 100%; }
.grid-chart-table th, .grid-chart-table td { padding: 5px 8px; border: 1px solid var(--line); text-align: center; white-space: nowrap; }
.grid-chart-table th { background: var(--slate); color: var(--text2); font-weight: 700; font-size: 10px; }
.grid-row-label { text-align: left !important; font-weight: 600; color: var(--text); background: var(--slate); }
.grid-cell-count { color: var(--navy); font-weight: 600; }

/* ── Bottom grid ── */
.bottom-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 14px; align-items: start; margin-top: 14px; }
.avg-cell { font-size: 12px; }
</style>
