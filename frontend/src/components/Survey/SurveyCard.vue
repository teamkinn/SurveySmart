<template>
  <div class="survey-card">
    <div class="survey-card-header">
      <span class="survey-badge" :class="badgeClass">{{ badgeText }}</span>
    </div>
    <div class="survey-title">{{ survey.title }}</div>
    <div class="survey-meta">สร้าง {{ formatDate(survey.created_at) }}</div>
    <div class="survey-stats">
      <div class="s-stat"><div class="val">{{ survey.response_count || 0 }}</div><div class="lbl">ผู้ตอบ</div></div>
      <div class="s-stat"><div class="val">{{ avgScore }}</div><div class="lbl">คะแนนเฉลี่ย</div></div>
      <div class="s-stat"><div class="val">{{ statusLabel }}</div><div class="lbl">สถานะ</div></div>
    </div>
    <div class="survey-actions">
      <button class="btn-sm btn-blue" @click="$emit('view', survey.id)">📊 ดูผล</button>
      <button class="btn-sm btn-outline" @click="$emit('share', survey.id)">📤 แชร์</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { formatDate, badgeClass as badgeClassFor, badgeText as badgeTextFor } from '@/composables/useSurveyStatus';

const props = defineProps({ survey: { type: Object, required: true } });
defineEmits(['view', 'share']);

const badgeClass = computed(() => badgeClassFor(props.survey.status));
const badgeText = computed(() => badgeTextFor(props.survey.status));

const statusLabel = computed(() => {
  return props.survey.status === 'active' ? 'เปิดรับ' : props.survey.status === 'draft' ? 'แบบร่าง' : 'ปิดรับ';
});

const avgScore = computed(() => {
  const a = parseFloat(props.survey.avg_score);
  return isNaN(a) ? '—' : a.toFixed(1);
});
</script>
