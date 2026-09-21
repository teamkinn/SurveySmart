<template>
  <div class="im-overlay" :class="{ open: isOpen }">
    <div class="im-modal" :class="{ 'im-modal-wide': phase === 'review' }">
      <div class="modal-header">
        <h2>📄 นำเข้าจากไฟล์ CSV / Excel</h2>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body">

        <!-- Input phase -->
        <template v-if="phase === 'input'">
          <p class="im-desc">อัปโหลดไฟล์ CSV หรือ Excel (.xlsx) ที่กำหนดคำถามของแบบสอบถาม หรือไฟล์ข้อมูลทั่วไป (เช่น ไฟล์ที่ได้จากปุ่ม "Export CSV" ของแบบสอบถามอื่น หรือข้อมูลที่เก็บไว้ในสเปรดชีตอยู่แล้ว — ใช้หัวคอลัมน์เป็นคำถามให้อัตโนมัติ) ระบบจะสร้างแบบสอบถามใหม่ (สถานะร่าง) จากไฟล์นี้ให้ทันที</p>

          <div class="im-field">
            <label class="im-label">ชื่อแบบสอบถาม *</label>
            <input v-model="title" class="im-input" placeholder="เช่น แบบสำรวจความพึงพอใจ" />
          </div>
          <div class="im-field">
            <label class="im-label">คำอธิบาย (ไม่บังคับ)</label>
            <input v-model="description" class="im-input" placeholder="" />
          </div>

          <div class="im-field">
            <label class="im-label">ไฟล์ CSV หรือ Excel (.xlsx) *</label>
            <input ref="fileInput" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="im-file" @change="onFile" />
          </div>

          <button type="button" class="im-template-link" @click="downloadTemplate">⬇ ดาวน์โหลดไฟล์ตัวอย่าง (Template)</button>

          <div class="im-note">
            <span>ℹ️</span>
            <span>
              คอลัมน์ที่รองรับ: <code>section, question_text, question_type, required, options, scale_min, scale_max</code><br>
              question_type ที่รองรับ: short, para, radio, checkbox, dropdown, scale, star, date, time<br>
              options: คั่นตัวเลือกด้วย <code>|</code> เช่น <code>ดี|ปานกลาง|แย่</code> (สำหรับ radio/checkbox/dropdown เท่านั้น)
            </span>
          </div>

          <div v-if="isResponseExportFile" class="im-note" style="margin-top:8px;">
            <span>🔁</span>
            <span>
              ไฟล์นี้ไม่มีคอลัมน์ question_text — ระบบจะสร้างคำถามจากหัวคอลัมน์ในไฟล์นี้ให้อัตโนมัติแทน
              (เดาประเภทคำถามจากค่าในไฟล์ ตรวจสอบ/แก้ไขได้ภายหลัง) และนำเข้าทุกแถวเป็นคำตอบของแบบสอบถามใหม่นี้ด้วย
            </span>
          </div>

          <div v-if="parseError" class="im-error-box">{{ parseError }}</div>

          <div v-if="preview.length" class="im-preview">
            <div class="im-preview-head">
              พบ {{ preview.length }} คำถาม{{ isResponseExportFile ? ` และ ${importRows.length} คำตอบ` : '' }}
              <span v-if="warnings.length" class="im-preview-warn"> — ข้าม {{ warnings.length }} แถวที่มีปัญหา</span>
            </div>
            <div class="im-preview-list">
              <div v-for="(q, i) in preview.slice(0, 8)" :key="i" class="im-preview-row">
                <span class="im-preview-idx">{{ i + 1 }}.</span>
                <span class="im-preview-text">{{ q.text }}</span>
                <span class="im-preview-type">{{ typeLabel(q.type) }}</span>
              </div>
              <div v-if="preview.length > 8" class="im-preview-more">…และอีก {{ preview.length - 8 }} ข้อ</div>
            </div>
            <div v-if="warnings.length" class="im-preview-warnings">
              <div v-for="(w, i) in warnings.slice(0, 5)" :key="i">⚠️ แถวที่ {{ w.row }}: {{ w.reason }}</div>
            </div>
          </div>
        </template>

        <!-- Review / edit phase -->
        <template v-else-if="phase === 'review'">
          <p class="im-desc">ตรวจสอบคำถามที่ตรวจพบ แก้ไขข้อความ/ประเภท/ตัวเลือกได้ตามต้องการ แล้วกด "สร้างแบบสอบถามจริง" ด้านล่างเพื่อสร้างแบบสอบถามนี้จริง — ก่อนหน้านี้ยังไม่มีการสร้างแบบสอบถามใดๆ ทั้งสิ้น</p>

          <div v-if="isResponseExportFile" class="im-note" style="margin-bottom:12px;">
            <span>🔒</span>
            <span>
              ไฟล์นี้จะนำเข้าคำตอบแต่ละแถวตามตำแหน่งคอลัมน์ไปด้วย จึงแก้ไขได้เฉพาะข้อความ/ประเภท/ตัวเลือกของคำถามที่มีอยู่ —
              ไม่สามารถเพิ่ม ลบ หรือจัดเรียงคำถามใหม่ได้ (เพื่อไม่ให้คำตอบจับคู่กับคำถามผิดข้อ)
            </span>
          </div>

          <div class="review-q-list">
            <div v-for="(q, i) in preview" :key="i" class="review-q-card">
              <div class="review-q-top">
                <span class="review-q-num">{{ i + 1 }}</span>
                <input v-model="q.text" class="review-q-text" placeholder="ข้อความคำถาม" />
                <select v-model="q.type" class="review-q-type" @change="onTypeChange(q)">
                  <option v-for="t in TYPE_VALUES" :key="t" :value="t">{{ typeLabel(t) }}</option>
                </select>
                <button
                  v-if="!isResponseExportFile"
                  type="button"
                  class="review-q-del"
                  title="ลบคำถามนี้"
                  @click="removeQuestion(i)"
                >🗑</button>
              </div>

              <label class="review-q-required">
                <input type="checkbox" v-model="q.required" /> จำเป็นต้องตอบ
              </label>

              <div v-if="['radio', 'checkbox', 'dropdown'].includes(q.type)" class="review-q-opts">
                <div v-for="(opt, oi) in (q.options || [])" :key="oi" class="review-opt-row">
                  <input
                    :value="opt"
                    class="review-opt-input"
                    :placeholder="'ตัวเลือก ' + (oi + 1)"
                    @input="q.options[oi] = $event.target.value"
                  />
                  <button type="button" class="review-opt-del" @click="q.options.splice(oi, 1)">✕</button>
                </div>
                <button type="button" class="review-opt-add" @click="(q.options = q.options || []).push('')">＋ เพิ่มตัวเลือก</button>
              </div>

              <div v-else-if="q.type === 'scale'" class="review-q-scale">
                <span>ต่ำสุด</span><input type="number" v-model.number="q.options.min" class="review-scale-input">
                <span>สูงสุด</span><input type="number" v-model.number="q.options.max" class="review-scale-input">
              </div>
            </div>

            <div v-if="!preview.length" class="review-empty">ไม่มีคำถามเหลืออยู่ในแบบสอบถามนี้</div>
          </div>

          <button
            v-if="!isResponseExportFile"
            type="button"
            class="im-template-link"
            @click="addQuestion"
          >＋ เพิ่มคำถามใหม่</button>

          <p v-if="!canCreate" class="review-hint">
            ⚠️ ทุกคำถามต้องมีข้อความ คำถามแบบเลือกตอบต้องมีอย่างน้อย 1 ตัวเลือก และสเกลต้องระบุค่าต่ำสุด/สูงสุดให้ถูกต้อง
          </p>
        </template>

        <!-- Importing phase -->
        <template v-else-if="phase === 'importing'">
          <div class="im-status-box">
            <div class="im-spinner-wrap"><span class="im-spinner">⟳</span></div>
            <p class="im-status-title">กำลังสร้างแบบสอบถาม...</p>
          </div>
        </template>

        <!-- Done phase -->
        <template v-else-if="phase === 'done'">
          <div class="im-done-box">
            <div class="im-done-icon">✓</div>
            <p class="im-done-title">นำเข้าสำเร็จ!</p>
            <p class="im-done-survey">{{ result.title }}</p>
            <div class="im-stats">
              <div class="im-stat">
                <div class="im-stat-num">{{ result.questionCount }}</div>
                <div class="im-stat-label">คำถาม</div>
              </div>
              <div class="im-stat" v-if="result.responseCount != null">
                <div class="im-stat-num">{{ result.responseCount }}</div>
                <div class="im-stat-label">คำตอบ</div>
              </div>
            </div>
            <p v-if="result.responseImportFailed" class="im-status-sub" style="margin-top:8px;">
              ⚠️ สร้างแบบสอบถามสำเร็จ แต่นำเข้าคำตอบไม่สำเร็จ — ลองใช้ปุ่ม "นำเข้าคำตอบ CSV/Excel" ในหน้าแบบสอบถามนี้อีกครั้ง
            </p>
          </div>
        </template>

        <!-- Error phase -->
        <template v-else-if="phase === 'error'">
          <div class="im-status-box">
            <div class="im-big-icon">⚠️</div>
            <p class="im-status-title">เกิดข้อผิดพลาด</p>
            <p class="im-status-sub im-error-msg">{{ errorMsg }}</p>
          </div>
        </template>

      </div>

      <div class="modal-footer">
        <template v-if="phase === 'input'">
          <button class="btn-sm btn-outline" @click="close">ยกเลิก</button>
          <button class="btn-sm btn-blue" :disabled="!canSubmit" @click="goReview">ดูตัวอย่าง →</button>
        </template>
        <template v-else-if="phase === 'review'">
          <button class="btn-sm btn-outline" @click="phase = 'input'">← กลับ</button>
          <button class="btn-sm btn-blue" :disabled="!canCreate" @click="doImport">✓ สร้างแบบสอบถามจริง</button>
        </template>
        <template v-else-if="phase === 'error'">
          <button class="btn-sm btn-outline" @click="close">ปิด</button>
          <button class="btn-sm btn-blue" @click="phase = 'input'">ลองใหม่</button>
        </template>
        <template v-else-if="phase === 'done'">
          <button class="btn-sm btn-blue" @click="closeAndGo">ดูแบบสอบถาม →</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/api';
