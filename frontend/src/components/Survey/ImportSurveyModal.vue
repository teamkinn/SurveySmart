<template>
  <div class="im-overlay" :class="{ open: isOpen }">
    <div class="im-modal">
      <div class="modal-header">
        <h2>
          <img src="https://ssl.gstatic.com/docs/forms/device_home/android_192.png" class="gf-logo" alt="">
          นำเข้า + ซิงค์ Google Forms แบบ Real-time
        </h2>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <div class="im-how">
          <div class="im-step" v-for="(s, i) in steps" :key="i">
            <div class="im-step-num">{{ i + 1 }}</div>
            <div class="im-step-text" v-html="s"></div>
          </div>
        </div>

        <div class="im-url-row">
          <label class="im-label">Server URL <span class="im-hint">(ต้องเป็น URL สาธารณะที่ Google เข้าถึงได้)</span></label>
          <input v-model="serverUrl" class="im-input" placeholder="http://localhost:3000" />
        </div>

        <div class="im-code-wrap">
          <div class="im-code-header">
            <span class="im-code-title">Google Apps Script</span>
            <button class="im-copy-btn" @click="copyCode">{{ copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอก' }}</button>
          </div>
          <pre class="im-code">{{ scriptCode }}</pre>
        </div>

        <div class="im-warn">
          ⚠️ Token นี้มีอายุ 7 วัน — หากหมดอายุให้เปิดหน้านี้ใหม่และคัดลอก Token ล่าสุด
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-sm btn-outline" @click="close">ปิด</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const isOpen    = ref(false);
const serverUrl = ref('http://localhost:3000');
const copied    = ref(false);

const steps = [
  'เปิด Google Forms ของคุณ → คลิก <b>Extensions → Apps Script</b>',
  'ลบโค้ดเดิมทั้งหมด แล้ว <b>วางโค้ดด้านล่าง</b> → Save (💾)',
  'คลิกเมนู dropdown เลือก <b>setupSurvey</b> แล้วกด <b>▶ Run</b> — ฟอร์มจะถูกสร้างในระบบทันที',
  'ไปที่ <b>Triggers (นาฬิกา)</b> → Add Trigger → เลือก <b>onFormSubmit</b> → Event type: <b>On form submit</b> → Save — ข้อมูลใหม่จะซิงค์อัตโนมัติ',
];

const scriptCode = computed(() => {
  const api   = (serverUrl.value || 'http://localhost:3000').replace(/\/$/, '') + '/api';
  const token = authStore.token || 'YOUR_TOKEN_HERE';
  return `// ════════════════════════════════════════════════
//  SurveySmart — Google Apps Script Sync
//  Step 1: Run setupSurvey() once to import the form
//  Step 2: Add Trigger → onFormSubmit for real-time sync
// ════════════════════════════════════════════════

var SURVEYSMART_API   = '${api}';
var SURVEYSMART_TOKEN = '${token}';

function setupSurvey() {
  var form  = FormApp.getActiveForm();
  var items = form.getItems();

  var questions = items.map(function(item, i) {
    var q = { text: item.getTitle(), type: 'short', order: i + 1, section: 1 };
    var t = item.getType();

    if      (t === FormApp.ItemType.PARAGRAPH_TEXT)  { q.type = 'para'; }
    else if (t === FormApp.ItemType.MULTIPLE_CHOICE) { q.type = 'radio';    q.options = item.asMultipleChoiceItem().getChoices().map(function(c){ return c.getValue(); }); }
    else if (t === FormApp.ItemType.CHECKBOX)        { q.type = 'checkbox';  q.options = item.asCheckboxItem().getChoices().map(function(c){ return c.getValue(); }); }
    else if (t === FormApp.ItemType.LIST)            { q.type = 'dropdown';  q.options = item.asListItem().getChoices().map(function(c){ return c.getValue(); }); }
    else if (t === FormApp.ItemType.SCALE)           { q.type = 'scale'; }
    else if (t === FormApp.ItemType.DATE)            { q.type = 'date'; }
    else if (t === FormApp.ItemType.TIME)            { q.type = 'time'; }

    return q;
  });

  var res = UrlFetchApp.fetch(SURVEYSMART_API + '/google/apps-script-setup', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + SURVEYSMART_TOKEN },
    payload: JSON.stringify({
      formId:      form.getId(),
      title:       form.getTitle(),
      description: form.getDescription() || '',
      questions:   questions
    }),
    muteHttpExceptions: true
  });

  Logger.log('SurveySmart Setup: ' + res.getContentText());
}

function onFormSubmit(e) {
  var answers = e.response.getItemResponses().map(function(r) {
    var v = r.getResponse();
    return { answer_text: Array.isArray(v) ? v.join(', ') : String(v) };
  });

  UrlFetchApp.fetch(SURVEYSMART_API + '/responses/public/form/' + FormApp.getActiveForm().getId(), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      respondent_name: e.response.getRespondentEmail() || 'Google Forms',
      answers: answers
    }),
    muteHttpExceptions: true
  });
}`;
});

function open() {
  copied.value = false;
  isOpen.value = true;
}

function close() {
  isOpen.value = false;
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(scriptCode.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2500);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = scriptCode.value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2500);
  }
}

