<template>
  <div class="page-panel">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <button @click="$router.back()" style="background:none;border:1px solid var(--line);border-radius:var(--r2);padding:6px 10px;cursor:pointer;font-size:12px;color:var(--text2);font-family:'Sarabun',sans-serif;">← กลับ</button>
      <div style="flex:1;">
        <div style="font-size:17px;font-weight:800;color:var(--navy);">{{ survey?.title }}</div>
        <div style="font-size:11px;color:var(--text3);">ผลการตอบกลับ</div>
      </div>
      <span v-if="isShared" style="font-size:11px;background:rgba(26,86,160,.08);color:var(--royal);border:1px solid rgba(26,86,160,.2);border-radius:20px;padding:3px 10px;font-weight:600;">👁️ View Only</span>
      <span v-if="survey?.google_form_id && !isShared" style="font-size:11px;color:var(--text3);white-space:nowrap;">
        <template v-if="survey.auto_sync_enabled">🟢 ซิงค์อัตโนมัติ</template>
        <template v-else>⚪ ยังไม่เปิดซิงค์อัตโนมัติ</template>
        <template v-if="survey.last_synced_at"> · ล่าสุด {{ formatDate(survey.last_synced_at) }}</template>
      </span>
      <button
        v-if="survey?.google_form_id && !isShared"
        class="btn-sm btn-outline"
        @click="syncing ? cancelSync() : syncNow()"
      >{{ syncing ? '✕ ยกเลิก (กำลังซิงค์...)' : '🔄 ซิงค์ตอนนี้' }}</button>
      <span v-if="survey" class="survey-badge" :class="badgeClass(survey.status)">{{ badgeText(survey.status) }}</span>
    </div>

    <!-- Tabs -->
    <div class="resp-tab-bar">
      <button class="resp-tab" :class="{ active: activeTab === 'list' }" @click="activeTab = 'list'">📋 รายการคำตอบ</button>
      <button class="resp-tab" :class="{ active: activeTab === 'dash' }" @click="activeTab = 'dash'">📊 Dashboard</button>
    </div>

    <!-- ══════════════ LIST TAB ══════════════ -->
    <div v-if="activeTab === 'list'">
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
        <div class="kpi-card" style="--kpi-accent:var(--royal);--kpi-accent-bg:rgba(26,86,160,.1);">
          <div class="kpi-icon-box">👥</div>
          <div><div class="kpi-num">{{ responses.length }}</div><div class="kpi-lbl">ผู้ตอบทั้งหมด</div></div>
        </div>
        <div class="kpi-card" :style="{ '--kpi-accent': avgScoreAllHex, '--kpi-accent-bg': avgScoreAllHex + '1a' }">
          <div class="kpi-icon-box">⭐</div>
          <div>
            <div class="kpi-num" :style="{ color: avgScoreAllHex }">{{ avgScoreAll }}<span v-if="avgScoreAll !== '—'" class="kpi-num-sub"> /5.0</span></div>
            <div class="kpi-lbl">ค่าเฉลี่ย (x̄)</div>
          </div>
        </div>
        <div class="kpi-card" style="--kpi-accent:var(--gold);--kpi-accent-bg:rgba(201,168,76,.14);">
          <div class="kpi-icon-box">🎯</div>
          <div><div class="kpi-num">{{ survey?.target_responses || '—' }}</div><div class="kpi-lbl">เป้าหมาย</div></div>
        </div>
        <div class="kpi-card" style="--kpi-accent:#8b5cf6;--kpi-accent-bg:rgba(139,92,246,.12);">
          <div class="kpi-icon-box">🕒</div>
          <div><div class="kpi-num" style="font-size:16px;">{{ lastDate }}</div><div class="kpi-lbl">ตอบล่าสุด</div></div>
        </div>
      </div>

      <div class="filter-bar">
        <div class="search-wrap" style="min-width:220px;flex:0 0 260px;">
          <span class="search-icon">🔍</span>
          <input v-model="listSearch" class="search-input" placeholder="ค้นหาชื่อผู้ตอบ..." />
        </div>
        <select v-model="listScoreFilter" class="filter-select pill-select">
          <option value="">คะแนน: ทั้งหมด</option>
          <option value="high">4-5 ดาว</option>
          <option value="low">1-3 ดาว</option>
        </select>
        <span class="filter-result-count" v-if="listSearch || listScoreFilter">พบ {{ listFilteredResponses.length }} จาก {{ responses.length }} รายการ</span>
      </div>

      <div class="chart-card" style="padding:0;overflow:hidden;">
        <table class="response-table">
          <thead>
            <tr><th>#</th><th>ผู้ตอบ</th><th>คะแนน</th><th>ข้อเสนอแนะ</th><th>วันที่</th></tr>
          </thead>
          <tbody>
            <tr v-if="listFilteredResponses.length === 0">
              <td colspan="5" style="text-align:center;padding:32px;color:var(--text3);">{{ responses.length === 0 ? 'ยังไม่มีคำตอบ' : 'ไม่พบรายการที่ตรงกับตัวกรอง' }}</td>
            </tr>
            <tr v-for="(r, i) in listFilteredResponses" :key="r.id">
              <td>{{ i + 1 }}</td>
              <td>
                <div class="name-cell">
                  <span class="avatar-badge" :style="{ background: avatarColor(i) + '1a', color: avatarColor(i) }">{{ initials(r.respondent_name) }}</span>
                  <b>{{ r.respondent_name }}</b>
                </div>
              </td>
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
        <div class="date-range-box">
          <span>📅</span>
          <input type="date" v-model="filterFrom" />
          <span class="date-arrow">→</span>
          <input type="date" v-model="filterTo" />
        </div>
        <select v-model.number="filterQuestionId" class="filter-select pill-select" v-if="categoricalCharts.length > 1" style="min-width:160px;max-width:280px;">
          <optgroup label="ข้อมูลทั่วไป" v-if="generalQuestions.length">
            <option v-for="c in generalQuestions" :key="c.question_id" :value="c.question_id" :title="c.question_text">{{ c.question_text }}</option>
          </optgroup>
          <optgroup label="คำถามในแบบสอบถาม" v-if="opinionQuestions.length">
            <option v-for="c in opinionQuestions" :key="c.question_id" :value="c.question_id" :title="c.question_text">{{ truncateQuestionText(c.question_text) }}</option>
          </optgroup>
        </select>
        <select v-model="filterGender" class="filter-select pill-select" v-if="genderOptions.length" style="min-width:120px;">
          <option value="">{{ selectedCategoricalQuestionText }}: ทั้งหมด</option>
          <option v-for="opt in genderOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <button v-if="filterFrom || filterTo || filterGender" class="filter-reset-btn" @click="resetDashFilters">↺ ล้างตัวกรอง</button>
        <div style="flex:1;"></div>
        <button v-if="!isShared" @click="openImportCsv" class="export-btn">📤 นำเข้าคำตอบ CSV</button>
        <button @click="exportCSV" class="export-btn">📥 Export CSV</button>
      </div>

      <!-- ── KPI Row ── -->
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);">
        <div class="kpi-card" style="--kpi-accent:var(--royal);--kpi-accent-bg:rgba(26,86,160,.1);">
          <div class="kpi-icon-box">👥</div>
          <div><div class="kpi-num">{{ filteredResponses.length }}</div><div class="kpi-lbl">ผู้ตอบทั้งหมด</div></div>
        </div>
        <div class="kpi-card" :style="{ '--kpi-accent': avgScoreHex, '--kpi-accent-bg': avgScoreHex + '1a' }">
          <div class="kpi-icon-box">⭐</div>
          <div>
            <div class="kpi-num" :style="{ color: avgScoreHex }">{{ avgScore }}<span v-if="avgScore !== '—'" class="kpi-num-sub"> /5.00</span></div>
            <div class="kpi-lbl">
              ค่าเฉลี่ยความพึงพอใจ
              <span v-if="avgScore !== '—'" class="interp-badge" :class="interpClass(parseFloat(avgScore))">{{ interpText(parseFloat(avgScore)) }}</span>
            </div>
          </div>
        </div>
        <div class="kpi-card" style="--kpi-accent:var(--gold);--kpi-accent-bg:rgba(201,168,76,.14);">
          <div class="kpi-icon-box">💬</div>
          <div><div class="kpi-num">{{ comments.length }}</div><div class="kpi-lbl">มีข้อเสนอแนะ</div></div>
        </div>
      </div>

      <!-- ── Descriptive Statistics ── -->
      <div v-if="scoreValues.length" class="chart-card desc-card">
        <h3 style="margin-bottom:14px;">📐 สถิติเชิงพรรณนา (คะแนนความพึงพอใจ)</h3>
        <div class="desc-stats-row">
          <div class="desc-stat">
            <div class="desc-stat-symbol">x̄</div>
            <div class="desc-stat-val">{{ meanScore }}</div>
            <div class="desc-stat-label">Mean<br><span>ค่าเฉลี่ย</span></div>
          </div>
          <div class="desc-stat-divider"></div>
          <div class="desc-stat">
            <div class="desc-stat-symbol">Md</div>
            <div class="desc-stat-val">{{ medianScore }}</div>
            <div class="desc-stat-label">Median<br><span>ค่ากลาง</span></div>
          </div>
          <div class="desc-stat-divider"></div>
          <div class="desc-stat">
            <div class="desc-stat-symbol">Mo</div>
            <div class="desc-stat-val">{{ modeScore }}</div>
            <div class="desc-stat-label">Mode<br><span>ฐานนิยม</span></div>
          </div>
          <div class="desc-stat-divider"></div>
          <div class="desc-stat">
            <div class="desc-stat-symbol">S.D.</div>
            <div class="desc-stat-val">{{ sdScore }}</div>
            <div class="desc-stat-label">Std. Dev.<br><span>ค่าเบี่ยงเบนมาตรฐาน</span></div>
          </div>
        </div>
      </div>

      <!-- ── Charts Row: Pie Chart (gender) + Avg Score Bar ── -->
      <div class="charts-2col">

        <!-- Categorical chart card: donut / bar / table, user-selectable via one menu button -->
        <div v-for="c in categoricalCharts" :key="c.question_id" class="chart-card">
          <div class="chart-card-header">
            <div>
              <div class="chart-q-text">{{ c.question_text }}</div>
              <div class="chart-q-meta">{{ c.total }} คำตอบ · การแจกแจง</div>
            </div>
            <div class="chart-type-picker">
              <button
                type="button"
                class="chart-type-btn"
                :class="{ 'menu-open': openChartMenuId === c.question_id }"
                @click.stop="toggleChartMenu(c.question_id)"
              ><span>{{ chartTypeIcon(c.question_id) }}</span><span class="caret">▾</span></button>
              <div
                class="chart-type-menu"
                :class="{ open: openChartMenuId === c.question_id }"
                @click.stop
              >
                <button
                  v-for="opt in CHART_TYPE_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="chart-type-opt"
                  :class="{ active: chartTypeFor(c.question_id) === opt.value }"
                  @click="setChartType(c.question_id, opt.value)"
                ><span class="opt-icon">{{ opt.icon }}</span>{{ opt.label }}<span class="opt-check">✓</span></button>
              </div>
            </div>
          </div>
          <div v-if="!c.total" class="text-empty">ยังไม่มีคำตอบ</div>
          <template v-else>
            <div v-if="chartTypeFor(c.question_id) === 'donut'" class="donut-area">
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
                <text x="18" y="15.5" text-anchor="middle" class="svg-num">{{ c.total }}</text>
                <text x="18" y="23" text-anchor="middle" class="svg-sub">คน</text>
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
            <div v-else-if="chartTypeFor(c.question_id) === 'bar'" class="cat-bar-list">
              <div v-for="(item, i) in c.data" :key="item.label" class="cat-bar-row">
                <span class="cat-bar-label" :title="item.label">{{ item.label }}</span>
                <div class="cat-bar-track">
                  <div class="cat-bar-fill" :style="{ width: (item.count / c.total * 100) + '%', background: item.count > 0 ? donutColors[i % donutColors.length] : '#dde3ee' }"></div>
                </div>
                <span class="cat-bar-count">
                  {{ item.count }}
                  <span v-if="item.count > 0" class="legend-pct">({{ Math.round(item.count / c.total * 100) }}%)</span>
                </span>
              </div>
            </div>
            <table v-else class="cat-table">
              <tr v-for="item in c.data" :key="item.label">
                <td class="t-label">{{ item.label }}</td>
                <td class="t-count">{{ item.count }}</td>
                <td class="t-pct">{{ item.count > 0 ? Math.round(item.count / c.total * 100) + '%' : '—' }}</td>
              </tr>
            </table>
          </template>
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
          <h3>👥 ข้อมูลผู้ตอบล่าสุด</h3>
          <div v-if="!filteredResponses.length" style="color:var(--text3);font-size:13px;margin-top:8px;">ยังไม่มีคำตอบ</div>
          <table v-else class="stat-table">
            <thead><tr><th>#</th><th>ชื่อ</th><th>คะแนน</th><th>วันที่</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in filteredResponses.slice(0, 5)" :key="r.id">
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
          <h3>💬 ความคิดเห็นล่าสุด</h3>
          <div v-if="!comments.length" style="color:var(--text3);font-size:13px;margin-top:8px;">ยังไม่มีความคิดเห็น</div>
          <div v-else style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
            <div v-for="c in comments.slice(0, 5)" :key="c.id" class="comment-bubble">
              <div class="cb-name">{{ c.respondent_name }}</div>
              <div class="cb-text">{{ c.note }}</div>
              <div class="cb-date">{{ formatDate(c.submitted_at) }}</div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- IMPORT RESPONSES CSV MODAL -->
    <ImportResponsesCsvModal
      v-if="survey"
      ref="importCsvRef"
      :survey-id="survey.id"
      @imported="onResponsesImported"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue';