import { readSpreadsheetFile, downloadCSV, inferQuestionsFromResponseExport } from '@/composables/useCsv';

const emit = defineEmits(['imported']);
const router = useRouter();
const showToast = inject('showToast');

const isOpen = ref(false);
const phase = ref('input');
const title = ref('');
const description = ref('');
const errorMsg = ref('');
const parseError = ref('');
const preview = ref([]);
const warnings = ref([]);
const result = ref({ title: '', questionCount: 0, responseCount: null, responseImportFailed: false });
const fileInput = ref(null);

// Set when onFile() detects the uploaded CSV is a "Export CSV" responses
// file rather than a question-structure file — see inferQuestionsFromResponseExport
// in composables/useCsv.js. importHeaders/importRows keep the ORIGINAL parsed
// CSV (not just the inferred question list) so doImport() can hand them to
// the exact same /responses/import-csv endpoint ImportResponsesCsvModal.vue
// uses, once the survey (and its now-real question ids) exists.
const isResponseExportFile = ref(false);
let importHeaders = [];
let importRows = [];

const TYPE_VALUES = ['short', 'para', 'radio', 'checkbox', 'dropdown', 'scale', 'star', 'date', 'time'];
const TYPE_LABELS = {
  short: 'คำตอบสั้นๆ', para: 'ย่อหน้า', radio: 'หลายตัวเลือก', checkbox: 'ช่องทำเครื่องหมาย',
  dropdown: 'เลื่อนลง', scale: 'สเกลเชิงเส้น', star: 'คะแนน (ดาว)', date: 'วันที่', time: 'เวลา',
};
function typeLabel(t) { return TYPE_LABELS[t] || t; }

