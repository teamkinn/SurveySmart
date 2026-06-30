<template>
  <div class="im-overlay" :class="{ open: isOpen }">
    <div class="im-modal">
      <div class="modal-header">
        <h2>
          <img src="https://ssl.gstatic.com/docs/forms/device_home/android_192.png" class="gf-logo" alt="">
          นำเข้าจาก Google Forms
        </h2>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body">

        <!-- Phase 1: enter Google Form URL -->
        <template v-if="phase === 'input'">
          <p class="im-desc">วางลิงก์ Google Forms ของคุณ ระบบจะสร้างโค้ดให้นำไปติดตั้งใน Google Forms เพื่อนำเข้าคำถามและรับข้อมูลแบบ real-time</p>
          <div class="im-field">
            <label class="im-label">Google Forms URL</label>
            <input v-model="formUrl" class="im-input" placeholder="https://docs.google.com/forms/d/..." @keyup.enter="goToScript" />
          </div>
          <div class="im-note">
            <span>ℹ️</span>
            <span>ข้อมูลจะส่งผ่าน Supabase Cloud — ไม่ต้องใช้ ngrok หรือเปิดเซิร์ฟเวอร์ตลอดเวลา</span>
          </div>
        </template>

        <!-- Phase 2: generated script -->
        <template v-else-if="phase === 'script'">
          <p class="im-desc">คัดลอกโค้ดด้านล่าง แล้วนำไปวางใน <strong>Extensions → Apps Script</strong> ของ Google Forms</p>
          <pre class="im-code">{{ generatedScript }}</pre>
          <div class="im-note">
            <span>⚠️</span>
            <span>Token มีอายุ 7 วัน หากหมดอายุ ให้กลับมาคัดลอกโค้ดใหม่และรัน setupSurvey อีกครั้ง</span>
          </div>
        </template>

        <!-- Phase 3: instructions -->
        <template v-else-if="phase === 'instructions'">
          <div class="im-steps-box">
            <p class="im-desc" style="margin-bottom:16px;">ทำตามขั้นตอนด้านล่าง จากนั้นกด <strong>ซิงค์ข้อมูล</strong></p>
            <div class="im-step"><span class="step-num">1</span><span>เปิด Google Form → <strong>Extensions → Apps Script</strong></span></div>
            <div class="im-step"><span class="step-num">2</span><span>ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดที่คัดลอก → บันทึก</span></div>
            <div class="im-step"><span class="step-num">3</span><span>เลือก <strong>setupSurvey</strong> → คลิก <strong>▶ Run</strong> → อนุญาตสิทธิ์เมื่อถูกถาม</span></div>
            <div class="im-step"><span class="step-num">4</span><span>ไปที่ Triggers (ไอคอนนาฬิกา) → Add Trigger → <strong>onFormSubmit</strong> → On form submit</span></div>
          </div>
          <div class="im-note" style="margin-top:16px;">
            <span>☁️</span>
            <span>หลังรัน setupSurvey แล้ว กด <strong>ซิงค์ข้อมูล</strong> ด้านล่างเพื่อนำเข้าฟอร์มมายังเว็บ</span>
          </div>
        </template>

        <!-- Phase 4: syncing -->
        <template v-else-if="phase === 'syncing'">
          <div class="im-status-box">
            <div class="im-spinner-wrap"><span class="im-spinner">⟳</span></div>
            <p class="im-status-title">กำลังซิงค์จาก Supabase...</p>
            <p class="im-status-sub">กำลังนำเข้าคำถามจาก Google Forms มายังเว็บ</p>
          </div>
        </template>

        <!-- Phase 5: done -->
        <template v-else-if="phase === 'done'">
          <div class="im-done-box">
            <div class="im-done-icon">✓</div>
            <p class="im-done-title">นำเข้าสำเร็จ!</p>
            <p class="im-done-survey">{{ syncResult.title }}</p>
            <div class="im-stats">
              <div class="im-stat">
                <div class="im-stat-num">{{ syncResult.setupsDone }}</div>
                <div class="im-stat-label">ฟอร์ม</div>
              </div>
              <div class="im-stat">
                <div class="im-stat-num">{{ syncResult.responsesDone }}</div>
                <div class="im-stat-label">การตอบสนอง</div>
              </div>
            </div>
          </div>
        </template>

        <!-- Phase: error -->
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
          <button class="btn-sm btn-blue" :disabled="!formUrl.trim()" @click="goToScript">ถัดไป →</button>
        </template>

        <template v-else-if="phase === 'script'">
          <button class="btn-sm btn-outline" @click="phase = 'input'">← กลับ</button>
          <button class="btn-sm btn-blue" @click="copyAndNext">{{ copied ? '✓ คัดลอกแล้ว!' : '📋 คัดลอกโค้ด →' }}</button>
        </template>

        <template v-else-if="phase === 'instructions'">
          <button class="btn-sm btn-outline" @click="phase = 'script'">← ดูโค้ด</button>
          <button class="btn-sm btn-blue" @click="doSync">🔄 ซิงค์ข้อมูล</button>
        </template>

        <template v-else-if="phase === 'error'">
          <button class="btn-sm btn-outline" @click="close">ปิด</button>
          <button class="btn-sm btn-blue" @click="phase = 'instructions'">ลองใหม่</button>
        </template>

        <template v-else-if="phase === 'done'">
          <button class="btn-sm btn-blue" @click="closeAndGo">ดูแบบสอบถาม →</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import api from '@/api';