import { useRoute } from 'vue-router';
import { useSurveyStore } from '@/stores/surveys';
import { useAuthStore }   from '@/stores/auth';
import api from '@/api';
import { badgeClass, badgeText, interpClass, interpText } from '@/composables/useSurveyStatus';
import { openGoogleAuthPopup } from '@/composables/useGoogleOAuthPopup';
import { localDateStr } from '@/composables/useLocalDate';
import ImportResponsesCsvModal from '@/components/Survey/ImportResponsesCsvModal.vue';

const route = useRoute();
const surveyStore = useSurveyStore();
const authStore = useAuthStore();
const showToast = inject('showToast');
const isAdminUser = computed(() => ['admin', 'head_admin'].includes(authStore.user?.role));
const responses = ref([]);
const charts = ref([]);
const activeTab = ref('list');
const syncing = ref(false);
const importCsvRef = ref(null);

const filterFrom = ref('');
const filterTo = ref('');
const filterGender = ref('');

function resetDashFilters() {
  filterFrom.value = '';
  filterTo.value = '';
  filterGender.value = '';
}

// List-tab-only search/score filter — separate from the Dashboard tab's
// date/gender filters above so switching tabs never resets either one.
const listSearch = ref('');
const listScoreFilter = ref('');
const listFilteredResponses = computed(() =>
  responses.value.filter(r => {
    if (listSearch.value.trim() && !(r.respondent_name || '').toLowerCase().includes(listSearch.value.trim().toLowerCase())) return false;
    if (listScoreFilter.value) {
      const s = Math.round(parseFloat(r.overall_score) || 0);
      if (listScoreFilter.value === 'high' && s < 4) return false;
      if (listScoreFilter.value === 'low' && (s < 1 || s > 3)) return false;
    }
    return true;
  })
);