// Enables "ดูตัวอย่าง →" on the input phase — just "is there something
// parsed to review", same bar as before this review step existed.
const canSubmit = computed(() => title.value.trim() && preview.value.length > 0);

// Enables "✓ สร้างแบบสอบถามจริง" on the review phase, after the user may
// have hand-edited every question — re-validates the same things onFile()
// originally guaranteed on parse (non-blank text; at least one non-blank
// option for a choice question; a sane numeric scale range), since editing
// can just as easily break those as fix a bad auto-guess.
const canCreate = computed(() => {
  if (!canSubmit.value) return false;
  return preview.value.every(q => {
    if (!String(q.text || '').trim()) return false;
    if (['radio', 'checkbox', 'dropdown'].includes(q.type)) {
      return Array.isArray(q.options) && q.options.some(o => String(o || '').trim());
    }
    if (q.type === 'scale') {
      const min = q.options?.min, max = q.options?.max;
      return typeof min === 'number' && typeof max === 'number' && !isNaN(min) && !isNaN(max) && min < max;
    }
    return true;
  });
});

function goReview() {
  if (!canSubmit.value) return;
  phase.value = 'review';
}

// Reshapes a question's `options` to whatever its (possibly just-changed)
// type expects, so switching a select away from radio/checkbox/dropdown
// doesn't leave a stale options ARRAY behind for a type that expects a
// {min,max} object (or vice versa) — surveyController.create stores
// whatever's here as-is (JSON.stringify(q.options)), so this has to be
// right by the time doImport() posts it, not just cosmetically ignored.
function onTypeChange(q) {
  if (['radio', 'checkbox', 'dropdown'].includes(q.type)) {
    if (!Array.isArray(q.options)) q.options = ['', ''];
  } else if (q.type === 'scale') {
    if (!q.options || Array.isArray(q.options) || typeof q.options !== 'object') {
      q.options = { min: 1, max: 5 };
    }
  } else {
    q.options = null;
  }
}

