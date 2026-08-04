<template>
  <div class="im-overlay" :class="{ open: isOpen }">
    <div class="im-modal">
      <div class="modal-header">
        <h2>📄 นำเข้าจากไฟล์ CSV</h2>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body">

        <!-- Input phase -->
        <template v-if="phase === 'input'">
          <p class="im-desc">อัปโหลดไฟล์ CSV ที่กำหนดคำถามของแบบสอบถาม ระบบจะสร้างแบบสอบถามใหม่ (สถานะร่าง) จากไฟล์นี้</p>

          <div class="im-field">
            <label class="im-label">ชื่อแบบสอบถาม *</label>
            <input v-model="title" class="im-input" placeholder="เช่น แบบสำรวจความพึงพอใจ" />
          </div>
          <div class="im-field">
            <label class="im-label">คำอธิบาย (ไม่บังคับ)</label>
            <input v-model="description" class="im-input" placeholder="" />
          </div>

          <div class="im-field">
            <label class="im-label">ไฟล์ CSV *</label>
            <input ref="fileInput" type="file" accept=".csv,text/csv" class="im-file" @change="onFile" />
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

          <div v-if="parseError" class="im-error-box">{{ parseError }}</div>

          <div v-if="preview.length" class="im-preview">
            <div class="im-preview-head">
              พบ {{ preview.length }} คำถาม
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
            </div>
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
          <button class="btn-sm btn-blue" :disabled="!canSubmit" @click="doImport">สร้างแบบสอบถาม →</button>
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
import { parseCSV, downloadCSV } from '@/composables/useCsv';

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
const result = ref({ title: '', questionCount: 0 });
const fileInput = ref(null);

const TYPE_VALUES = ['short', 'para', 'radio', 'checkbox', 'dropdown', 'scale', 'star', 'date', 'time'];
const TYPE_LABELS = {
  short: 'คำตอบสั้นๆ', para: 'ย่อหน้า', radio: 'หลายตัวเลือก', checkbox: 'ช่องทำเครื่องหมาย',
  dropdown: 'เลื่อนลง', scale: 'สเกลเชิงเส้น', star: 'คะแนน (ดาว)', date: 'วันที่', time: 'เวลา',
};
function typeLabel(t) { return TYPE_LABELS[t] || t; }

const canSubmit = computed(() => title.value.trim() && preview.value.length > 0);

function open() {
  title.value = '';
  description.value = '';
  errorMsg.value = '';
  parseError.value = '';
  preview.value = [];
  warnings.value = [];
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

function onFile(e) {
  const file = e.target.files?.[0];
  preview.value = [];
  warnings.value = [];
  parseError.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const { headers, rows } = parseCSV(String(reader.result));
      if (!headers.length || !rows.length) {
        parseError.value = 'ไม่พบข้อมูลในไฟล์ CSV';
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
        parseError.value = 'ไม่พบคอลัมน์ question_text ในไฟล์ CSV';
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
      parseError.value = 'ไม่สามารถอ่านไฟล์ CSV นี้ได้';
    }
  };
  reader.onerror = () => { parseError.value = 'ไม่สามารถอ่านไฟล์นี้ได้'; };
  reader.readAsText(file, 'utf-8');
}

async function doImport() {
  if (!canSubmit.value) return;
  phase.value = 'importing';
  try {
    const { data } = await api.post('/surveys', {
      title: title.value.trim(),
      description: description.value.trim(),
      questions: preview.value,
    });
    result.value = { title: data.title, questionCount: preview.value.length };
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
.im-modal { background:white; border-radius:var(--r); width:100%; max-width:560px; max-height:88vh; display:flex; flex-direction:column; box-shadow:var(--sh3); }
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
</style>
