<template>
  <div class="page-panel">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <button @click="$router.back()" style="background:none;border:1px solid var(--line);border-radius:var(--r2);padding:6px 10px;cursor:pointer;font-size:12px;color:var(--text2);font-family:'Sarabun',sans-serif;">← กลับ</button>
      <div style="flex:1;">
        <div style="font-size:17px;font-weight:800;color:var(--navy);">{{ survey?.title }}</div>
        <div style="font-size:11px;color:var(--text3);">ผลการตอบกลับ</div>
      </div>
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
                  <span v-for="n in 5" :key="n" class="star" :class="{ empty: n > Math.round(parseFloat(r.score) || 0) }">★</span>
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

      <div class="chart-card">
        <h3>💬 ความคิดเห็น</h3>
        <div v-if="comments.length === 0" style="color:var(--text3);font-size:13px;">ยังไม่มีความคิดเห็น</div>
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
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useSurveyStore } from '@/stores/surveys';
import api from '@/api';

const route       = useRoute();
const surveyStore = useSurveyStore();
const responses   = ref([]);
const activeTab   = ref('list');

const survey = computed(() => surveyStore.list.find(s => s.id === Number(route.params.id)) || null);

const avgScore = computed(() => {
  const scores = responses.value.map(r => parseFloat(r.score)).filter(s => !isNaN(s));
  if (!scores.length) return '—';
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
});

const comments = computed(() => responses.value.filter(r => r.note));

const lastDate = computed(() => {
  if (!responses.value.length) return '—';
  return formatDate(responses.value[0].submitted_at);
});

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
  const { data } = await api.get(`/surveys/${route.params.id}/responses`);
  responses.value = data;
});
</script>