// Only offered when !isResponseExportFile (see the template) — adding a
// question here is unambiguous exactly when there's no separate raw-file
// row import afterward whose column positions this would throw off.
function addQuestion() {
  preview.value.push({
    section: preview.value.at(-1)?.section || 1,
    order: preview.value.length,
    text: '',
    type: 'short',
    required: false,
    options: null,
  });
}

// Same guard as addQuestion — deleting a question here would desync
// importHeaders' column positions from the survey's questions for a
// response-export-style import, so the template only renders this button
// when !isResponseExportFile.
function removeQuestion(i) {
  preview.value.splice(i, 1);
}

// Recomputes each question's `order` as a 0-based sequence WITHIN its
// section, from final array order — onFile() originally set `order` once
// at parse time (built.filter(...).length), which goes stale the moment
// the review step lets someone add, delete, or leaves gaps; this just
// re-derives it fresh right before doImport() posts, from whatever the
// user's final list looks like, so sort_order in the DB always matches
// what they actually saw.
function normalizeOrder(list) {
  const counters = {};
  return list.map(q => {
    const section = q.section || 1;
    const order = counters[section] || 0;
    counters[section] = order + 1;
    return { ...q, section, order };
  });
}

function open() {
  title.value = '';
  description.value = '';
  errorMsg.value = '';
  parseError.value = '';
  preview.value = [];
  warnings.value = [];
  isResponseExportFile.value = false;
  importHeaders = [];
  importRows = [];
  phase.value = 'input';
  isOpen.value = true;
}

function close() { isOpen.value = false; }

function closeAndGo() {
  isOpen.value = false;
  emit('imported');
  router.push('/surveys');
}

