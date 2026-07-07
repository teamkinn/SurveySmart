<template>
  <div class="gf-overlay" :class="{ open: isOpen }">
    <div class="gf-modal">
      <div class="modal-header">
        <h2>
          <img src="https://ssl.gstatic.com/docs/forms/device_home/android_192.png" class="gf-logo" alt="">
          ส่งออกไปยัง Google Forms
        </h2>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body">

        <!-- Preview phase -->
        <template v-if="phase === 'preview'">
          <div class="gf-form-header">
            <div class="gf-form-title">{{ survey.title || '(ยังไม่มีชื่อ)' }}</div>
            <div v-if="survey.description" class="gf-form-desc">{{ survey.description }}</div>
            <div class="gf-form-meta">{{ allQuestions.length }} คำถาม · {{ sectionCount }} ตอน</div>
          </div>
          <div v-if="allQuestions.length === 0" class="gf-empty">ยังไม่มีคำถาม — กลับไปเพิ่มคำถามในขั้นตอน 2-4</div>
          <div v-for="(q, i) in allQuestions" :key="q.id" class="gf-q-row">
            <div class="gf-q-num">{{ i + 1 }}</div>
            <div class="gf-q-body">
              <div class="gf-q-text">{{ q.text || '(ไม่มีชื่อคำถาม)' }}</div>
              <div class="gf-q-type-badge">{{ typeLabel(q.type) }}</div>
              <div v-if="needsOpts(q.type) && q.opts.filter(Boolean).length" class="gf-q-opts">
                {{ q.opts.filter(Boolean).join(' · ') }}
              </div>
            </div>
          </div>
        </template>

        <!-- Authorizing phase -->
        <template v-else-if="phase === 'authorizing'">
          <div class="gf-status-box">
            <div class="gf-big-icon">🔐</div>
            <p class="gf-status-title">รอการอนุญาต Google</p>
            <p class="gf-status-sub">หน้าต่าง Google กำลังเปิดอยู่ — เข้าสู่ระบบและอนุญาตการเข้าถึง Forms</p>
          </div>
        </template>

        <!-- Creating phase -->
        <template v-else-if="phase === 'creating'">
          <div class="gf-status-box">
            <div class="gf-spinner-wrap"><span class="gf-spinner">⟳</span></div>
            <p class="gf-status-title">กำลังสร้าง Google Form...</p>
            <p class="gf-status-sub">กรุณารอสักครู่</p>
          </div>
        </template>

        <!-- Done phase -->
        <template v-else-if="phase === 'done'">
          <div class="gf-done-box">
            <div class="gf-done-icon">✓</div>
            <p class="gf-done-title">สร้าง Google Form สำเร็จ!</p>
            <a :href="formUrl" target="_blank" class="gf-form-link">เปิดแบบฟอร์ม ↗</a>
            <div class="gf-qr-section">
              <p class="gf-qr-label">สแกน QR Code เพื่อแชร์แบบฟอร์ม</p>
              <img :src="qrDataUrl" alt="QR Code" class="gf-qr-img">
              <button class="gf-qr-save-btn" @click="saveQR">⬇ บันทึก QR Code</button>
            </div>
          </div>
        </template>

        <!-- Error phase -->
        <template v-else-if="phase === 'error'">
          <div class="gf-status-box">
            <div class="gf-big-icon">⚠️</div>
            <p class="gf-status-title">เกิดข้อผิดพลาด</p>
            <p class="gf-status-sub gf-error-msg">{{ errorMsg }}</p>
          </div>
        </template>

      </div>

      <div class="modal-footer">
        <template v-if="phase === 'preview'">
          <button class="btn-sm btn-outline" @click="close">ยกเลิก</button>
          <button class="btn-sm btn-blue" :disabled="allQuestions.length === 0" @click="startAuth">
            ✓ ยืนยัน — เชื่อมต่อ Google
          </button>
        </template>
        <template v-else-if="phase === 'error'">
          <button class="btn-sm btn-outline" @click="close">ปิด</button>
          <button class="btn-sm btn-blue" @click="phase = 'preview'">ลองใหม่</button>
        </template>
        <template v-else-if="phase === 'done'">
          <button class="btn-sm btn-blue" @click="close">ปิด</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import QRCode from 'qrcode';
import api from '@/api';

const emit = defineEmits(['close']);

const isOpen = ref(false);
const phase = ref('preview');
const survey = ref({ title: '', description: '', sec1: [], sec2: [], sec3: [] });
const formUrl = ref('');
const qrDataUrl = ref('');
const errorMsg = ref('');

const Q_TYPES = [
  { value: 'short', label: 'คำตอบสั้นๆ' },
  { value: 'para', label: 'ย่อหน้า' },
  { value: 'radio', label: 'หลายตัวเลือก' },
  { value: 'checkbox', label: 'ช่องทำเครื่องหมาย' },
  { value: 'dropdown', label: 'เลื่อนลง' },
  { value: 'file', label: 'อัปโหลดไฟล์' },
  { value: 'scale', label: 'สเกลเชิงเส้น' },
  { value: 'star', label: 'คะแนน (ดาว)' },
  { value: 'date', label: 'วันที่' },
  { value: 'time', label: 'เวลา' },
];

const allQuestions = computed(() => [
  ...(survey.value.sec1 || []),
  ...(survey.value.sec2 || []),
  ...(survey.value.sec3 || []),
]);

