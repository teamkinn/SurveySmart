import { ref } from 'vue';

// Chart-type choice (donut / bar / table) per question, shared by the
// per-survey Dashboard (ResponsesView) and the global Dashboard's
// "รายคำถาม" tab so both render question charts the same way. Stored per
// survey in localStorage under the same key, so a choice made on one page
// is reflected on the other.
export const CHART_TYPE_OPTIONS = [
  { value: 'donut', label: 'วงกลม', icon: '\u{1F369}' },
  { value: 'bar', label: 'แท่ง', icon: '\u{1F4CA}' },
  { value: 'table', label: 'ตาราง', icon: '\u{1F4CB}' },
];
export const CHART_COLORS = ['#1a56a0', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#f97316'];
const VALID = new Set(CHART_TYPE_OPTIONS.map(o => o.value));

// Only one chart-type menu open at a time across every card on the page;
// any click outside a menu closes it (cards stop propagation on their own
// button/menu clicks).
export const openChartMenuId = ref(null);
if (typeof window !== 'undefined') {
  window.addEventListener('click', () => { openChartMenuId.value = null; });
}

export function chartTypeStorageKey(surveyId) { return `dashChartType_${surveyId}`; }

export function useChartTypePrefs() {
  const map = ref({});
  let surveyId = null;

  function load(id) {
    surveyId = id;
    try {
      const raw = localStorage.getItem(chartTypeStorageKey(id));
      const parsed = raw ? JSON.parse(raw) : {};
      map.value = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      map.value = {};
    }
  }
  function typeFor(questionId) {
    const t = map.value[questionId];
    return VALID.has(t) ? t : 'donut';
  }
  function setType(questionId, type) {
    map.value = { ...map.value, [questionId]: type };
    openChartMenuId.value = null;
    if (surveyId == null) return;
    try {
      localStorage.setItem(chartTypeStorageKey(surveyId), JSON.stringify(map.value));
    } catch { /* private-mode/quota errors: the choice just won't persist */ }
  }
  return { load, typeFor, setType };
}

// SVG donut segments (circumference = 100 at r=15.9), starting at 12 o'clock.
export function donutSegments(data, total) {
  if (!total) return [];
  let cumulative = 0;
  return data.map((d, i) => {
    const pct = (d.count / total) * 100;
    const offset = 25 - cumulative;
    cumulative += pct;
    return { pct, offset, color: CHART_COLORS[i % CHART_COLORS.length], label: d.label };
  }).filter(s => s.pct > 0);
}