function downloadTemplate() {
  downloadCSV('survey_template.csv', [
    ['section', 'question_text', 'question_type', 'required', 'options', 'scale_min', 'scale_max'],
    [1, 'ชื่อ-นามสกุล', 'short', 'yes', '', '', ''],
    [1, 'เพศ', 'radio', 'no', 'ชาย|หญิง|ไม่ระบุ', '', ''],
    [2, 'ความพึงพอใจโดยรวม', 'scale', 'yes', '', 1, 5],
    [2, 'คุณภาพการบริการ', 'star', 'no', '', '', ''],
    [3, 'ข้อเสนอแนะเพิ่มเติม', 'para', 'no', '', '', ''],
  ]);
}

function toBool(v) {
  const s = String(v || '').trim().toLowerCase();
  return ['1', 'yes', 'y', 'true', 'จำเป็น'].includes(s);
}

async function onFile(e) {
  const file = e.target.files?.[0];
  preview.value = [];
  warnings.value = [];
  parseError.value = '';
  isResponseExportFile.value = false;
  importHeaders = [];
  importRows = [];
  if (!file) return;

  try {
    const { headers, rows } = await readSpreadsheetFile(file);
    if (!headers.length || !rows.length) {
      parseError.value = 'ไม่พบข้อมูลในไฟล์';
      return;
    }

    const col = name => headers.findIndex(h => h.trim().toLowerCase() === name);
    const idx = {
      section: col('section'),
      text: col('question_text'),
      type: col('question_type'),
      required: col('required'),
      options: col('options'),
      scaleMin: col('scale_min'),
      scaleMax: col('scale_max'),
    };
    if (idx.text === -1) {
      // Not a question-structure file — try it as a responses-export file
      // (what "Export CSV" produces) before giving up. See
      // inferQuestionsFromResponseExport in composables/useCsv.js.
      const inferred = inferQuestionsFromResponseExport(headers, rows);
      if (!inferred) {
        parseError.value = 'ไม่พบข้อมูลที่ใช้สร้างคำถามได้ในไฟล์นี้ (ทุกคอลัมน์ว่างหรือเป็นคอลัมน์ข้อมูลระบบเท่านั้น)';
        return;
      }
      isResponseExportFile.value = true;
      importHeaders = headers;
      importRows = rows;
      preview.value = inferred;
      warnings.value = [];
      return;
    }

    const built = [];
    const problems = [];
    rows.forEach((row, i) => {
      const text = (idx.text >= 0 ? row[idx.text] : '')?.trim();
      if (!text) { problems.push({ row: i + 2, reason: 'ไม่มีข้อความคำถาม (question_text)' }); return; }

      let type = (idx.type >= 0 ? row[idx.type] : 'short')?.trim().toLowerCase() || 'short';
      if (!TYPE_VALUES.includes(type)) {
        problems.push({ row: i + 2, reason: `ประเภทคำถามไม่รู้จัก "${type}" — ข้ามแถวนี้` });
        return;
      }

      const section = parseInt(idx.section >= 0 ? row[idx.section] : '1', 10) || 1;
      const required = idx.required >= 0 ? toBool(row[idx.required]) : false;

      let options = null;
      if (['radio', 'checkbox', 'dropdown'].includes(type)) {
        const raw = idx.options >= 0 ? row[idx.options] : '';
        options = (raw || '').split('|').map(o => o.trim()).filter(Boolean);
      } else if (type === 'scale') {
        const min = idx.scaleMin >= 0 ? parseFloat(row[idx.scaleMin]) : NaN;
        const max = idx.scaleMax >= 0 ? parseFloat(row[idx.scaleMax]) : NaN;
        options = { min: isNaN(min) ? 1 : min, max: isNaN(max) ? 5 : max };
      }

      built.push({ section, order: built.filter(q => q.section === section).length, text, type, required, options });
    });

    preview.value = built;
    warnings.value = problems;
    if (!built.length) parseError.value = 'ไม่พบคำถามที่ใช้ได้ในไฟล์นี้';
  } catch (err) {
    parseError.value = err?.message || 'ไม่สามารถอ่านไฟล์นี้ได้';
  }
}