const emit = defineEmits(['imported']);
const router = useRouter();
const authStore = useAuthStore();

const SUPABASE_URL = 'https://ietmcpcpqwuazwdzudyi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldG1jcGNwcXd1YXp3ZHp1ZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3ODk1NzEsImV4cCI6MjA5ODM2NTU3MX0.PPV2rQ6gNfDrKY1oJGXV1bxtWzDIg5Hjdqku1ySSo2E';

const isOpen     = ref(false);
const phase      = ref('input');
const formUrl    = ref('');
const copied     = ref(false);
const errorMsg   = ref('');
const syncResult = ref({ title: '', setupsDone: 0, responsesDone: 0 });

const generatedScript = computed(() => {
  const token = authStore.token || 'YOUR_TOKEN_HERE';
  return `const SUPABASE_URL = '${SUPABASE_URL}';
const SUPABASE_KEY = '${SUPABASE_ANON_KEY}';
const SURVEYSMART_TOKEN = '${token}';

function setupSurvey() {
  var form = FormApp.getActiveForm();
  var items = form.getItems();
  var questions = items.map(function(item, idx) {
    var q = { text: item.getTitle(), order: idx+1, section: 1, type: 'short', required: false, options: null };
    var type = item.getType();
    if (type === FormApp.ItemType.PARAGRAPH_TEXT) q.type = 'para';
    else if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
      q.type = 'radio';
      q.options = item.asMultipleChoiceItem().getChoices().map(function(c){ return c.getValue(); });
    } else if (type === FormApp.ItemType.CHECKBOX) {
      q.type = 'checkbox';
      q.options = item.asCheckboxItem().getChoices().map(function(c){ return c.getValue(); });
    } else if (type === FormApp.ItemType.LIST) {
      q.type = 'dropdown';
      q.options = item.asListItem().getChoices().map(function(c){ return c.getValue(); });
    } else if (type === FormApp.ItemType.SCALE) {
      q.type = 'scale';
      var s = item.asScaleItem();
      q.options = { min: s.getLowerBound(), max: s.getUpperBound(), min_label: s.getLeftLabel(), max_label: s.getRightLabel() };
    } else if (type === FormApp.ItemType.DATE) q.type = 'date';
    else if (type === FormApp.ItemType.TIME) q.type = 'time';
    try { q.required = item.isRequired(); } catch(e) {}
    return q;
  });

  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/ss_setups', {
    method: 'post',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    payload: JSON.stringify({ form_id: form.getId(), title: form.getTitle(), description: form.getDescription(), questions: JSON.stringify(questions), token: SURVEYSMART_TOKEN, processed: false }),
    muteHttpExceptions: true
  });
  Logger.log('Setup: ' + resp.getResponseCode() + ' ' + resp.getContentText());
}

function onFormSubmit(e) {
  var form = FormApp.getActiveForm();
  var answers = [];
  e.response.getItemResponses().forEach(function(ir) {
    answers.push({ question: ir.getItem().getTitle(), answer: ir.getResponse() });
  });
  UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/ss_responses', {
    method: 'post',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    payload: JSON.stringify({ form_id: form.getId(), respondent_name: e.response.getRespondentEmail() || 'ไม่ระบุ', answers: JSON.stringify(answers), processed: false }),
    muteHttpExceptions: true
  });
}`;
});

