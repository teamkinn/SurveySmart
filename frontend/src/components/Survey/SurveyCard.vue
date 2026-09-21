<template>
  <div class="survey-card" :style="{ '--card-accent': album?.color }">
    <div class="survey-card-header">
      <div class="album-tag" v-if="album">
        <span class="album-tag-dot" :style="{ background: album.color }"></span>{{ album.name }}
      </div>
      <div class="album-tag album-tag-none" v-else>
        <span class="album-tag-dot"></span>ไม่มีหมวดหมู่
      </div>
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
      <a
        v-if="survey.google_form_url"
        :href="survey.google_form_url"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-sm btn-gforms-link"
        @click.stop
      >
        <img src="https://ssl.gstatic.com/docs/forms/device_home/android_192.png" alt="">Google Forms
      </a>
      <button class="btn-sm btn-outline" @click="$emit('share', survey.id)">📤 แชร์</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useSurveyStore } from '@/stores/surveys';
import { formatDate, badgeClass as badgeClassFor, badgeText as badgeTextFor } from '@/composables/useSurveyStatus';

const props = defineProps({ survey: { type: Object, required: true } });
defineEmits(['view', 'share']);

const surveyStore = useSurveyStore();
// Looked up locally (rather than passed as a prop) since every current
// caller already has the store loaded before rendering this card — keeps
// the "which album is this survey in" lookup in one place instead of each
// parent view re-deriving it.
const album = computed(() => surveyStore.albums.find(a => a.id === props.survey.album_id) || null);

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


<style scoped>
.btn-gforms-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 5px 10px;
  background: white;
  border: 1.5px solid #dadce0;
  border-radius: var(--r2);
  font-size: 11px;
  font-weight: 600;
  color: #3c4043;
  text-decoration: none;
  white-space: nowrap;
}
.btn-gforms-link img { width: 13px; height: 13px; vertical-align: middle; }
.btn-gforms-link:hover { background: #f8f9fa; border-color: #c6c6c6; }
</style>
