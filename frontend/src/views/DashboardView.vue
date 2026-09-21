<template>
  <div class="page-panel">
    <div class="page-title-row">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-title-sub">สถิติและการวิเคราะห์ผลแบบสอบถาม</div>
      </div>
    </div>

    <!-- ── Compact global overview strip ── -->
    <div class="overview-strip">
      <span class="ov-label">ภาพรวมทั้งหมด</span>
      <div class="ov-chip"><span class="ov-val">{{ surveyStore.stats.total || 0 }}</span><span class="ov-lbl">แบบสอบถาม</span></div>
      <div class="ov-sep"></div>
      <div class="ov-chip"><span class="ov-val">{{ surveyStore.stats.total_responses || 0 }}</span><span class="ov-lbl">คำตอบรวม</span></div>
      <div class="ov-sep"></div>
      <div class="ov-chip"><span class="ov-val">{{ overallAvg }}</span><span class="ov-lbl">คะแนนเฉลี่ยรวม</span></div>
      <div class="ov-sep"></div>
      <div class="ov-chip"><span class="ov-val" style="color:#4ade80;">{{ surveyStore.stats.active || 0 }}</span><span class="ov-lbl">Active</span></div>
    </div>

    <!-- ── Survey selector + album filter chips ── -->
    <div class="picker-row">
      <select class="filter-select" style="flex:1;min-width:240px;font-size:15px;font-weight:700;padding:9px 12px;" v-model="selectedId">
        <option v-for="s in filteredSurveyOptions" :key="s.id" :value="s.id">
          {{ s.title }} — {{ s.response_count || 0 }} คำตอบ
        </option>
      </select>
      <span class="album-chip" :class="{ sel: activeAlbumId === null }" @click="activeAlbumId = null">ทั้งหมด</span>
      <span
        v-for="a in surveyStore.albums"
        :key="a.id"
        class="album-chip"
        :class="{ sel: activeAlbumId === a.id }"
        @click="activeAlbumId = a.id"
      >
        <span class="album-chip-dot" :style="{ background: a.color }"></span>{{ a.name }}
      </span>
    </div>

    <div v-if="!selected" class="empty-state">
      <div class="es-icon">📊</div>
      <div class="es-title">ยังไม่มีแบบสอบถาม</div>
      <div class="es-sub">สร้างแบบสอบถามและรับคำตอบเพื่อดูข้อมูลที่นี่</div>
    </div>

    <template v-else>
      <!-- ── Quick-stat row for the selected survey ── -->
      <div class="quickstat-row">
        <div class="qs-item">สถานะ <span class="survey-badge" :class="badgeClass(selected.status)">{{ badgeText(selected.status) }}</span></div>
        <div class="qs-item">คะแนนเฉลี่ย <b>{{ avgScore }}</b>/5.0
          <span v-if="avgScore !== '—'" class="interp-badge" :class="interpClass(parseFloat(avgScore))">{{ interpText(parseFloat(avgScore)) }}</span>
        </div>
        <div class="qs-item">ผู้ตอบ <b>{{ selected.response_count || 0 }}</b> คน</div>
        <div class="qs-item">สร้างเมื่อ <b>{{ formatDate(selected.created_at) }}</b></div>
      </div>

      <!-- ── Tabs ── -->
      <div class="resp-tab-bar">
        <button class="resp-tab" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">ภาพรวม</button>
        <button class="resp-tab" :class="{ active: activeTab === 'questions' }" @click="activeTab = 'questions'">รายคำถาม</button>
        <button class="resp-tab" :class="{ active: activeTab === 'respondents' }" @click="activeTab = 'respondents'">ผู้ตอบล่าสุด</button>
      </div>

      <!-- ══════════ TAB: ภาพรวม ══════════ -->
      <template v-if="activeTab === 'overview'">
        <div class="dash-cards">
          <div class="dash-card">
            <div class="dash-card-lbl">ผู้ตอบ</div>
            <div class="dash-card-val">{{ selected.response_count || 0 }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card-lbl">คะแนนเฉลี่ย</div>
            <div class="dash-card-val">{{ avgScore }}</div>
          </div>
          <div class="dash-card" v-if="selected.target_responses">
            <div class="dash-card-lbl">เป้าหมาย</div>
            <div class="dash-card-val">{{ progressPct }}%</div>
          </div>
          <div class="dash-card">
            <div class="dash-card-lbl">แนวโน้ม 7 วัน</div>
            <div class="dash-card-val" :class="growth.cls">{{ growth.text }}</div>
          </div>
        </div>

        <div v-if="selected.target_responses" class="chart-card" style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3>🎯 ความคืบหน้าสู่เป้าหมาย</h3>
            <span style="font-size:13px;font-weight:700;color:var(--navy);">
              {{ selected.response_count || 0 }} / {{ selected.target_responses }} คน
            </span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :class="{ 'progress-done': progressPct >= 100 }" :style="{ width: Math.min(progressPct, 100) + '%' }"></div>
          </div>
          <div style="font-size:12px;color:var(--text3);margin-top:6px;">{{ progressPct }}% ของเป้าหมาย</div>
        </div>

        <div class="chart-card" style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3>📈 แนวโน้มผู้ตอบ</h3>
            <div class="range-toggle">
              <button :class="{ sel: trendRangeDays === 7 }" @click="trendRangeDays = 7">7 วัน</button>
              <button :class="{ sel: trendRangeDays === 30 }" @click="trendRangeDays = 30">30 วัน</button>
              <button :class="{ sel: trendRangeDays === 0 }" @click="trendRangeDays = 0">ทั้งหมด</button>
            </div>
          </div>
          <div v-if="trendCapped" style="font-size:11.5px;color:var(--text3);margin-bottom:8px;">
            ⓘ แสดงเฉพาะ 60 วันล่าสุด (มีข้อมูลเก่ากว่านั้น)
          </div>
          <div v-if="!responses.length" style="color:var(--text3);font-size:14px;">ยังไม่มีคำตอบ</div>
          <div v-else class="trend-chart">
            <div
              v-for="d in trend"
              :key="d.dateStr"
              class="trend-col"
              :title="`${d.label} — ${d.count} คำตอบ`"
            >
              <div class="trend-bar-wrap">
                <div class="trend-count-top">{{ d.count || '' }}</div>
                <div class="trend-bar" :style="{ height: trendMaxCount ? Math.max(d.count / trendMaxCount * 68, d.count ? 4 : 0) + 'px' : '0px' }"></div>
              </div>
              <div class="trend-label">{{ d.label }}</div>
            </div>
          </div>
        </div>
      </template>

      <!-- ══════════ TAB: รายคำถาม ══════════ -->
      <template v-if="activeTab === 'questions'">
        <div class="chart-card" style="margin-bottom:12px;">
          <input class="search-input" style="padding:9px 12px;font-size:14px;" v-model="questionSearch" placeholder="ค้นหาคำถาม...">
        </div>
        <div v-if="filteredCharts.length === 0" class="empty-state">
          <div class="es-icon">🔍</div>
          <div class="es-title">ไม่พบคำถามที่ค้นหา</div>
        </div>
        <div v-else class="charts-grid">
          <div v-for="c in filteredCharts" :key="c.question_id" class="chart-card">
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
      </template>

      <!-- ══════════ TAB: ผู้ตอบล่าสุด ══════════ -->
      <template v-if="activeTab === 'respondents'">
        <div class="bottom-grid" style="margin-top:0;">
          <div class="chart-card">
            <h3>👥 ข้อมูลผู้ตอบล่าสุด</h3>
            <div v-if="!recentResponses.length" style="color:var(--text3);font-size:14px;margin-top:8px;">ยังไม่มีคำตอบ</div>
            <table v-else class="stat-table">
              <thead><tr><th>#</th><th>ชื่อ</th><th>คะแนน</th><th>วันที่</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in recentResponses" :key="r.id">
                  <td style="color:var(--text3);font-size:12px;">{{ i + 1 }}</td>
                  <td>{{ r.respondent_name }}</td>
                  <td class="avg-cell">
                    <span v-if="r.overall_score">
                      <span v-for="n in 5" :key="n" style="font-size:11px;" :style="{ color: n <= Math.round(r.overall_score) ? '#f59e0b' : '#e2e8f0' }">★</span>
                      {{ parseFloat(r.overall_score).toFixed(1) }}
                    </span>
                    <span v-else style="color:var(--text3);">—</span>
                  </td>
                  <td style="font-size:12px;color:var(--text3);">{{ formatDate(r.submitted_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="chart-card">
            <h3>💬 ความคิดเห็นล่าสุด</h3>
            <div v-if="!comments.length" style="color:var(--text3);font-size:14px;margin-top:8px;">ยังไม่มีความคิดเห็น</div>
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
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, inject } from 'vue';
import { useSurveyStore } from '@/stores/surveys';
import api from '@/api';
import { formatDate, badgeClass, badgeText, interpClass, interpText } from '@/composables/useSurveyStatus';
import { localDateStr } from '@/composables/useLocalDate';

const showToast = inject('showToast');
const surveyStore = useSurveyStore();
const selectedId = ref(null);
const responses = ref([]);
const charts = ref([]);
const activeTab = ref('overview');
const activeAlbumId = ref(null);
const trendRangeDays = ref(7);
const questionSearch = ref('');

const overallAvg = computed(() => {
  const a = parseFloat(surveyStore.stats.overall_avg);
  return isNaN(a) ? '—' : a.toFixed(2);
});

const filteredSurveyOptions = computed(() =>
  activeAlbumId.value === null
    ? surveyStore.list
    : surveyStore.list.filter(s => s.album_id === activeAlbumId.value)
);

// If switching the album filter drops the currently-selected survey out of
// the visible list, fall back to the first one that's still visible instead
// of leaving the dropdown pointed at something no longer shown.
watch(filteredSurveyOptions, (list) => {
  if (!list.some(s => s.id === selectedId.value)) {
    selectedId.value = list[0]?.id ?? null;
  }
});

const selected = computed(() => surveyStore.list.find(s => s.id === selectedId.value) || null);

const avgScore = computed(() => {
  const a = parseFloat(selected.value?.avg_score);
  return isNaN(a) ? '—' : a.toFixed(2);
});

const filteredCharts = computed(() => {
  const q = questionSearch.value.trim().toLowerCase();
  if (!q) return charts.value;
  // (c.question_text || '') — an orphaned/malformed question (e.g. one left
  // behind by a bad CSV import) with a null/undefined question_text would
  // otherwise throw here and take down the whole "รายคำถาม" tab instead of
  // just not matching the search.
  return charts.value.filter(c => (c.question_text || '').toLowerCase().includes(q));
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

// Response count for the last 7 days vs the 7 days before that — powers the
// "แนวโน้ม 7 วัน" summary card. Independent of the trend chart's own range
// toggle below (that one re-draws the whole chart; this is a fixed
// week-over-week comparison).
const growth = computed(() => {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const inRange = (r, fromDaysAgo, toDaysAgo) => {
    const t = new Date(r.submitted_at).getTime();
    return t >= now.getTime() - fromDaysAgo * dayMs && t < now.getTime() - toDaysAgo * dayMs;
  };
  const last7 = responses.value.filter(r => inRange(r, 7, 0)).length;
  const prev7 = responses.value.filter(r => inRange(r, 14, 7)).length;
  if (!last7 && !prev7) return { text: '—', cls: '' };
  if (!prev7) return { text: 'ใหม่', cls: 'growth-up' };
  const pct = Math.round((last7 - prev7) / prev7 * 100);
  if (pct > 0) return { text: `▲ ${pct}%`, cls: 'growth-up' };
  if (pct < 0) return { text: `▼ ${Math.abs(pct)}%`, cls: 'growth-down' };
  return { text: '— 0%', cls: '' };
});

// trendRangeDays: 7 or 30 = that many trailing days; 0 = "ทั้งหมด", from the
// earliest response on record (capped at 60 days so the chart stays
// readable instead of rendering hundreds of hairline bars).
const trendCapped = computed(() => {
  if (trendRangeDays.value !== 0 || !responses.value.length) return false;
  const earliest = responses.value.reduce((min, r) => {
    const t = new Date(r.submitted_at).getTime();
    return t < min ? t : min;
  }, Date.now());
  const spanDays = Math.ceil((Date.now() - earliest) / (24 * 60 * 60 * 1000)) + 1;
  return spanDays > 60;
});

const trend = computed(() => {
  let days = trendRangeDays.value;
  if (days === 0) {
    if (!responses.value.length) return [];
    const earliest = responses.value.reduce((min, r) => {
      const t = new Date(r.submitted_at).getTime();
      return t < min ? t : min;
    }, Date.now());
    const spanDays = Math.ceil((Date.now() - earliest) / (24 * 60 * 60 * 1000)) + 1;
    days = Math.min(Math.max(spanDays, 1), 60);
  }
  const out = [];
  const now = new Date();
  const useWeekdayLabel = days <= 7;
  const dayCounts = new Map();
  for (const r of responses.value) {
    const key = localDateStr(new Date(r.submitted_at));
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);
    const label = useWeekdayLabel
      ? d.toLocaleDateString('th-TH', { weekday: 'short' })
      : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'numeric' });
    const count = dayCounts.get(dateStr) || 0;
    out.push({ label, count, dateStr });
  }
  return out;
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
  try {
    const [r1, r2] = await Promise.all([
      api.get(`/surveys/${id}/responses`),
      api.get(`/surveys/${id}/responses/chart-data`),
    ]);
    // Guard against a stale response: if the user switched the dropdown
    // again while this request was in flight, selectedId has already moved
    // on by the time it resolves — writing this response now would show
    // data for a survey that isn't the one selected on screen anymore.
    if (selectedId.value !== id) return;
    responses.value = r1.data.map(r => {
      let answers = r.answers;
      if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = []; } }
      answers = Array.isArray(answers) ? answers.filter(a => a && a.question_id) : [];
      const paraAns = answers.find(a => a.question_type === 'para' && a.answer_text);
      return { ...r, answers, note: paraAns?.answer_text || null };
    });
    charts.value = r2.data;
  } catch (e) {
    if (selectedId.value !== id) return;
    showToast?.(e.response?.data?.message || 'โหลดข้อมูลแบบสอบถามไม่สำเร็จ');
  }
});

