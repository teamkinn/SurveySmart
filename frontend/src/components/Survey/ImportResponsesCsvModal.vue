<template>
  <div class="im-overlay" :class="{ open: isOpen }">
    <div class="im-modal">
      <div class="modal-header">
        <h2>📄 นำเข้าคำตอบจาก CSV</h2>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body">

        <!-- Input phase -->
        <template v-if="phase === 'input'">
          <p class="im-desc">อัปโหลดไฟล์ CSV ของคำตอบ (เช่น ข้อมูลที่เก็บด้วยกระดาษ หรือเครื่องมืออื่น) เพื่อเพิ่มเข้าแบบสอบถามนี้</p>

          <div class="im-field">
            <label class="im-label">ไฟล์ CSV *</label>
            <input ref="fileInput" type="file" accept=".csv,text/csv" class="im-file" @change="onFile" />
          </div>

          <div class="im-note">
            <span>ℹ️</span>
            <span>
              แถวแรกต้องเป็นหัวคอลัมน์ — คอลัมน์ชื่อผู้ตอบให้ขึ้นต้นด้วย <code>respondent_name</code> หรือ <code>ชื่อ</code><br>
              คอลัมน์ที่เหลือจะจับคู่กับคำถามโดยเทียบข้อความคำถามแบบตรงตัว หากไม่ตรงจะจับคู่ตามลำดับคอลัมน์ที่เหลือแทน<br>
              ตัวเลือกแบบ checkbox: คั่นด้วย <code>;</code> ในเซลล์เดียว — ไม่รองรับคำถามแบบตาราง (grid)
            </span>
          </div>

          <div class="im-note" style="margin-top:8px;">
            <span>🔁</span>
            <span>
              <b>กันข้อมูลซ้ำเวลาอัปโหลดไฟล์เดิมซ้ำ:</b> ถ้าไฟล์มีคอลัมน์ชื่อ <code>id</code>, <code>response_id</code> หรือ <code>external_id</code>
              ระบบจะจำ ID นี้ไว้ — อัปโหลดไฟล์ที่มีทั้งแถวเก่า (เคยนำเข้าแล้ว) ปนกับแถวใหม่ ระบบจะข้ามแถวเก่าให้อัตโนมัติ ไม่เพิ่มซ้ำ<br>
              ถ้าไฟล์ไม่มีคอลัมน์นี้ ทุกแถวจะถูกเพิ่มเป็นคำตอบใหม่เสมอ (ไม่มีการเช็คซ้ำ)
            </span>
          </div>

          <div v-if="parseError" class="im-error-box">{{ parseError }}</div>

          <div v-if="parsedRows" class="im-preview">
            <div class="im-preview-head">พบ {{ parsedRows }} แถวข้อมูล จาก {{ parsedHeaders }} คอลัมน์</div>
          </div>
        </template>

        <!-- Importing phase -->
        <template v-else-if="phase === 'importing'">
          <div class="im-status-box">
            <div class="im-spinner-wrap"><span class="im-spinner">⟳</span></div>
            <p class="im-status-title">กำลังนำเข้าคำตอบ...</p>
          </div>
        </template>

        <!-- Done phase -->
        <template v-else-if="phase === 'done'">
          <div class="im-done-box">
            <div class="im-done-icon">✓</div>
            <p class="im-done-title">นำเข้าสำเร็จ!</p>
            <div class="im-stats">
              <div class="im-stat">
                <div class="im-stat-num">{{ result.imported }}</div>
                <div class="im-stat-label">คำตอบที่เพิ่ม</div>
              </div>
              <div class="im-stat" v-if="result.duplicates">
                <div class="im-stat-num">{{ result.duplicates }}</div>
                <div class="im-stat-label">ข้ามเพราะซ้ำ (ID เดิม)</div>
              </div>
              <div class="im-stat" v-if="result.skipped">
                <div class="im-stat-num">{{ result.skipped }}</div>
                <div class="im-stat-label">แถวที่ข้าม</div>
              </div>
              <div class="im-stat">
                <div class="im-stat-num">{{ result.matchedColumns }}/{{ result.totalQuestions }}</div>
                <div class="im-stat-label">คำถามที่จับคู่ได้</div>
              </div>
            </div>
            <p v-if="result.matchedColumns < result.totalQuestions" class="im-status-sub" style="margin-top:8px;">
              ⚠️ มีคำถามบางข้อที่ไม่พบคอลัมน์ที่ตรงกัน — ตรวจสอบหัวคอลัมน์ในไฟล์ CSV
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
          <button class="btn-sm btn-blue" :disabled="!canSubmit" @click="doImport">นำเข้าคำตอบ →</button>
        </template>
        <template v-else-if="phase === 'error'">
          <button class="btn-sm btn-outline" @click="close">ปิด</button>
          <button class="btn-sm btn-blue" @click="phase = 'input'">ลองใหม่</button>
        </template>
        <template v-else-if="phase === 'done'">
          <button class="btn-sm btn-blue" @click="closeAndGo">เสร็จสิ้น</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue';