const avatarPalette = ['#1A56A0', '#C9A84C', '#22c55e', '#f97316', '#8b5cf6', '#ef4444'];
function avatarColor(i) { return avatarPalette[i % avatarPalette.length]; }
function initials(name) {
  const s = (name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : s.slice(0, 2).toUpperCase();
}

const donutColors = ['#1a56a0', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#f97316'];

// User-selectable chart display per categorical question (donut / bar /
// table), picked from a single dropdown-menu button so the card header
// doesn't turn into a row of buttons. Remembered per-survey in
// localStorage so the choice survives tab switches and page reloads.
const CHART_TYPE_OPTIONS = [
  { value: 'donut', label: 'วงกลม', icon: '\u{1F369}' },
  { value: 'bar', label: 'แท่ง', icon: '\u{1F4CA}' },
  { value: 'table', label: 'ตาราง', icon: '\u{1F4CB}' },
];
const chartTypeMap = ref({});
const openChartMenuId = ref(null);

function chartTypeStorageKey(surveyId) { return `dashChartType_${surveyId}`; }
function loadChartTypeMap(surveyId) {
  try {
    const raw = localStorage.getItem(chartTypeStorageKey(surveyId));
    chartTypeMap.value = raw ? JSON.parse(raw) : {};
  } catch {
    chartTypeMap.value = {};
  }
}
function chartTypeFor(questionId) { return chartTypeMap.value[questionId] || 'donut'; }
function chartTypeIcon(questionId) {
  return CHART_TYPE_OPTIONS.find(o => o.value === chartTypeFor(questionId))?.icon || CHART_TYPE_OPTIONS[0].icon;
}
function toggleChartMenu(questionId) {
  openChartMenuId.value = openChartMenuId.value === questionId ? null : questionId;
}
function setChartType(questionId, type) {
  chartTypeMap.value = { ...chartTypeMap.value, [questionId]: type };
  openChartMenuId.value = null;
  try {
    localStorage.setItem(chartTypeStorageKey(route.params.id), JSON.stringify(chartTypeMap.value));
  } catch { /* private-mode/quota errors: the choice just won't persist */ }
}
// Close whichever chart-type menu is open on any outside click.
function closeChartMenuOnOutsideClick() { openChartMenuId.value = null; }
onMounted(() => window.addEventListener('click', closeChartMenuOnOutsideClick));
onBeforeUnmount(() => window.removeEventListener('click', closeChartMenuOnOutsideClick));

const survey = computed(() =>
  surveyStore.list.find(s => s.id === Number(route.params.id)) ||
  surveyStore.shared.find(s => s.id === Number(route.params.id)) ||
  surveyStore.others.find(s => s.id === Number(route.params.id)) || null
);
const isShared = computed(() =>
  !isAdminUser.value && !surveyStore.list.find(s => s.id === Number(route.params.id))
);

const isScoreLabel = label => /\(\d+(?:\.\d+)?\)\s*$/.test(label);

// Detects an open-feedback question ("ข้อเสนอแนะเพิ่มเติม", "ความคิดเห็น...",
// etc.) by its QUESTION TEXT rather than its stored question_type. Why:
// this app's own CSV-based survey reconstruction (composables/useCsv.js's
// guessQuestionType) can misdetect a free-text column as a 'radio'/
// 'dropdown' categorical question whenever the sample data only has a
// handful of distinct answers — which is exactly what a short/blank-heavy
// "any comments?" column tends to look like. When that happens, the
// question's real answers (people's actual written feedback) end up
// rendered as a nonsensical bar/donut "distribution" chart instead of
// showing up as comments, AND they don't get picked up by the ความคิดเห็น
// ล่าสุด widget (loadResponses' note derivation, below) since that used to
// require question_type === 'para'. Matching on the question's own text
// instead — the same convention already used for name-question detection
// (backend nameFromQuestionIdx: q.question_text.includes('ชื่อ')) — means
// a mistyped question, or a differently-typed one on a future survey, still
// gets treated as feedback instead of silently falling through the cracks.
const FEEDBACK_KEYWORDS = ['ข้อเสนอแนะ', 'เสนอแนะ', 'ความคิดเห็น', 'ความเห็น', 'comment', 'feedback'];
function isFeedbackQuestionText(text) {
  const t = (text || '').toLowerCase();
  return FEEDBACK_KEYWORDS.some(k => t.includes(k.toLowerCase()));
}
// A chart-data entry counts as an open-feedback question only when its text
// matches the keywords above AND the backend hasn't flagged it as a genuine
// Likert rating question (isLikertScale — see responseController.js). Thai
// satisfaction questions are very often worded "ระดับความคิดเห็นต่อ..." /
// "ความคิดเห็นเกี่ยวกับ..." while still being a 5-point มาก/มากที่สุด rating,
// not free text — without the isLikertScale guard those questions' rating
// answers ("มาก") were being pulled into the ความคิดเห็นล่าสุด comments feed
// instead of the real open-text answers, and their own bar chart was hidden.
function isFeedbackChart(chart) {
  return isFeedbackQuestionText(chart.question_text) && !chart.isLikertScale;
}

// Only categorical radio charts (no score pattern in labels) → donut.
// Feedback-style questions are excluded even if their stored question_type
// looks categorical (see isFeedbackQuestionText above) — their answers
// belong in the ความคิดเห็นล่าสุด comments panel, not a bar/donut card.
const categoricalCharts = computed(() =>
  charts.value.filter(c =>
    c.chartType === 'bar' &&
    !c.data.some(d => isScoreLabel(d.label)) &&
    !isFeedbackChart(c)
  )
);

// The question-picker dropdown mixes short demographic questions (เพศ,
// อายุ, การศึกษา, อาชีพ) with long numbered opinion/Likert questions,
// which made the list hard to scan. Split them by whether the question
// text starts with a leading "1." / "2)" style number — that's how every
// opinion question in practice is authored, while demographic questions
// aren't numbered — so the dropdown can group them under separate
// <optgroup> headings instead of one long flat list.
const isNumberedQuestion = text => /^\s*\d+[.).]/.test(text || '');
const generalQuestions = computed(() => categoricalCharts.value.filter(c => !isNumberedQuestion(c.question_text)));
const opinionQuestions = computed(() => categoricalCharts.value.filter(c => isNumberedQuestion(c.question_text)));

// Long opinion-question text is shortened in the dropdown option itself
// (native <option> can't be truncated with CSS); the full text stays
// available as a hover tooltip via the option's title attribute.
function truncateQuestionText(text, max = 60) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

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

// Which categorical question the "เพศ" (or whatever it actually is) filter
// applies to. Bound to a real question_id instead of guessed — previously
// the dropdown options came from categoricalCharts[0] while the actual
// filtering in filteredResponses() independently guessed "the first radio
// answer on this response whose label isn't a score", which is a different
// question whenever a survey has more than one non-score radio/checkbox
// question (e.g. "เพศ" AND "แผนก/หน่วยงาน") — the two could silently
// mismatch and filter on the wrong question. Defaults to the first
// categorical chart (same default the UI always had), but if a survey has
// more than one, the template below lets the user pick explicitly.
const filterQuestionId = ref(null);
watch(categoricalCharts, (list) => {
  if (!list.some(c => c.question_id === filterQuestionId.value)) {
    filterQuestionId.value = list[0]?.question_id ?? null;
    filterGender.value = '';
  }
}, { immediate: true });

const selectedCategoricalChart = computed(() =>
  categoricalCharts.value.find(c => c.question_id === filterQuestionId.value) || null
);
const selectedCategoricalQuestionText = computed(() => selectedCategoricalChart.value?.question_text || 'เพศ');

const genderOptions = computed(() => {
  const cat = selectedCategoricalChart.value;
  if (!cat) return [];
  return cat.data.filter(d => d.count > 0).map(d => d.label);
});

const filteredResponses = computed(() =>
  responses.value.filter(r => {
    // localDateStr (not .slice(0, 10)) — submitted_at is a UTC ISO
    // timestamp; slicing took its UTC calendar date, which can be one day
    // off from the viewer's local date (e.g. a response submitted late at
    // night in Thailand, UTC+7) compared against the local date the
    // <input type="date"> filter actually represents. Same bug already
    // fixed once in DashboardView.vue's trend chart — see useLocalDate.js.
    const day = r.submitted_at ? localDateStr(r.submitted_at) : '';
    if (filterFrom.value && day < filterFrom.value) return false;
    if (filterTo.value   && day > filterTo.value) return false;
    if (filterGender.value && filterQuestionId.value != null) {
      const answers = Array.isArray(r.answers) ? r.answers : [];
      const ans = answers.find(a => a.question_id === filterQuestionId.value);
      if (!ans || ans.answer_text !== filterGender.value) return false;
    }
    return true;
  })
);

const scoreValues = computed(() =>
  filteredResponses.value.map(r => parseFloat(r.overall_score)).filter(s => !isNaN(s))
);

const avgScore = computed(() => {
  const v = scoreValues.value;
  if (!v.length) return '—';
  return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
});

const meanScore = computed(() => {
  const v = scoreValues.value;
  if (!v.length) return '—';
  return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2);
});

