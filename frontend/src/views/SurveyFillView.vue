<template>
  <div class="fill-bg">
    <div class="fill-wrap">

      <!-- Loading -->
      <div v-if="loading" class="fill-center">
        <div class="fill-spinner">⏳</div>
        <div style="color:var(--text3);margin-top:8px;">กำลังโหลดแบบสอบถาม...</div>
      </div>

      <!-- Not found / closed -->
      <div v-else-if="!survey" class="fill-center">
        <div style="font-size:48px;">🔒</div>
        <div style="font-size:17px;font-weight:700;color:var(--navy);margin-top:12px;">ไม่พบแบบสอบถาม</div>
        <div style="font-size:13px;color:var(--text3);margin-top:6px;">แบบสอบถามนี้อาจปิดรับหรือลิงก์ไม่ถูกต้อง</div>
      </div>

      <!-- Success -->
      <div v-else-if="submitted" class="fill-center">
        <div style="font-size:56px;">✅</div>
        <div style="font-size:18px;font-weight:800;color:var(--navy);margin-top:14px;">ขอบคุณสำหรับคำตอบ!</div>
        <div style="font-size:13px;color:var(--text3);margin-top:6px;">คำตอบของคุณถูกบันทึกเรียบร้อยแล้ว</div>
      </div>

      <!-- Form -->
      <template v-else>
        <!-- Header -->
        <div class="fill-header">
          <div class="fill-brand">📋 SurveySmart</div>
          <h1 class="fill-title">{{ survey.title }}</h1>
          <p v-if="survey.description" class="fill-desc">{{ survey.description }}</p>
        </div>

        <!-- Name field -->
        <div class="fill-card">
          <div class="fill-q-label">ชื่อ-นามสกุล <span class="req">*</span></div>
          <input class="fill-input" v-model="respondentName" placeholder="กรอกชื่อ-นามสกุลของคุณ" required>
        </div>

        <!-- Questions -->
        <div v-for="q in survey.questions" :key="q.id" class="fill-card">
          <div class="fill-q-label">
            {{ q.question_text }}
            <span v-if="q.is_required" class="req">*</span>
          </div>

          <!-- short -->
          <input v-if="q.question_type === 'short'"
                 class="fill-input" v-model="answers[q.id].text"
                 placeholder="คำตอบของคุณ">

          <!-- para -->
          <textarea v-else-if="q.question_type === 'para'"
                    class="fill-textarea" v-model="answers[q.id].text"
                    placeholder="คำตอบของคุณ" rows="4"></textarea>

          <!-- radio -->
          <div v-else-if="q.question_type === 'radio'" class="fill-options">
            <label v-for="opt in parseOpts(q.options_json)" :key="opt" class="fill-option">
              <input type="radio" :name="`q${q.id}`" :value="opt" v-model="answers[q.id].value">
              <span class="fill-option-label">{{ opt }}</span>
            </label>
          </div>

          <!-- checkbox -->
          <div v-else-if="q.question_type === 'checkbox'" class="fill-options">
            <label v-for="opt in parseOpts(q.options_json)" :key="opt" class="fill-option">
              <input type="checkbox" :value="opt" v-model="answers[q.id].values">
              <span class="fill-option-label">{{ opt }}</span>
            </label>
          </div>

          <!-- dropdown -->
          <select v-else-if="q.question_type === 'dropdown'"
                  class="fill-select" v-model="answers[q.id].value">
            <option value="">-- เลือกตัวเลือก --</option>
            <option v-for="opt in parseOpts(q.options_json)" :key="opt" :value="opt">{{ opt }}</option>
          </select>

          <!-- star -->
          <div v-else-if="q.question_type === 'star'" class="fill-stars">
            <span v-for="n in 5" :key="n"
                  class="fill-star"
                  :class="{ active: n <= (answers[q.id].score || 0) }"
                  @click="answers[q.id].score = n"
                  @mouseover="answers[q.id].hover = n"
                  @mouseleave="answers[q.id].hover = 0">
              ★
            </span>
            <span v-if="answers[q.id].score" class="fill-star-val">{{ answers[q.id].score }}/5</span>
          </div>

          <!-- scale -->
          <div v-else-if="q.question_type === 'scale'" class="fill-scale">
            <span class="fill-scale-label">{{ scaleMin(q) }}</span>
            <div class="fill-scale-btns">
              <button v-for="n in scaleRange(q)" :key="n"
                      type="button"
                      class="fill-scale-btn"
                      :class="{ active: answers[q.id].score === n }"
                      @click="answers[q.id].score = n">{{ n }}</button>
            </div>
            <span class="fill-scale-label">{{ scaleMax(q) }}</span>
          </div>

          <!-- date -->
          <input v-else-if="q.question_type === 'date'"
                 class="fill-input" type="date" v-model="answers[q.id].text">

          <!-- time -->
          <input v-else-if="q.question_type === 'time'"
                 class="fill-input" type="time" v-model="answers[q.id].text">

          <!-- number -->
          <input v-else-if="q.question_type === 'number'"
                 class="fill-input" type="number" v-model="answers[q.id].text"
                 placeholder="กรอกตัวเลข">

          <!-- fallback -->
          <input v-else class="fill-input" v-model="answers[q.id].text" placeholder="คำตอบของคุณ">
        </div>

        <!-- Error -->
        <div v-if="error" class="fill-error">{{ error }}</div>

        <!-- Submit -->
        <button class="fill-submit" :disabled="busy" @click="submit">
          {{ busy ? 'กำลังส่ง...' : 'ส่งคำตอบ ✓' }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const baseURL = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({ baseURL });

const loading = ref(true);
const survey = ref(null);
const submitted = ref(false);
const busy = ref(false);
const error = ref('');
const respondentName = ref('');
const answers = reactive({});

function parseOpts(o) {
  if (!o) return [];
  if (Array.isArray(o)) return o;
  if (typeof o === 'string') { try { return JSON.parse(o); } catch { return []; } }
  return [];
}

function scaleMin(q) { const o = q.options_json; return (o && !Array.isArray(o) ? o.min : null) || 1; }
function scaleMax(q) { const o = q.options_json; return (o && !Array.isArray(o) ? o.max : null) || 5; }
function scaleRange(q) {
  const min = scaleMin(q), max = scaleMax(q);
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

function initAnswers(questions) {
  questions.forEach(q => {
    if (q.question_type === 'checkbox') {
      answers[q.id] = { values: [] };
    } else if (['star', 'scale'].includes(q.question_type)) {
      answers[q.id] = { score: null, hover: 0 };
    } else if (['radio', 'dropdown'].includes(q.question_type)) {
      answers[q.id] = { value: '' };
    } else {
      answers[q.id] = { text: '' };
    }
  });
}

function buildAnswers() {
  return survey.value.questions.map(q => {
    const a = answers[q.id];
    switch (q.question_type) {
      case 'radio':
      case 'dropdown': {
        const value = a.value || '';
        const m = value.match(/\((\d+(?:\.\d+)?)\)\s*$/);
        const score = m ? parseFloat(m[1]) : undefined;
        return { question_id: q.id, answer_json: { value }, answer_text: value, ...(score !== undefined ? { score } : {}) };
      }
      case 'checkbox':
        return { question_id: q.id, answer_json: { values: a.values }, answer_text: a.values.join(', ') };
      case 'star':
      case 'scale':
        return { question_id: q.id, answer_json: { score: a.score }, score: a.score };
      default:
        return { question_id: q.id, answer_text: a.text || '' };
    }
  });
}

async function submit() {
  error.value = '';
  if (!respondentName.value.trim()) { error.value = 'กรุณากรอกชื่อ-นามสกุล'; return; }
  for (const q of survey.value.questions) {
    if (!q.is_required) continue;
    const a = answers[q.id];
    const empty = q.question_type === 'checkbox' ? !a.values.length
                : ['star','scale'].includes(q.question_type) ? !a.score
                : ['radio','dropdown'].includes(q.question_type) ? !a.value
                : !a.text?.trim();
    if (empty) { error.value = `กรุณาตอบคำถาม: "${q.question_text}"`; return; }
  }
  busy.value = true;
  try {
    await api.post(`/surveys/${survey.value.id}/responses`, {
      respondent_name: respondentName.value.trim(),
      answers: buildAnswers(),
    });
    submitted.value = true;
  } catch (e) {
    error.value = e.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  try {
    const { data } = await api.get(`/surveys/public/${route.params.token}`);
    survey.value = data;
    initAnswers(data.questions);
  } catch {
    survey.value = null;
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.fill-bg {
  min-height: 100vh;
  background: #f0f4fb;
  padding: 32px 16px 60px;
  font-family: 'Sarabun', sans-serif;
}
.fill-wrap {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.fill-center {
  text-align: center;
  padding: 60px 20px;
}
.fill-header {
  background: var(--navy);
  border-radius: 12px;
  padding: 28px 28px 24px;
  color: #fff;
}
.fill-brand {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  opacity: .7;
  margin-bottom: 10px;
  text-transform: uppercase;
}
.fill-title {
  font-size: 22px;
  font-weight: 800;
  margin: 0 0 8px;
  line-height: 1.3;
}
.fill-desc {
  font-size: 13px;
  opacity: .8;
  margin: 0;
  line-height: 1.6;
}
.fill-card {
  background: #fff;
  border: 1px solid #dde3ee;
  border-radius: 10px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fill-q-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--navy);
  line-height: 1.4;
}
.req { color: #ef4444; margin-left: 3px; }
.fill-input {
  border: 1.5px solid #dde3ee;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: 'Sarabun', sans-serif;
  color: var(--text);
  background: #f8fafc;
  outline: none;
  transition: border-color .15s;
}
.fill-input:focus { border-color: var(--royal); background: #fff; }
.fill-textarea {
  border: 1.5px solid #dde3ee;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: 'Sarabun', sans-serif;
  color: var(--text);
  background: #f8fafc;
  resize: vertical;
  outline: none;
  transition: border-color .15s;
}
.fill-textarea:focus { border-color: var(--royal); background: #fff; }
.fill-select {
  border: 1.5px solid #dde3ee;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  font-family: 'Sarabun', sans-serif;
  color: var(--text);
  background: #f8fafc;
  outline: none;
  cursor: pointer;
}
.fill-options { display: flex; flex-direction: column; gap: 8px; }
.fill-option {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 8px 12px;
  border: 1.5px solid #dde3ee;
  border-radius: 8px;
  transition: all .15s;
}
.fill-option:hover { border-color: var(--royal); background: #f0f4fb; }
.fill-option input { width: 16px; height: 16px; accent-color: var(--royal); flex-shrink: 0; }
.fill-option-label { font-size: 13px; color: var(--text); }
.fill-stars {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.fill-star {
  font-size: 36px;
  color: #dde3ee;
  cursor: pointer;
  transition: color .1s, transform .1s;
  line-height: 1;
}
.fill-star.active, .fill-star:hover { color: #f59e0b; transform: scale(1.1); }
.fill-star-val {
  font-size: 13px;
  font-weight: 700;
  color: #f59e0b;
  margin-left: 6px;
}
.fill-scale {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.fill-scale-label { font-size: 11px; color: var(--text3); white-space: nowrap; }
.fill-scale-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.fill-scale-btn {
  width: 38px;
  height: 38px;
  border: 1.5px solid #dde3ee;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 13px;
  font-weight: 700;
  color: var(--text2);
  cursor: pointer;
  transition: all .15s;
  font-family: 'Sarabun', sans-serif;
}
.fill-scale-btn:hover { border-color: var(--royal); color: var(--royal); }
.fill-scale-btn.active { background: var(--royal); border-color: var(--royal); color: #fff; }
.fill-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: #dc2626;
}
.fill-submit {
  background: var(--navy);
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 14px;
  font-size: 15px;
  font-weight: 700;
  font-family: 'Sarabun', sans-serif;
  cursor: pointer;
  transition: opacity .15s;
  width: 100%;
}
.fill-submit:hover:not(:disabled) { opacity: .88; }
.fill-submit:disabled { opacity: .5; cursor: not-allowed; }
</style>
