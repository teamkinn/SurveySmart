<template>
  <div class="qcc">
    <div class="chart-card-header">
      <div>
        <div class="chart-q-text">{{ chart.question_text }}</div>
        <div class="chart-q-meta">{{ chart.total }} คำตอบ · {{ meta }}</div>
      </div>
      <div class="chart-type-picker">
        <button
          type="button"
          class="chart-type-btn"
          :class="{ 'menu-open': menuOpen }"
          @click.stop="toggleMenu"
        ><span>{{ currentIcon }}</span><span class="caret">▾</span></button>
        <div class="chart-type-menu" :class="{ open: menuOpen }" @click.stop>
          <button
            v-for="opt in CHART_TYPE_OPTIONS"
            :key="opt.value"
            type="button"
            class="chart-type-opt"
            :class="{ active: type === opt.value }"
            @click="$emit('update:type', opt.value)"
          ><span class="opt-icon">{{ opt.icon }}</span>{{ opt.label }}<span class="opt-check">✓</span></button>
        </div>
      </div>
    </div>

    <div v-if="!chart.total" class="text-empty">ยังไม่มีคำตอบ</div>
    <template v-else>
      <div v-if="type === 'donut'" class="donut-area">
        <svg viewBox="0 0 36 36" class="donut-svg">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e8edf5" stroke-width="3.8"/>
          <circle
            v-for="seg in segments"
            :key="seg.label"
            cx="18" cy="18" r="15.9"
            fill="none"
            :stroke="seg.color"
            stroke-width="3.8"
            pathLength="100"
            :stroke-dasharray="`${seg.pct} ${100 - seg.pct}`"
            :stroke-dashoffset="seg.offset"
          />
          <text x="18" y="15.5" text-anchor="middle" class="svg-num">{{ chart.total }}</text>
          <text x="18" y="23" text-anchor="middle" class="svg-sub">คน</text>
        </svg>
        <div class="donut-legend">
          <div v-for="(item, i) in chart.data" :key="item.label"
               class="legend-item" :class="{ 'legend-item-zero': item.count === 0 }">
            <span class="legend-dot" :style="{ background: colorFor(item, i) }"></span>
            <span class="legend-label">{{ item.label }}</span>
            <span class="legend-count">
              {{ item.count }}
              <span v-if="item.count > 0" class="legend-pct">({{ pct(item) }}%)</span>
            </span>
          </div>
        </div>
      </div>
      <div v-else-if="type === 'bar'" class="cat-bar-list">
        <div v-for="(item, i) in chart.data" :key="item.label" class="cat-bar-row">
          <span class="cat-bar-label" :title="item.label">{{ item.label }}</span>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" :style="{ width: (item.count / chart.total * 100) + '%', background: colorFor(item, i) }"></div>
          </div>
          <span class="cat-bar-count">
            {{ item.count }}
            <span v-if="item.count > 0" class="legend-pct">({{ pct(item) }}%)</span>
          </span>
        </div>
      </div>
      <table v-else class="cat-table">
        <tr v-for="item in chart.data" :key="item.label">
          <td class="t-label">{{ item.label }}</td>
          <td class="t-count">{{ item.count }}</td>
          <td class="t-pct">{{ item.count > 0 ? pct(item) + '%' : '—' }}</td>
        </tr>
      </table>
    </template>
  </div>
</template>

<script setup>
// One categorical question's chart card: donut / bar / table, switchable
// from a single dropdown button. Used by ResponsesView (per-survey
// Dashboard tab) and DashboardView ("รายคำถาม" tab) so both look the same.
import { computed } from 'vue';
import { CHART_TYPE_OPTIONS, CHART_COLORS, openChartMenuId, donutSegments } from '@/composables/useChartTypePrefs';

const props = defineProps({
  chart: { type: Object, required: true },   // { question_id, question_text, total, data: [{ label, count }] }
  type:  { type: String, default: 'donut' },
  meta:  { type: String, default: 'การแจกแจง' },
});
defineEmits(['update:type']);

const menuOpen = computed(() => openChartMenuId.value === props.chart.question_id);
function toggleMenu() {
  openChartMenuId.value = menuOpen.value ? null : props.chart.question_id;
}
const currentIcon = computed(() =>
  (CHART_TYPE_OPTIONS.find(o => o.value === props.type) || CHART_TYPE_OPTIONS[0]).icon
);
const segments = computed(() => donutSegments(props.chart.data || [], props.chart.total));
function colorFor(item, i) { return item.count > 0 ? CHART_COLORS[i % CHART_COLORS.length] : '#dde3ee'; }
function pct(item) { return Math.round(item.count / props.chart.total * 100); }
</script>

<style scoped>
.chart-q-text { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 3px; line-height: 1.4; }
.chart-q-meta { font-size: 10px; color: var(--text3); margin-bottom: 8px; }
.text-empty { font-size: 12px; color: var(--text3); font-style: italic; margin-top: 10px; }

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
</style>
