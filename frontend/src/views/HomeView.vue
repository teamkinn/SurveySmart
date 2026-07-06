<template>
  <div class="page-panel">
    <div class="page-title-row">
      <div>
        <div class="page-title">หน้าหลัก</div>
        <div class="page-title-sub">ภาพรวมระบบแบบสอบถามออนไลน์</div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-card-accent"></div>
        <div class="stat-label">แบบสอบถามทั้งหมด</div>
        <div class="stat-value">{{ stats.total || 0 }}</div>
        <div class="stat-delta">{{ stats.active || 0 }} กำลังเปิด</div>
        <div class="stat-icon">📋</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent"></div>
        <div class="stat-label">คำตอบรวม</div>
        <div class="stat-value">{{ stats.total_responses || 0 }}</div>
        <div class="stat-icon">💬</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent gold"></div>
        <div class="stat-label">ค่าเฉลี่ยความพึงพอใจ</div>
        <div style="display:flex;align-items:baseline;gap:5px;margin:6px 0 2px;">
          <div class="stat-value">{{ avgScore }}</div>
          <div style="font-size:13px;color:var(--text3);">/ 5.0</div>
        </div>
        <div class="stat-icon">⭐</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent"></div>
        <div class="stat-label">Active ขณะนี้</div>
        <div class="stat-value">{{ stats.active || 0 }}</div>
        <div class="stat-delta">จาก {{ stats.total || 0 }} ทั้งหมด</div>
        <div class="stat-icon">🟢</div>
      </div>
    </div>

    <!-- Recent surveys -->
    <div class="section-heading">
      <h2>แบบสอบถามล่าสุด</h2>
      <RouterLink to="/surveys"><button class="section-link">ดูทั้งหมด →</button></RouterLink>
    </div>

    <div v-if="loading" style="text-align:center;padding:40px;color:var(--text3);">กำลังโหลด...</div>
    <div v-else-if="recent.length === 0" class="empty-state">
      <div class="es-icon">📋</div>
      <div class="es-title">ยังไม่มีแบบสอบถาม</div>
      <div class="es-sub">กดปุ่ม "สร้างแบบสอบถาม" เพื่อเริ่มต้น</div>
    </div>
    <div v-else class="survey-grid">
      <SurveyCard v-for="s in recent" :key="s.id" :survey="s" @view="goResponses" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSurveyStore } from '@/stores/surveys';
import SurveyCard from '@/components/Survey/SurveyCard.vue';

const router = useRouter();
const surveyStore = useSurveyStore();

const loading = computed(() => surveyStore.loading);
const stats = computed(() => surveyStore.stats);
const recent = computed(() => surveyStore.list.slice(0, 3));
const avgScore = computed(() => {
  const a = parseFloat(stats.value.overall_avg);
  return isNaN(a) ? '—' : a.toFixed(1);
});

function goResponses(id) {
  router.push(`/surveys/${id}/responses`);
}

onMounted(() => surveyStore.fetchAll());
</script>
