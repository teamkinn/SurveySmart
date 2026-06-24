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

    <!-- LIST TAB -->
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

    <!-- DASH TAB -->
    <div v-else>
      <!-- Score summary -->
      <div class="chart-card" style="margin-bottom:14px;">
        <h3>📊 สรุปคะแนน</h3>
        <div v-if="responses.length === 0" style="color:var(--text3);font-size:13px;">ยังไม่มีข้อมูล</div>
        <template v-else>
          <div style="font-size:28px;font-weight:800;color:var(--royal);">{{ avgScore }} <span style="font-size:14px;color:var(--text3);">/ 5.00</span></div>
          <span class="interp-badge" :class="interpClass(parseFloat(avgScore))">{{ interpText(parseFloat(avgScore)) }}</span>
          <div style="margin-top:12px;font-size:12px;color:var(--text3);">
            เกณฑ์แปลความ: 4.50–5.00 = ดีมาก | 3.50–4.49 = ดี | 2.50–3.49 = ปานกลาง | 1.50–2.49 = พอใช้ | 1.00–1.49 = ควรปรับปรุง
          </div>
        </template>
      </div>

      <!-- Per-question charts -->
      <div v-if="charts.length" class="section-heading">📊 ผลตอบรับรายคำถาม</div>
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

          <div v-else class="text-empty">ยังไม่มีข้อมูลเพียงพอ</div>
        </div>
      </div>

      <!-- Bottom: respondents + comments -->
      <div class="bottom-grid" style="margin-top:14px;">
        <div class="chart-card">
          <h3>👥 ข้อมูลผู้ตอบ</h3>
          <div v-if="!responses.length" style="color:var(--text3);font-size:13px;margin-top:8px;">ยังไม่มีคำตอบ</div>
          <table v-else class="stat-table">
            <thead><tr><th>#</th><th>ชื่อ</th><th>คะแนน</th><th>วันที่</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in responses" :key="r.id">
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
          <h3>💬 ความคิดเห็น</h3>
          <div v-if="comments.length === 0" style="color:var(--text3);font-size:13px;margin-top:8px;">ยังไม่มีความคิดเห็น</div>
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

const survey   = computed(() =>
  surveyStore.list.find(s => s.id === Number(route.params.id)) ||
  surveyStore.shared.find(s => s.id === Number(route.params.id)) ||
  null
);
const isShared = computed(() => !surveyStore.list.find(s => s.id === Number(route.params.id)) && !!surveyStore.shared.find(s => s.id === Number(route.params.id)));

const avgScore = computed(() => {
  const scores = responses.value.map(r => parseFloat(r.overall_score)).filter(s => !isNaN(s));
  if (!scores.length) return '—';
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
});

const comments = computed(() => responses.value.filter(r => r.note));

const lastDate = computed(() => {
  if (!responses.value.length) return '—';
  return formatDate(responses.value[0].submitted_at);
});

const Q_TYPE_LABELS = {
  short: 'คำตอบสั้นๆ', para: 'ย่อหน้า', radio: 'หลายตัวเลือก',
  checkbox: 'ช่องทำเครื่องหมาย', dropdown: 'เลื่อนลง', scale: 'สเกล',
  star: 'ดาว', date: 'วันที่', time: 'เวลา',
};
function typeLabel(t) { return Q_TYPE_LABELS[t] || t; }
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
    return { ...r, note: paraAns?.answer_text || null };
  });
});
</script>

<style scoped>
.section-heading { font-size: 14px; font-weight: 700; color: var(--navy); margin: 16px 0 10px; letter-spacing: .2px; }
.charts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
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
.bottom-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 14px; align-items: start; }
.avg-cell { font-size: 12px; }
</style>
