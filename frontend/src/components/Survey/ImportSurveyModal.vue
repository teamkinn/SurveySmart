<template>
  <div class="im-overlay" :class="{ open: isOpen }">
    <div class="im-modal">
      <div class="modal-header">
        <h2>
          <img src="https://ssl.gstatic.com/docs/forms/device_home/android_192.png" class="gf-logo" alt="">
          นำเข้าจาก Google Forms (Apps Script)
        </h2>
        <button class="modal-close" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <div class="im-field">
          <label class="im-label">Server URL (เปลี่ยนเป็น ngrok URL เมื่อทดสอบ)</label>
          <input
            v-model="serverUrl"
            class="im-input"
            placeholder="http://localhost:3000"
          />
        </div>

        <div class="im-script-header">
          <span class="im-label">Apps Script — คัดลอกแล้ววางใน Google Form</span>
          <button class="btn-copy" @click="copyScript">{{ copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอก' }}</button>
        </div>
        <pre class="im-code">{{ generatedScript }}</pre>

        <div class="im-steps">
          <div class="im-step"><span class="step-num">1</span>เปิด Google Form → <strong>Extensions → Apps Script</strong></div>
          <div class="im-step"><span class="step-num">2</span>ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดด้านบน → บันทึก</div>
          <div class="im-step"><span class="step-num">3</span>เลือก <strong>setupSurvey</strong> → คลิก <strong>▶ Run</strong> (อนุญาตสิทธิ์เมื่อถูกถาม)</div>
          <div class="im-step"><span class="step-num">4</span>ไปที่ Triggers (ไอคอนนาฬิกา) → Add Trigger → <strong>onFormSubmit</strong> → On form submit</div>
        </div>

        <div class="im-note">
          <span>⚠️</span>
          <span>Token มีอายุ 7 วัน หากหมดอายุ ให้คัดลอกโค้ดใหม่และรัน setupSurvey อีกครั้ง</span>
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

const emit = defineEmits(['imported']);
const authStore = useAuthStore();

const isOpen   = ref(false);
const serverUrl = ref('http://localhost:3000');
const copied   = ref(false);

const generatedScript = computed(() => {
  const api = serverUrl.value.replace(/\/$/, '') + '/api';
  const token = authStore.token || 'YOUR_TOKEN_HERE';
  return `const SURVEYSMART_API = '${api}';
const SURVEYSMART_TOKEN = '${token}';

function setupSurvey() {
  var form = FormApp.getActiveForm();
  var formId = form.getId();
  var title = form.getTitle();
  var description = form.getDescription();
  var items = form.getItems();
  var questions = items.map(function(item, idx) {
    var q = { text: item.getTitle(), order: idx + 1, section: 1, type: 'short', required: false, options: null };
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

  var payload = JSON.stringify({ formId: formId, title: title, description: description, questions: questions });
  var resp = UrlFetchApp.fetch(SURVEYSMART_API + '/google/apps-script-setup', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + SURVEYSMART_TOKEN, 'ngrok-skip-browser-warning': '1' },
    payload: payload,
    muteHttpExceptions: true
  });
  Logger.log(resp.getContentText());
}

function onFormSubmit(e) {
  var form = FormApp.getActiveForm();
  var formId = form.getId();
  var response = e.response;
  var answers = [];
  response.getItemResponses().forEach(function(ir) {
    answers.push({ question: ir.getItem().getTitle(), answer: ir.getResponse() });
  });
  var payload = JSON.stringify({
    respondent_name: response.getRespondentEmail() || 'ไม่ระบุชื่อ',
    answers: answers
  });
  UrlFetchApp.fetch(SURVEYSMART_API + '/responses/public/form/' + formId, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'ngrok-skip-browser-warning': '1' },
    payload: payload,
    muteHttpExceptions: true
  });
}`;
});

function open() {
  isOpen.value = true;
  copied.value = false;
}

function close() {
  isOpen.value = false;
}

async function copyScript() {
  try {
    await navigator.clipboard.writeText(generatedScript.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    // fallback for non-secure contexts
    const ta = document.createElement('textarea');
    ta.value = generatedScript.value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}

defineExpose({ open });
</script>

<style scoped>
.im-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:1100; display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
.im-overlay.open { opacity:1; pointer-events:all; }
.im-modal { background:white; border-radius:var(--r); width:100%; max-width:620px; max-height:90vh; display:flex; flex-direction:column; box-shadow:var(--sh3); }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--line); }
.modal-header h2 { display:flex; align-items:center; gap:8px; font-size:15px; color:var(--navy); margin:0; }
.gf-logo { width:20px; height:20px; }
.modal-close { background:none; border:none; font-size:16px; cursor:pointer; color:var(--text3); padding:4px 8px; }
.modal-close:hover { color:var(--text); }
.modal-body { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:14px; }
.modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid var(--line); }

.im-field { display:flex; flex-direction:column; gap:6px; }
.im-label { font-size:12px; font-weight:600; color:var(--text2); }
.im-input { border:1px solid var(--line); border-radius:var(--r2); padding:9px 12px; font-size:13px; font-family:inherit; color:var(--text); outline:none; width:100%; box-sizing:border-box; }
.im-input:focus { border-color:var(--royal); }

.im-script-header { display:flex; align-items:center; justify-content:space-between; }
.btn-copy { background:var(--royal); color:white; border:none; border-radius:var(--r2); padding:5px 12px; font-size:12px; cursor:pointer; font-family:inherit; }
.btn-copy:hover { opacity:.85; }

.im-code { background:#1e1e2e; color:#cdd6f4; font-family:'Consolas','Courier New',monospace; font-size:11px; line-height:1.5; padding:14px; border-radius:var(--r2); overflow-x:auto; white-space:pre; margin:0; max-height:220px; overflow-y:auto; }

.im-steps { display:flex; flex-direction:column; gap:8px; }
.im-step { display:flex; align-items:flex-start; gap:10px; font-size:13px; color:var(--text2); line-height:1.5; }
.step-num { min-width:22px; height:22px; background:var(--royal); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; margin-top:1px; }

.im-note { display:flex; align-items:flex-start; gap:6px; font-size:11px; color:var(--text3); background:var(--slate); border-radius:var(--r2); padding:8px 10px; line-height:1.5; }
</style>