function open() {
  phase.value    = 'input';
  formUrl.value  = '';
  copied.value   = false;
  errorMsg.value = '';
  isOpen.value   = true;
}

function close() { isOpen.value = false; }

function closeAndGo() {
  isOpen.value = false;
  emit('imported');
  router.push('/surveys');
}

function goToScript() {
  if (!formUrl.value.trim()) return;
  phase.value = 'script';
}

async function copyAndNext() {
  try { await navigator.clipboard.writeText(generatedScript.value); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = generatedScript.value;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
  copied.value = true;
  setTimeout(() => { copied.value = false; phase.value = 'instructions'; }, 800);
}

async function doSync() {
  phase.value = 'syncing';
  try {
    const { data } = await api.post('/google/supabase-sync');
    syncResult.value = { title: 'ซิงค์สำเร็จ', setupsDone: data.setupsDone, responsesDone: data.responsesDone };
    if (data.setupsDone === 0) {
      errorMsg.value = 'ไม่พบข้อมูลใหม่ใน Supabase — กรุณารัน setupSurvey ใน Apps Script ก่อน';
      phase.value = 'error';
    } else {
      phase.value = 'done';
      emit('imported');
    }
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'ซิงค์ไม่สำเร็จ';
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
.gf-logo { width:20px; height:20px; }
.modal-close { background:none; border:none; font-size:16px; cursor:pointer; color:var(--text3); padding:4px 8px; }
.modal-close:hover { color:var(--text); }
.modal-body { flex:1; overflow-y:auto; padding:20px; }
.modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid var(--line); }

.im-desc { font-size:13px; color:var(--text2); margin:0 0 16px; line-height:1.6; }
.im-field { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.im-label { font-size:12px; font-weight:600; color:var(--text2); }
.im-input { border:1px solid var(--line); border-radius:var(--r2); padding:9px 12px; font-size:13px; font-family:inherit; color:var(--text); outline:none; width:100%; box-sizing:border-box; }
.im-input:focus { border-color:var(--royal); }
.im-note { display:flex; align-items:flex-start; gap:6px; font-size:11px; color:var(--text3); background:var(--slate); border-radius:var(--r2); padding:8px 10px; line-height:1.5; margin-top:12px; }

.im-code { background:#1e1e2e; color:#cdd6f4; font-family:'Consolas','Courier New',monospace; font-size:11px; line-height:1.5; padding:14px; border-radius:var(--r2); overflow-x:auto; white-space:pre; margin:0; max-height:300px; overflow-y:auto; }

.im-steps-box { display:flex; flex-direction:column; gap:14px; }
.im-step { display:flex; align-items:flex-start; gap:12px; font-size:13px; color:var(--text2); line-height:1.6; }
.step-num { min-width:24px; height:24px; background:var(--royal); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; margin-top:1px; }

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
.im-done-survey { font-size:13px; color:var(--text2); margin:0; }
.im-stats { display:flex; gap:24px; margin-top:4px; }
.im-stat { display:flex; flex-direction:column; align-items:center; gap:2px; }
.im-stat-num { font-size:24px; font-weight:800; color:var(--royal); }
.im-stat-label { font-size:11px; color:var(--text3); }
</style>