async function doImport() {
  if (!canCreate.value) return;
  phase.value = 'importing';
  try {
    const { data } = await api.post('/surveys', {
      title: title.value.trim(),
      description: description.value.trim(),
      questions: normalizeOrder(preview.value),
    });
    result.value = { title: data.title, questionCount: preview.value.length, responseCount: null, responseImportFailed: false };

    // A responses-export file also carries actual answer rows, not just the
    // inferred question shapes above — import those into the survey we just
    // created, via the exact same endpoint ImportResponsesCsvModal.vue uses.
    // The new questions' question_text is literally the original CSV header
    // (see inferQuestionsFromResponseExport), so importCsv's exact-text
    // column matching lines up with zero extra work here.
    if (isResponseExportFile.value && importRows.length) {
      try {
        const { data: importResult } = await api.post(`/surveys/${data.id}/responses/import-csv`, {
          headers: importHeaders,
          rows: importRows,
        });
        result.value.responseCount = importResult.imported;
      } catch {
        // Survey + questions already exist at this point — don't fail the
        // whole operation, just flag it so the done screen can point the
        // user at "นำเข้าคำตอบ CSV" to retry that half manually.
        result.value.responseImportFailed = true;
      }
    }

    phase.value = 'done';
    showToast?.(`สร้าง "${data.title}" จาก CSV สำเร็จ!`);
    emit('imported');
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'สร้างแบบสอบถามจาก CSV ไม่สำเร็จ';
    phase.value = 'error';
  }
}

defineExpose({ open });
</script>

<style scoped>
.im-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:1100; display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
.im-overlay.open { opacity:1; pointer-events:all; }
.im-modal { background:white; border-radius:var(--r); width:100%; max-width:560px; max-height:88vh; display:flex; flex-direction:column; box-shadow:var(--sh3); transition:max-width .15s; }
.im-modal.im-modal-wide { max-width:640px; }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--line); }
.modal-header h2 { display:flex; align-items:center; gap:8px; font-size:15px; color:var(--navy); margin:0; }
.modal-close { background:none; border:none; font-size:16px; cursor:pointer; color:var(--text3); padding:4px 8px; }
.modal-close:hover { color:var(--text); }
.modal-body { flex:1; overflow-y:auto; padding:20px; }
.modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid var(--line); }