const medianScore = computed(() => {
  const v = [...scoreValues.value].sort((a, b) => a - b);
  if (!v.length) return '—';
  const mid = Math.floor(v.length / 2);
  return (v.length % 2 !== 0 ? v[mid] : (v[mid - 1] + v[mid]) / 2).toFixed(2);
});

const modeScore = computed(() => {
  const v = scoreValues.value;
  if (!v.length) return '—';
  const freq = {};
  v.forEach(s => { freq[s] = (freq[s] || 0) + 1; });
  const maxF = Math.max(...Object.values(freq));
  const modes = Object.keys(freq).filter(k => freq[k] === maxF).map(Number).sort((a, b) => a - b);
  return modes.map(m => m.toFixed(1)).join(', ');
});

const sdScore = computed(() => {
  const v = scoreValues.value;
  if (v.length < 2) return '—';
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (v.length - 1);
  return Math.sqrt(variance).toFixed(2);
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

// Hex equivalents of the score-* classes above, for inline-styled KPI card
// accents (CSS custom properties can't reference a scoped class's color).
function scoreHexColor(s) {
  if (isNaN(s)) return '#6B7FA3';
  if (s >= 4.5) return '#22c55e';
  if (s >= 3.5) return '#3b82f6';
  if (s >= 2.5) return '#f59e0b';
  if (s >= 1.5) return '#f97316';
  return '#ef4444';
}
const avgScoreHex = computed(() => scoreHexColor(parseFloat(avgScore.value)));

// Dashboard-filter-independent average — the List tab's KPI cards show the
// survey's overall stats regardless of whatever date/gender filter is set
// on the Dashboard tab, since the two tabs' filters are intentionally
// separate (see listFilteredResponses above).
const avgScoreAll = computed(() => {
  const v = responses.value.map(r => parseFloat(r.overall_score)).filter(s => !isNaN(s));
  if (!v.length) return '—';
  return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
});
const avgScoreAllHex = computed(() => scoreHexColor(parseFloat(avgScoreAll.value)));

const comments = computed(() => filteredResponses.value.filter(r => r.note));
const lastDate = computed(() => responses.value.length ? formatDate(responses.value[0].submitted_at) : '—');

// SVG donut segments (circumference = 100 at r=15.9)
function donutSegments(data, total) {
  if (!total) return [];
  let cumulative = 0;
  return data.map((d, i) => {
    const pct = (d.count / total) * 100;
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
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${survey.value?.title || 'responses'}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
// seq guard — this component isn't currently reused across two different
// /surveys/:id/responses navigations (every "ดูผล" link that routes here
// does so from a different route, forcing a fresh mount), but if that ever
// changes, two loadResponses() calls could end up in flight at once; without
// this, whichever resolved last would win even if it was for the older id.
let loadSeq = 0;
async function loadResponses() {
  const seq = ++loadSeq;
  const targetId = route.params.id;
  const [r1, r2] = await Promise.all([
    api.get(`/surveys/${targetId}/responses`),
    api.get(`/surveys/${targetId}/responses/chart-data`),
  ]);
  if (seq !== loadSeq) return; // a newer load started while this was in flight
  charts.value = r2.data;
  loadChartTypeMap(targetId);
  // Question ids this survey's chart-data identifies as open feedback by
  // TEXT (see isFeedbackQuestionText above) — used below as a fallback so a
  // feedback question stored with the "wrong" question_type still surfaces
  // as a comment instead of being missed entirely.
  const feedbackQuestionIds = new Set(
    r2.data.filter(isFeedbackChart).map(c => c.question_id)
  );
  responses.value = r1.data.map(r => {
    let answers = r.answers;
    if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = []; } }
    answers = Array.isArray(answers) ? answers.filter(a => a && a.question_id) : [];
    // Prefer a real 'para' (long free-text) answer, same as before; fall
    // back to any answer belonging to a feedback-keyword question
    // (feedbackQuestionIds) regardless of its stored type, so a mistyped
    // "ข้อเสนอแนะ.../ความคิดเห็น..." question still shows up here.
    const commentAns =
      answers.find(a => a.question_type === 'para' && a.answer_text) ||
      answers.find(a => feedbackQuestionIds.has(a.question_id) && a.answer_text);
    return { ...r, answers, note: commentAns?.answer_text || null };
  });
}

// Re-fetch if this component instance is ever reused for a different
// survey's responses (e.g. a future "next/prev survey" link) instead of
// silently continuing to show the previous survey's data.
watch(() => route.params.id, (id, oldId) => {
  if (!id || id === oldId) return;
  loadResponses();
});

// Tracks the in-flight popup/poller so cancelSync() can stop it — see
// useGoogleOAuthPopup.js for why we poll our backend instead of using
// window.opener/postMessage or reading popup.closed (both broken by
// Google's own Cross-Origin-Opener-Policy header).
let activeAuthPopup = null;

async function syncNow() {
  if (syncing.value || !survey.value?.id) return;
  // Captured now, at click time — `survey` is reactive and re-reading
  // `survey.value.id` after the OAuth popup resolves would pick up whatever
  // survey the page has navigated to by then, not the one the user actually
  // clicked "sync" on.
  const surveyId = survey.value.id;
  syncing.value = true;
  try {
    const { data } = await api.get('/google/sync-auth-url');

    activeAuthPopup = openGoogleAuthPopup(data.url, data.state);
    try {
      await activeAuthPopup.promise;
    } catch (e) {
      activeAuthPopup = null;
      syncing.value = false;
      showToast?.(
        e.message === 'POPUP_BLOCKED' ? 'เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปสำหรับเว็บไซต์นี้แล้วลองใหม่' :
        e.message === 'TIMEOUT' ? 'หมดเวลารอการอนุญาต Google กรุณาลองใหม่' :
        'การซิงค์ถูกยกเลิก'
      );
      return;
    }
    activeAuthPopup = null;

    const { data: result } = await api.post('/google/sync-responses', { state: data.state, surveyId });
    await Promise.all([loadResponses(), surveyStore.fetchAll()]);
    showToast?.(`ซิงค์สำเร็จ — เพิ่ม ${result.synced} รายการ (ข้าม ${result.skipped} รายการที่มีอยู่แล้ว)`);
  } catch (e) {
    showToast?.(e.response?.data?.message || 'ไม่สามารถเชื่อมต่อ Google ได้');
  } finally {
    syncing.value = false;
  }
}

function cancelSync() {
  activeAuthPopup?.cancel();
  activeAuthPopup = null;
  syncing.value = false;
}

function openImportCsv() {
  importCsvRef.value?.open();
}

async function onResponsesImported() {
  await Promise.all([loadResponses(), surveyStore.fetchAll()]);
}

onMounted(async () => {
  await surveyStore.fetchAll();
  await loadResponses();
});

// Without this, navigating away from this page mid-authorization (unlike
// SurveyBuilder.vue/ImportSurveyModal.vue, this flow has no explicit close
// button to catch it on) left the popup/poller running — a resolve after
// the user already left would still POST /google/sync-responses and call
// loadResponses()/surveyStore.fetchAll()/showToast against a page that's no
// longer showing, for a survey the user may not even still be looking at.
onBeforeUnmount(() => {
  activeAuthPopup?.cancel();
  activeAuthPopup = null;
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
  box-shadow: var(--sh1);
}
.export-btn { background: var(--navy); color: #fff; border: none; border-radius: var(--r2); padding: 7px 14px; font-size: 12px; font-family: 'Sarabun', sans-serif; font-weight: 700; cursor: pointer; transition: opacity .15s; }
.export-btn:hover { opacity: .85; }

/* ── Date range group + reset (filter bar) ── */
.date-range-box { display: flex; align-items: center; gap: 6px; background: var(--slate); border-radius: 6px; padding: 6px 10px; font-size: 11px; color: var(--text3); }
.date-range-box input[type=date] { border: none; background: none; font-family: 'Sarabun', sans-serif; font-size: 12px; color: var(--text); outline: none; }
.date-arrow { font-size: 11px; color: var(--text3); }
.pill-select { border-radius: 99px !important; }
.filter-reset-btn { background: none; border: 1px solid var(--line); color: var(--text3); border-radius: 99px; padding: 6px 12px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: 'Sarabun', sans-serif; transition: all .15s; }
.filter-reset-btn:hover { border-color: var(--royal); color: var(--royal); }

/* ── KPI Card (shared: List tab + Dashboard tab) ── */
.kpi-grid { display: grid; gap: 12px; margin-bottom: 16px; }
.kpi-card {
  display: flex; align-items: center; gap: 10px;
  background: var(--white); border: 1px solid var(--line); border-radius: var(--r);
  padding: 14px 16px; box-shadow: var(--sh1); position: relative; overflow: hidden;
}
.kpi-card::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: var(--kpi-accent, var(--royal)); }
.kpi-icon-box {
  width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 16px;
  background: var(--kpi-accent-bg, rgba(26,86,160,.1));
}
.kpi-num { font-size: 26px; font-weight: 800; color: var(--navy); line-height: 1.1; }
.kpi-num-sub { font-size: 12px; font-weight: 400; color: var(--text3); }
.kpi-lbl { font-size: 11px; color: var(--text3); margin-top: 2px; display: flex; align-items: center; gap: 6px; }

/* ── Avatar / name cell (List tab table) ── */
.name-cell { display: flex; align-items: center; gap: 8px; }
.avatar-badge { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; flex-shrink: 0; }

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
.svg-num    { font-size: 7px; font-weight: 700; fill: var(--navy); transform: rotate(90deg); transform-origin: 18px 15.5px; }
.svg-sub    { font-size: 3.6px; letter-spacing: .02em; fill: var(--text3); transform: rotate(90deg); transform-origin: 18px 23px; }
.donut-legend  { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 100px; }
.legend-item   { display: flex; align-items: center; gap: 7px; font-size: 12px; }
.legend-dot    { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.legend-label  { flex: 1; color: var(--text); }
.legend-count  { color: var(--text3); font-size: 11px; white-space: nowrap; }
.legend-pct    { font-size: 10px; opacity: .75; }
.legend-item-zero .legend-label { color: var(--text3); }
.legend-item-zero .legend-count { opacity: .5; }

/* ── Chart card header + chart-type dropdown menu ── */
.chart-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.chart-type-picker { position: relative; flex-shrink: 0; }
.chart-type-btn {
  display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--line); background: var(--white); border-radius: 99px;
  height: 26px; padding: 0 9px 0 8px; font-size: 13px; line-height: 1;
  cursor: pointer; transition: all .15s; color: var(--text2); font-family: inherit;
}
.chart-type-btn:hover { border-color: var(--royal); color: var(--royal); }
.chart-type-btn .caret { font-size: 8px; opacity: .6; margin-left: 1px; }
.chart-type-btn.menu-open { border-color: var(--royal); background: rgba(26,86,160,.08); color: var(--royal); }
.chart-type-menu {
  position: absolute; top: 32px; right: 0; z-index: 10;
  background: var(--white); border: 1px solid var(--line); border-radius: var(--r2);
  box-shadow: var(--sh2); padding: 4px; min-width: 132px;
  display: none; flex-direction: column; gap: 1px;
}
.chart-type-menu.open { display: flex; }
.chart-type-opt {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px;
  font-size: 12px; color: var(--text2); cursor: pointer; background: none; border: none;
  text-align: left; width: 100%; font-family: inherit;
}
.chart-type-opt:hover { background: var(--slate); }
.chart-type-opt.active { background: rgba(26,86,160,.1); color: var(--royal); font-weight: 700; }
.chart-type-opt .opt-icon { font-size: 13px; width: 16px; text-align: center; }
.chart-type-opt .opt-check { margin-left: auto; font-size: 11px; opacity: 0; }
.chart-type-opt.active .opt-check { opacity: 1; }

/* ── Categorical chart, bar-mode ── */
.cat-bar-list  { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.cat-bar-row   { display: flex; align-items: center; gap: 8px; }
.cat-bar-label { width: 130px; font-size: 11px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
.cat-bar-track { flex: 1; height: 14px; background: var(--slate2); border-radius: 6px; overflow: hidden; }
.cat-bar-fill  { height: 100%; border-radius: 6px; transition: width .4s ease; }
.cat-bar-count { font-size: 11px; color: var(--text3); white-space: nowrap; flex-shrink: 0; }

/* ── Categorical chart, table-mode ── */
.cat-table { width: 100%; margin-top: 14px; border-collapse: collapse; font-size: 12px; }
.cat-table td { padding: 6px 4px; border-bottom: 1px solid var(--slate2); }
.cat-table td.t-label { color: var(--text2); }
.cat-table td.t-count { color: var(--navy); font-weight: 700; text-align: right; width: 46px; }
.cat-table td.t-pct   { color: var(--text3); text-align: right; width: 52px; }
.cat-table tr:last-child td { border-bottom: none; }

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

/* ── Descriptive Statistics ── */
.desc-card { margin-bottom: 14px; }
.desc-stats-row {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
}
.desc-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 10px;
  gap: 4px;
  background: var(--white);
}
.desc-stat-symbol {
  font-size: 12px;
  font-weight: 800;
  color: var(--text3);
  letter-spacing: .5px;
  font-style: italic;
}
.desc-stat-val {
  font-size: 26px;
  font-weight: 800;
  color: var(--navy);
  line-height: 1.1;
}
.desc-stat-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text2);
  text-align: center;
  line-height: 1.5;
}
.desc-stat-label span { font-weight: 400; color: var(--text3); }
.desc-stat-divider { width: 1px; background: var(--line); flex-shrink: 0; }

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