watch(() => surveyStore.list, (list) => {
  if (list.length && !selectedId.value) selectedId.value = list[0].id;
}, { immediate: true });

onMounted(() => surveyStore.fetchAll());
</script>

<style scoped>
/* ── Compact global overview strip ── */
.overview-strip {
  background: var(--navy);
  border-radius: var(--r);
  padding: 14px 18px;
  display: flex;
  gap: 22px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.ov-label { font-size: 12px; font-weight: 700; color: var(--gold); text-transform: uppercase; letter-spacing: .6px; }
.ov-chip { display: flex; align-items: baseline; gap: 7px; }
.ov-val { font-size: 22px; font-weight: 800; color: #fff; }
.ov-lbl { font-size: 13px; color: rgba(255,255,255,.7); }
.ov-sep { width: 1px; height: 24px; background: rgba(255,255,255,.15); }

/* ── Picker row + album chips ── */
.picker-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.album-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 13px; border-radius: 99px; font-size: 13px; font-weight: 700;
  cursor: pointer; border: 1.5px solid var(--line); background: var(--white); color: var(--text3);
  white-space: nowrap;
}
.album-chip.sel { border-color: var(--royal); background: rgba(26,86,160,.08); color: var(--royal); }
.album-chip-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* ── Quick-stat row for the selected survey ── */
.quickstat-row { display: flex; gap: 18px; flex-wrap: wrap; margin: 10px 0 16px; }
.qs-item { display: flex; align-items: center; gap: 7px; font-size: 14px; color: var(--text2); }
.qs-item b { color: var(--navy); font-size: 16px; }

/* ── Overview tab stat cards ── */
.dash-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.dash-card { background: var(--white); border: 1px solid var(--line); border-radius: var(--r); padding: 14px 16px; }
.dash-card-lbl { font-size: 11.5px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: .4px; margin-bottom: 7px; }
.dash-card-val { font-size: 24px; font-weight: 800; color: var(--navy); }
.growth-up { color: #166534; }
.growth-down { color: #b91c1c; }

/* ── Trend range toggle ── */
.range-toggle { display: flex; gap: 5px; }
.range-toggle button {
  font-family: 'Sarabun', sans-serif; font-size: 12.5px; font-weight: 700;
  padding: 5px 11px; border-radius: 5px; border: 1.5px solid var(--line);
  background: var(--white); color: var(--text3); cursor: pointer;
}
.range-toggle button.sel { background: var(--navy); border-color: var(--navy); color: #fff; }

/* ── 7/30/all-day trend ── */
/* min-width was 18px, too narrow for a 2-digit count label (~11px bold
   font needs ~16-18px on its own) — at that width the label had no room
   to breathe and visually ran into the neighboring bar/label on 30-day and
   "ทั้งหมด" views. Widening the floor so labels always fit, and letting
   overflow-x:auto (already set below) handle scrolling for many-day
   ranges instead of squeezing columns past where text still fits. */
/* Setting only overflow-x (not overflow-y) makes the browser compute
   overflow-y as "auto" too (per spec: if one axis is non-visible, a
   "visible" other axis becomes "auto") — so the tallest bar's label,
   which sits just ~3px under this box's fixed height, was getting clipped
   off instead of rendering. overflow-y: visible turns that back off, and
   the bar's own max height (JS below) is capped at 68px instead of 80px
   so the label always has clear headroom even without relying on that. */
.trend-chart { display: flex; align-items: flex-end; gap: 8px; margin-top: 14px; padding: 0 4px; height: 100px; overflow-x: auto; overflow-y: visible; }
.trend-col { flex: 1; min-width: 30px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.trend-bar-wrap { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100px; width: 100%; }
.trend-count-top { font-size: 11px; font-weight: 700; color: var(--royal); margin-bottom: 3px; min-height: 14px; white-space: nowrap; }
.trend-bar { width: 70%; background: var(--royal); border-radius: 4px 4px 0 0; min-width: 6px; transition: height .4s ease; }
.trend-label { font-size: 11px; color: var(--text3); text-align: center; white-space: nowrap; }

/* ── Charts (รายคำถาม tab) ── */
.charts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.chart-q-text { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 3px; line-height: 1.4; }
.chart-q-meta { font-size: 11px; color: var(--text3); margin-bottom: 12px; }
.bar-chart { display: flex; flex-direction: column; gap: 8px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-label { width: 130px; font-size: 12px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; text-align: right; }
.score-label { width: 28px; text-align: center; font-weight: 700; }
.bar-track { flex: 1; height: 18px; background: var(--slate2); border-radius: 9px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--royal); border-radius: 9px; transition: width .4s ease; min-width: 2px; }
.bar-fill-gold { background: var(--gold); }
.bar-count { width: 26px; font-size: 12px; color: var(--text2); text-align: right; flex-shrink: 0; }
.bar-pct { width: 36px; font-size: 11px; color: var(--text3); flex-shrink: 0; }
.text-answers { display: flex; flex-direction: column; gap: 6px; }
.text-bubble { background: var(--slate); border-radius: var(--r2); padding: 7px 10px; font-size: 13px; color: var(--text); border-left: 3px solid var(--royal2); }
.text-empty { font-size: 13px; color: var(--text3); font-style: italic; }

/* ── Grid question chart (mcgrid/cbgrid) ── */
.grid-chart { overflow-x: auto; }
.grid-chart-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.grid-chart-table th, .grid-chart-table td { padding: 5px 8px; border: 1px solid var(--line); text-align: center; white-space: nowrap; }
.grid-chart-table th { background: var(--slate); color: var(--text2); font-weight: 700; font-size: 11px; }
.grid-row-label { text-align: left !important; font-weight: 600; color: var(--text); background: var(--slate); }
.grid-cell-count { color: var(--navy); font-weight: 600; }

/* ── Bottom grid (ผู้ตอบล่าสุด tab) ── */
.bottom-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 14px; align-items: start; }
.avg-cell { font-size: 13px; }
</style>