const sectionCount = computed(() => {
  return [survey.value.sec1, survey.value.sec2, survey.value.sec3].filter(s => s?.length > 0).length;
});

function typeLabel(val) { return Q_TYPES.find(t => t.value === val)?.label ?? val; }
function needsOpts(t)   { return ['radio', 'checkbox', 'dropdown'].includes(t); }

function open(surveyData) {
  survey.value = surveyData;
  phase.value = 'preview';
  formUrl.value = '';
  qrDataUrl.value = '';
  errorMsg.value = '';
  isOpen.value = true;
}

function close() {
  isOpen.value = false;
  emit('close');
}

async function startAuth() {
  try {
    const { data } = await api.get('/google/auth-url');
    const { url, state } = data;
    phase.value = 'authorizing';

    const popup = window.open(url, 'google-auth', 'width=520,height=620,scrollbars=yes');

    const onMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'google-oauth-done') return;
      window.removeEventListener('message', onMessage);
      if (popup && !popup.closed) popup.close();
      await createForm(event.data.state);
    };

    window.addEventListener('message', onMessage);

    // Fallback: detect if popup was closed without completing auth
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', onMessage);
        if (phase.value === 'authorizing') phase.value = 'preview';
      }
    }, 500);
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'ไม่สามารถเชื่อมต่อ Google ได้';
    phase.value = 'error';
  }
}

async function createForm(state) {
  phase.value = 'creating';
  try {
    const { data } = await api.post('/google/create-form', { state, survey: survey.value });
    formUrl.value = data.formUrl;
    qrDataUrl.value = await QRCode.toDataURL(data.formUrl, { width: 240, margin: 2 });
    phase.value = 'done';
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'สร้าง Google Form ไม่สำเร็จ';
    phase.value = 'error';
  }
}

function saveQR() {
  const a = document.createElement('a');
  a.href = qrDataUrl.value;
  a.download = `${survey.value.title || 'google-form'}-qr.png`;
  a.click();
}

defineExpose({ open });
</script>

<style scoped>
.gf-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:1100; display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
.gf-overlay.open { opacity:1; pointer-events:all; }
.gf-modal { background:white; border-radius:var(--r); width:100%; max-width:580px; max-height:88vh; display:flex; flex-direction:column; box-shadow:var(--sh3); }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--line); }
.modal-header h2 { display:flex; align-items:center; gap:8px; font-size:15px; color:var(--navy); margin:0; }
.gf-logo { width:20px; height:20px; }
.modal-close { background:none; border:none; font-size:16px; cursor:pointer; color:var(--text3); padding:4px 8px; }
.modal-close:hover { color:var(--text); }
.modal-body { flex:1; overflow-y:auto; padding:16px 20px; }
.modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid var(--line); }

.gf-form-header { background:var(--slate); border-radius:var(--r); padding:12px 14px; margin-bottom:14px; }
.gf-form-title { font-size:15px; font-weight:700; color:var(--navy); }
.gf-form-desc  { font-size:12px; color:var(--text2); margin-top:4px; }
.gf-form-meta  { font-size:11px; color:var(--text3); margin-top:6px; }

.gf-q-row { display:flex; gap:10px; padding:9px 0; border-bottom:1px solid var(--line); }
.gf-q-num { width:22px; height:22px; min-width:22px; background:var(--navy); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; margin-top:2px; }
.gf-q-body { flex:1; }
.gf-q-text { font-size:13px; color:var(--text); font-weight:500; }
.gf-q-type-badge { display:inline-block; margin-top:4px; font-size:10px; color:var(--royal); background:rgba(26,86,160,.08); padding:2px 7px; border-radius:20px; }
.gf-q-opts { font-size:11px; color:var(--text3); margin-top:4px; }
.gf-empty { text-align:center; padding:32px 0; color:var(--text3); font-size:13px; }

.gf-status-box { display:flex; flex-direction:column; align-items:center; padding:36px 0; gap:10px; text-align:center; }
.gf-big-icon { font-size:40px; }
.gf-status-title { font-size:15px; font-weight:700; color:var(--navy); margin:0; }
.gf-status-sub { font-size:12px; color:var(--text3); margin:0; max-width:340px; line-height:1.6; }
.gf-error-msg { color:var(--red); }

.gf-spinner-wrap { font-size:36px; color:var(--royal); }
.gf-spinner { display:inline-block; animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }

.gf-done-box { display:flex; flex-direction:column; align-items:center; padding:20px 0; gap:10px; text-align:center; }
.gf-done-icon { width:52px; height:52px; background:var(--green); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:700; }
.gf-done-title { font-size:16px; font-weight:700; color:var(--navy); margin:0; }
.gf-form-link { font-size:12px; color:var(--royal); word-break:break-all; }
.gf-qr-section { margin-top:10px; display:flex; flex-direction:column; align-items:center; gap:8px; }
.gf-qr-label { font-size:11px; color:var(--text3); margin:0; }
.gf-qr-img { border:1px solid var(--line); border-radius:var(--r); padding:6px; }
.gf-qr-save-btn { font-size:11px; background:var(--slate); border:1px solid var(--line); border-radius:var(--r2); padding:5px 12px; cursor:pointer; color:var(--text2); }
.gf-qr-save-btn:hover { background:var(--line); }
</style>