import api from '@/api';
import { parseCSV } from '@/composables/useCsv';

const props = defineProps({ surveyId: { type: [String, Number], required: true } });
const emit = defineEmits(['imported']);
const showToast = inject('showToast');

const isOpen = ref(false);
const phase = ref('input');
const errorMsg = ref('');
const parseError = ref('');
const parsedHeaders = ref(0);
const parsedRows = ref(0);
const result = ref({ imported: 0, duplicates: 0, skipped: 0, matchedColumns: 0, totalQuestions: 0 });

let headers = [];
let rows = [];

const canSubmit = computed(() => rows.length > 0 && !parseError.value);

function open() {
  phase.value = 'input';
  errorMsg.value = '';
  parseError.value = '';
  parsedHeaders.value = 0;
  parsedRows.value = 0;
  headers = [];
  rows = [];
  isOpen.value = true;
}

function close() { isOpen.value = false; }

function closeAndGo() {
  isOpen.value = false;
  emit('imported');
}

function onFile(e) {
  const file = e.target.files?.[0];
  parseError.value = '';
  parsedHeaders.value = 0;
  parsedRows.value = 0;
  headers = [];
  rows = [];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseCSV(String(reader.result));
      if (!parsed.headers.length || !parsed.rows.length) {
        parseError.value = 'ไม่พบข้อมูลในไฟล์ CSV';
        return;
      }
      if (parsed.rows.length > 5000) {
        parseError.value = `ไฟล์มี ${parsed.rows.length} แถว — นำเข้าได้สูงสุด 5,000 แถวต่อครั้ง`;
        return;
      }
      headers = parsed.headers;
      rows = parsed.rows;
      parsedHeaders.value = headers.length;
      parsedRows.value = rows.length;
    } catch {
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
    const { data } = await api.post(`/surveys/${props.surveyId}/responses/import-csv`, { headers, rows });
    result.value = data;
    phase.value = 'done';
    showToast?.(
      data.duplicates
        ? `นำเข้าคำตอบสำเร็จ — เพิ่ม ${data.imported} รายการ (ข้าม ${data.duplicates} รายการที่ซ้ำ)`
        : `นำเข้าคำตอบสำเร็จ — เพิ่ม ${data.imported} รายการ`
    );
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'นำเข้าคำตอบจาก CSV ไม่สำเร็จ';
    phase.value = 'error';
  }
}

defineExpose({ open });
</script>

<style scoped>
.im-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:1100; display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
.im-overlay.open { opacity:1; pointer-events:all; }
.im-modal { background:white; border-radius:var(--r); width:100%; max-width:520px; max-height:88vh; display:flex; flex-direction:column; box-shadow:var(--sh3); }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--line); }
.modal-header h2 { display:flex; align-items:center; gap:8px; font-size:15px; color:var(--navy); margin:0; }
.modal-close { background:none; border:none; font-size:16px; cursor:pointer; color:var(--text3); padding:4px 8px; }
.modal-close:hover { color:var(--text); }
.modal-body { flex:1; overflow-y:auto; padding:20px; }
.modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid var(--line); }

.im-desc { font-size:13px; color:var(--text2); margin:0 0 16px; line-height:1.6; }
.im-field { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.im-label { font-size:12px; font-weight:600; color:var(--text2); }
.im-file { font-size:12px; font-family:inherit; }
.im-note { display:flex; align-items:flex-start; gap:6px; font-size:11px; color:var(--text3); background:var(--slate); border-radius:var(--r2); padding:8px 10px; line-height:1.6; }
.im-note code { background:rgba(0,0,0,.06); padding:1px 4px; border-radius:4px; }
.im-error-box { margin-top:12px; background:#FEF2F2; border:1px solid #FECACA; border-radius:var(--r2); padding:8px 12px; font-size:12px; color:var(--red); }

.im-preview { margin-top:14px; border:1px solid var(--line); border-radius:var(--r2); padding:10px 12px; }
.im-preview-head { font-size:12px; font-weight:700; color:var(--navy); }

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
.im-stats { display:flex; gap:24px; margin-top:4px; flex-wrap:wrap; justify-content:center; }
.im-stat { display:flex; flex-direction:column; align-items:center; gap:2px; }
.im-stat-num { font-size:24px; font-weight:800; color:var(--royal); }
.im-stat-label { font-size:11px; color:var(--text3); }
</style>