.im-desc { font-size:13px; color:var(--text2); margin:0 0 16px; line-height:1.6; }
.im-field { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.im-label { font-size:12px; font-weight:600; color:var(--text2); }
.im-input { border:1px solid var(--line); border-radius:var(--r2); padding:9px 12px; font-size:13px; font-family:inherit; color:var(--text); outline:none; width:100%; box-sizing:border-box; }
.im-input:focus { border-color:var(--royal); }
.im-file { font-size:12px; font-family:inherit; }
.im-template-link { background:none; border:none; color:var(--royal); font-size:12px; font-family:inherit; cursor:pointer; padding:0; margin:2px 0 12px; text-decoration:underline; }
.im-note { display:flex; align-items:flex-start; gap:6px; font-size:11px; color:var(--text3); background:var(--slate); border-radius:var(--r2); padding:8px 10px; line-height:1.6; }
.im-note code { background:rgba(0,0,0,.06); padding:1px 4px; border-radius:4px; }
.im-error-box { margin-top:12px; background:#FEF2F2; border:1px solid #FECACA; border-radius:var(--r2); padding:8px 12px; font-size:12px; color:var(--red); }

.im-preview { margin-top:14px; border:1px solid var(--line); border-radius:var(--r2); padding:10px 12px; }
.im-preview-head { font-size:12px; font-weight:700; color:var(--navy); margin-bottom:8px; }
.im-preview-warn { color:var(--red); font-weight:600; }
.im-preview-list { display:flex; flex-direction:column; gap:4px; }
.im-preview-row { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text2); }
.im-preview-idx { color:var(--text3); }
.im-preview-text { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.im-preview-type { font-size:10px; color:var(--text3); background:var(--slate); padding:2px 6px; border-radius:20px; white-space:nowrap; }
.im-preview-more { font-size:11px; color:var(--text3); margin-top:2px; }
.im-preview-warnings { margin-top:8px; font-size:11px; color:var(--red); display:flex; flex-direction:column; gap:2px; }

.im-status-box { display:flex; flex-direction:column; align-items:center; padding:36px 0; gap:10px; text-align:center; }
.im-big-icon { font-size:40px; }
.im-status-title { font-size:15px; font-weight:700; color:var(--navy); margin:0; }
.im-status-sub { font-size:12px; color:var(--text3); margin:0; max-width:340px; line-height:1.6; }
.im-error-msg { color:var(--red); }
.im-spinner-wrap { font-size:36px; color:var(--royal); }
.im-spinner { display:inline-block; animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }

.im-done-box { display:flex; flex-direction:column; align-items:center; padding:24px 0; gap:10px; text-align:center; }
.im-done-icon { width:52px; height:52px; background:var(--green); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:700; }
.im-done-title { font-size:16px; font-weight:700; color:var(--navy); margin:0; }
.im-done-survey { font-size:13px; color:var(--text2); margin:0; max-width:360px; }
.im-stats { display:flex; gap:24px; margin-top:4px; }
.im-stat { display:flex; flex-direction:column; align-items:center; gap:2px; }
.im-stat-num { font-size:24px; font-weight:800; color:var(--royal); }
.im-stat-label { font-size:11px; color:var(--text3); }

.review-q-list { display:flex; flex-direction:column; gap:10px; max-height:420px; overflow-y:auto; padding-right:2px; }
.review-q-card { border:1px solid var(--line); border-radius:var(--r2); padding:12px; }
.review-q-top { display:flex; align-items:center; gap:8px; }
.review-q-num { font-size:11px; color:var(--text3); font-weight:700; flex-shrink:0; width:16px; }
.review-q-text { flex:1; min-width:0; border:1px solid var(--line); border-radius:var(--r2); padding:7px 9px; font-size:12px; font-family:inherit; color:var(--text); outline:none; }
.review-q-text:focus { border-color:var(--royal); }
.review-q-type { border:1px solid var(--line); border-radius:var(--r2); padding:7px 8px; font-size:11px; font-family:inherit; color:var(--text2); background:white; flex-shrink:0; }
.review-q-del { background:none; border:none; cursor:pointer; font-size:13px; color:var(--text3); padding:4px 6px; flex-shrink:0; }
.review-q-del:hover { color:var(--red); }
.review-q-required { display:flex; align-items:center; gap:6px; margin-top:8px; font-size:11px; color:var(--text3); }
.review-q-opts { margin-top:10px; display:flex; flex-direction:column; gap:6px; }
.review-opt-row { display:flex; align-items:center; gap:6px; }
.review-opt-input { flex:1; border:1px solid var(--line); border-radius:var(--r2); padding:6px 8px; font-size:12px; font-family:inherit; }
.review-opt-del { background:none; border:none; cursor:pointer; font-size:12px; color:var(--text3); padding:2px 6px; }
.review-opt-del:hover { color:var(--red); }
.review-opt-add { align-self:flex-start; background:none; border:none; color:var(--royal); font-size:11px; font-family:inherit; cursor:pointer; padding:2px 0; text-decoration:underline; }
.review-q-scale { display:flex; align-items:center; gap:8px; margin-top:10px; font-size:12px; color:var(--text2); }
.review-scale-input { width:60px; padding:5px 8px; border:1px solid var(--line); border-radius:var(--r2); font-family:inherit; font-size:12px; }
.review-empty { text-align:center; padding:24px; color:var(--text3); font-size:12px; }
.review-hint { margin-top:10px; font-size:11px; color:var(--amber, #b45309); }
</style>
