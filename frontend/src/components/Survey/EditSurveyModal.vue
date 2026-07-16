<template>
  <div class="overlay" :class="{ open: isOpen }">
    <div class="modal" style="max-width:640px;">
      <div class="modal-header">
        <h2>✏️ แก้ไขแบบสอบถาม</h2>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
        <div v-if="loading" style="padding:24px 0;text-align:center;color:var(--text3);font-size:13px;">กำลังโหลด...</div>

        <template v-else>
          <div v-if="ownerLabel" style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.25);border-radius:var(--r);padding:8px 12px;margin-bottom:14px;font-size:11px;color:#dc2626;">
            ⚙️ กำลังแก้ไขในฐานะ Admin — เจ้าของ: {{ ownerLabel }}
          </div>

          <div class="field"><label>ชื่อแบบสอบถาม *</label><input v-model="form.title" placeholder="ชื่อแบบสอบถาม"></div>
          <div class="field"><label>คำอธิบาย</label><textarea v-model="form.description" rows="2" placeholder="อธิบายวัตถุประสงค์ของแบบสอบถาม"></textarea></div>
          <div style="display:flex;gap:10px;">
            <div class="field" style="flex:1;"><label>วันสิ้นสุด</label><input type="date" v-model="form.close_date"></div>
            <div class="field" style="flex:1;"><label>เป้าหมายจำนวนผู้ตอบ</label><input type="number" min="1" v-model="form.target_responses" placeholder="เช่น 100"></div>
          </div>

          <div v-if="isSynced" style="margin-top:6px;background:rgba(26,86,160,.06);border:1px solid rgba(26,86,160,.18);border-radius:var(--r);padding:10px 14px;font-size:12px;color:var(--royal);">
            🔗 แบบสอบถามนี้ซิงค์กับ Google Forms — แก้ไขคำถามได้ที่
            <a :href="googleFormUrl" target="_blank" style="color:var(--royal);font-weight:700;">Google Forms</a>
            เท่านั้น เพื่อไม่ให้ข้อมูลไม่ตรงกับฟอร์มจริงที่ผู้ตอบเห็น
          </div>

          <template v-else>
            <div v-if="hasResponses" style="margin-top:6px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.25);border-radius:var(--r);padding:10px 14px;font-size:12px;color:#dc2626;">
              ⚠ มีผู้ตอบแบบสอบถามนี้แล้ว — ไม่สามารถแก้ไขคำถามได้ (แก้ได้เฉพาะข้อมูลด้านบน)
            </div>

            <template v-else>
              <div v-for="(sec, si) in sections" :key="si" style="margin-top:16px;padding-top:12px;border-top:1px dashed var(--line);">
                <div style="font-size:11px;font-weight:800;letter-spacing:.5px;color:var(--text3);margin-bottom:8px;">คำถาม — {{ sectionNames[si] }}</div>

                <div v-for="q in sec" :key="q.id" class="q-card" :class="{ 'drag-over': dragOverId === q.id }"
                  draggable="true" @dragstart="onDragStart($event, si, q.id)" @dragover.prevent="dragOverId = q.id" @dragleave="dragOverId = null" @drop="onDrop($event, si, q.id)" @dragend="dragOverId = null">
                  <div class="q-card-top">
                    <span class="drag-handle">⠿</span>
                    <input class="q-input" v-model="q.text" placeholder="คำถาม...">
                    <div class="q-type-picker" @click.stop>
                      <button class="q-type-btn" @click="togglePicker(q.id)">
                        <span>{{ typeIcon(q.type) }}</span><span class="q-type-btn-label">{{ typeLabel(q.type) }}</span><span class="q-type-arrow">▾</span>
                      </button>
                      <div v-show="openPickerId === q.id" class="q-type-menu">
                        <button v-for="t in Q_TYPES" :key="t.value" class="q-type-item" :class="{ active: q.type === t.value }" @click="selectType(q, t.value)">
                          <span class="q-type-item-icon">{{ t.icon }}</span><span>{{ t.label }}</span>
                        </button>
                      </div>
                    </div>
                    <button class="q-delete" @click="deleteQ(si, q.id)">🗑</button>
                  </div>
                  <div v-if="needsOpts(q.type)" style="margin-top:10px;">
                    <div v-for="(opt, oi) in q.opts" :key="oi" class="option-row">
                      <span class="option-bullet">{{ q.type === 'radio' ? '◉' : q.type === 'checkbox' ? '☑' : (oi + 1) + '.' }}</span>
                      <input :value="opt" @input="q.opts[oi] = $event.target.value" :placeholder="'ตัวเลือก ' + (oi + 1)">
                      <button class="option-remove" @click="q.opts.splice(oi, 1)">✕</button>
                    </div>
                    <button class="add-option-btn" @click="q.opts.push('')">＋ เพิ่มตัวเลือก</button>
                  </div>
                  <div v-if="q.type === 'scale'" class="scale-range-row">
                    <span>ต่ำสุด</span><input type="number" v-model.number="q.scaleMin" class="scale-range-input">
                    <span>สูงสุด</span><input type="number" v-model.number="q.scaleMax" class="scale-range-input">
                  </div>
                </div>

                <div class="add-q-bar"><button class="add-q-btn" @click="addQ(si)">＋ เพิ่มคำถาม</button></div>
              </div>
            </template>
          </template>
        </template>
      </div>

      <div class="modal-footer">
        <button class="btn-sm btn-outline" @click="close">ยกเลิก</button>
        <button class="btn-sm btn-blue" :disabled="saving || loading" @click="doSave">{{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, inject, onMounted, onBeforeUnmount } from 'vue';
import api from '@/api';
import { useSurveyStore } from '@/stores/surveys';

const emit = defineEmits(['saved']);
const showToast = inject('showToast');
const surveyStore = useSurveyStore();

const isOpen = ref(false);
const loading = ref(false);
const saving = ref(false);
const surveyId = ref(null);
const ownerLabel = ref('');
const isSynced = ref(false);
const googleFormUrl = ref('');
const hasResponses = ref(false);

const form = ref({ title: '', description: '', close_date: '', target_responses: '' });

const sectionNames = ['ตอนที่ 1', 'ตอนที่ 2', 'ตอนที่ 3'];
const sections = ref([[], [], []]);

const Q_TYPES = [
  { value: 'short', label: 'คำตอบสั้นๆ', icon: '—' },
  { value: 'para', label: 'ย่อหน้า', icon: '≡' },
  { value: 'radio', label: 'หลายตัวเลือก', icon: '◉' },
  { value: 'checkbox', label: 'ช่องทำเครื่องหมาย', icon: '☑' },
  { value: 'dropdown', label: 'เลื่อนลง', icon: '⌄' },
  { value: 'scale', label: 'สเกลเชิงเส้น', icon: '↔' },
  { value: 'star', label: 'คะแนน (ดาว)', icon: '☆' },
  { value: 'date', label: 'วันที่', icon: '📅' },
  { value: 'time', label: 'เวลา', icon: '⏰' },
];

function typeIcon(val) { return Q_TYPES.find(t => t.value === val)?.icon ?? '—'; }
function typeLabel(val) { return Q_TYPES.find(t => t.value === val)?.label ?? val; }
function needsOpts(t) { return ['radio', 'checkbox', 'dropdown'].includes(t); }

const openPickerId = ref(null);
const dragOverId = ref(null);
let dragSrc = { sec: null, id: null };

function togglePicker(id) { openPickerId.value = openPickerId.value === id ? null : id; }
function selectType(q, val) { q.type = val; openPickerId.value = null; }

const _closeAll = () => { openPickerId.value = null; };
onMounted(() => document.addEventListener('click', _closeAll));
onBeforeUnmount(() => document.removeEventListener('click', _closeAll));

let qId = 0;
function mkQ(type, text, opts = [], required = false, scaleMin = 1, scaleMax = 5) {
  return { id: ++qId, type, text, opts: [...opts], required, scaleMin, scaleMax };
}

function addQ(si) { sections.value[si].push(mkQ('short', '')); }
function deleteQ(si, id) { sections.value[si] = sections.value[si].filter(q => q.id !== id); }

function onDragStart(e, si, id) {
  dragSrc = { sec: si, id };
  e.dataTransfer.effectAllowed = 'move';
}
function onDrop(e, si, targetId) {
  dragOverId.value = null;
  if (dragSrc.id === targetId || dragSrc.sec !== si) return;
  const list = [...sections.value[si]];
  const from = list.findIndex(q => q.id === dragSrc.id);
  const to = list.findIndex(q => q.id === targetId);
  if (from < 0 || to < 0) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  sections.value[si] = list;
}

function parseOpts(json) {
  if (!json) return [];
  try {
    const v = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Scale/star store their range as {min,max}, not an array — parseOpts()
// above would flatten that to [] and silently drop the configured range.
function parseScaleRange(json) {
  try {
    const v = typeof json === 'string' ? JSON.parse(json) : json;
    if (v && !Array.isArray(v)) return { min: v.min ?? 1, max: v.max ?? 5 };
  } catch { /* fall through to default */ }
  return { min: 1, max: 5 };
}

async function open(survey, ownerText = '') {
  isOpen.value = true;
  loading.value = true;
  ownerLabel.value = ownerText;
  surveyId.value = survey.id;
  qId = 0;
  openPickerId.value = null;

  try {
    const { data } = await api.get(`/surveys/${survey.id}`);
    form.value = {
      title: data.title || '',
      description: data.description || '',
      close_date: data.close_date ? String(data.close_date).slice(0, 10) : '',
      target_responses: data.target_responses || '',
    };
    isSynced.value = !!data.google_form_url;
    googleFormUrl.value = data.google_form_url || '';

    const questions = Array.isArray(data.questions) ? data.questions : [];
    hasResponses.value = !isSynced.value && !!(data.response_count > 0);

    const grouped = [[], [], []];
    questions.forEach(q => {
      const si = Math.min(Math.max((q.section_number || 1) - 1, 0), 2);
      const range = q.question_type === 'scale' ? parseScaleRange(q.options_json) : { min: 1, max: 5 };
      grouped[si].push(mkQ(q.question_type, q.question_text || '', parseOpts(q.options_json), !!q.is_required, range.min, range.max));
    });
    sections.value = grouped;
  } catch (e) {
    showToast(e.response?.data?.message || 'ไม่สามารถโหลดแบบสอบถามได้');
    close();
  } finally {
    loading.value = false;
  }
}

function close() {
  isOpen.value = false;
}

async function doSave() {
  if (!form.value.title.trim()) {
    showToast('กรุณาระบุชื่อแบบสอบถาม');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      title: form.value.title.trim(),
      description: form.value.description,
      close_date: form.value.close_date || null,
      target_responses: form.value.target_responses || null,
    };

    if (!isSynced.value && !hasResponses.value) {
      const questions = [];
      sections.value.forEach((sec, si) => {
        sec.forEach((q, i) => {
          const options = q.type === 'scale' ? { min: q.scaleMin ?? 1, max: q.scaleMax ?? 5 } : q.opts;
          questions.push({
            section: si + 1,
            order: i,
            text: q.text,
            type: q.type,
            required: q.required,
            options,
          });
        });
      });
      payload.questions = questions;
    }

    await surveyStore.update(surveyId.value, payload);
    showToast('บันทึกการแก้ไขเรียบร้อยแล้ว');
    emit('saved');
    close();
  } catch (e) {
    showToast(e.response?.data?.message || 'เกิดข้อผิดพลาด');
  } finally {
    saving.value = false;
  }
}

defineExpose({ open });
</script>

<style scoped>
.drag-handle { cursor: grab; color: var(--text3); font-size: 16px; padding: 2px 4px; user-select: none; flex-shrink: 0; }
.q-card.drag-over { border-color: var(--royal); box-shadow: 0 0 0 2px rgba(26,86,160,.15); }
.q-type-picker { position: relative; flex-shrink: 0; }
.q-type-btn { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1.5px solid var(--line); border-radius: var(--r2); background: white; cursor: pointer; min-width: 175px; font-family: 'Sarabun', sans-serif; font-size: 11px; color: var(--text2); white-space: nowrap; }
.q-type-btn:hover { border-color: var(--royal); }
.q-type-btn-label { flex: 1; text-align: left; }
.q-type-arrow { font-size: 9px; color: var(--text3); }
.q-type-menu { position: absolute; top: calc(100% + 4px); right: 0; background: white; border: 1px solid var(--line); border-radius: var(--r); box-shadow: var(--sh3); z-index: 200; min-width: 210px; padding: 4px 0; max-height: 300px; overflow-y: auto; }
.q-type-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 14px; border: none; background: none; font-family: 'Sarabun', sans-serif; font-size: 12px; color: var(--text); cursor: pointer; text-align: left; }
.q-type-item:hover { background: var(--slate); }
.q-type-item.active { background: rgba(26,86,160,.08); color: var(--royal); font-weight: 700; }
.q-type-item-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
.option-bullet { font-size: 13px; color: var(--text3); width: 18px; text-align: center; flex-shrink: 0; }
.scale-range-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--text2); }
.scale-range-input { width: 60px; padding: 5px 8px; border: 1.5px solid var(--line); border-radius: var(--r2); font-family: 'Sarabun', sans-serif; font-size: 12px; }
</style>