defineExpose({ open });
</script>

<style scoped>
.im-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:1100; display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
.im-overlay.open { opacity:1; pointer-events:all; }
.im-modal { background:white; border-radius:var(--r); width:100%; max-width:640px; max-height:90vh; display:flex; flex-direction:column; box-shadow:var(--sh3); }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--line); flex-shrink:0; }
.modal-header h2 { display:flex; align-items:center; gap:8px; font-size:14px; color:var(--navy); margin:0; }
.gf-logo { width:18px; height:18px; }
.modal-close { background:none; border:none; font-size:16px; cursor:pointer; color:var(--text3); padding:4px 8px; }
.modal-body { flex:1; overflow-y:auto; padding:16px 18px; display:flex; flex-direction:column; gap:14px; }
.modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:10px 18px; border-top:1px solid var(--line); flex-shrink:0; }

.im-how { display:flex; flex-direction:column; gap:8px; }
.im-step { display:flex; gap:10px; align-items:flex-start; }
.im-step-num { min-width:22px; height:22px; background:var(--royal); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; margin-top:1px; }
.im-step-text { font-size:12.5px; color:var(--text2); line-height:1.6; }
.im-step-text b { color:var(--navy); }

.im-url-row { display:flex; flex-direction:column; gap:5px; }
.im-label { font-size:12px; font-weight:600; color:var(--text2); }
.im-hint { font-weight:400; color:var(--text3); font-size:11px; }
.im-input { border:1px solid var(--line); border-radius:var(--r2); padding:8px 11px; font-size:13px; font-family:inherit; color:var(--text); outline:none; width:100%; box-sizing:border-box; }
.im-input:focus { border-color:var(--royal); }

.im-code-wrap { border:1px solid var(--line); border-radius:var(--r); overflow:hidden; }
.im-code-header { display:flex; align-items:center; justify-content:space-between; background:var(--slate); padding:7px 12px; border-bottom:1px solid var(--line); }
.im-code-title { font-size:11px; font-weight:700; color:var(--text2); }
.im-copy-btn { font-size:11px; background:var(--royal); color:white; border:none; border-radius:var(--r2); padding:4px 10px; cursor:pointer; font-family:inherit; }
.im-copy-btn:hover { opacity:.85; }
.im-code { margin:0; padding:12px; font-size:11px; line-height:1.55; color:#1e293b; background:#f8fafc; overflow-x:auto; white-space:pre; font-family:'Courier New', monospace; max-height:280px; overflow-y:auto; }

.im-warn { font-size:11px; color:#92400e; background:#fffbeb; border:1px solid #fcd34d; border-radius:var(--r2); padding:8px 11px; line-height:1.5; }
</style>
