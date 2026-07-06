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

        <!-- Input phase -->
        <template v-if="phase === 'input'">
          <p class="im-desc">วางลิงก์ Google Forms ของคุณ ระบบจะนำเข้าคำถามและข้อมูลการตอบสนองทั้งหมดมายังเว็บไซต์นี้</p>
          <div class="im-field">
            <label class="im-label">Google Forms URL หรือ Form ID</label>
            <input
              v-model="formUrl"
              class="im-input"
              placeholder="https://docs.google.com/forms/d/..."
              @keyup.enter="startAuth"
            />
          </div>
          <div class="im-note">
            <span>ℹ️</span>
            <span>ระบบจะนำเข้าเฉพาะฟอร์มที่คุณเป็นเจ้าของใน Google Account ที่เชื่อมต่อ ใช้ลิงก์จากโหมดแก้ไขฟอร์ม (.../forms/d/FORM_ID/edit) — ไม่ใช่ลิงก์สำหรับส่ง/ตอบแบบสอบถาม (.../forms/d/e/.../viewform)</span>
          </div>
        </template>

        <!-- Authorizing phase -->
        <template v-else-if="phase === 'authorizing'">
          <div class="im-status-box">
            <div class="im-big-icon">🔐</div>
            <p class="im-status-title">รอการอนุญาต Google</p>
            <p class="im-status-sub">หน้าต่าง Google กำลังเปิดอยู่ — เข้าสู่ระบบและอนุญาตการเข้าถึง Forms</p>
          </div>
        </template>

        <!-- Importing phase -->
        <template v-else-if="phase === 'importing'">
          <div class="im-status-box">
            <div class="im-spinner-wrap"><span class="im-spinner">⟳</span></div>
            <p class="im-status-title">กำลังนำเข้าข้อมูล...</p>
            <p class="im-status-sub">กำลังดึงคำถามและข้อมูลการตอบสนองจาก Google Forms</p>
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
              <div class="im-stat">
                <div class="im-stat-num">{{ result.responseCount }}</div>
                <div class="im-stat-label">การตอบสนอง</div>
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
          <button class="btn-sm btn-blue" :disabled="!formUrl.trim()" @click="startAuth">
            เชื่อมต่อ Google →
          </button>
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
import { ref, inject } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/api';

const emit = defineEmits(['imported']);
const router = useRouter();
const showToast = inject('showToast');

const isOpen = ref(false);
const phase = ref('input');
const formUrl = ref('');
const errorMsg = ref('');
const result = ref({ title: '', questionCount: 0, responseCount: 0 });

function open() {
  formUrl.value = '';
  phase.value = 'input';
  errorMsg.value = '';
  isOpen.value = true;
}

function close() { isOpen.value = false; }

function closeAndGo() {
  isOpen.value = false;
  emit('imported');
  router.push('/surveys');
}

async function startAuth() {
  if (!formUrl.value.trim()) return;

  if (/\/forms\/d\/e\//.test(formUrl.value)) {
    errorMsg.value = 'ลิงก์นี้เป็นลิงก์สำหรับตอบแบบสอบถาม (viewform) ซึ่งไม่สามารถใช้นำเข้าได้ กรุณาเปิดฟอร์มในโหมดแก้ไข แล้วคัดลอก URL จากแถบที่อยู่ (ต้องมีรูปแบบ .../forms/d/FORM_ID/edit)';
    phase.value = 'error';
    return;
  }

  try {
    const { data } = await api.get('/google/import-auth-url');
    const { url, state } = data;
    phase.value = 'authorizing';

    const popup = window.open(url, 'google-auth', 'width=520,height=620,scrollbars=yes');

    const onMessage = async (event) => {
      if (event.data?.type !== 'google-oauth-done') return;
      window.removeEventListener('message', onMessage);
      if (popup && !popup.closed) popup.close();
      await doImport(event.data.state);
    };
    window.addEventListener('message', onMessage);

    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', onMessage);
        if (phase.value === 'authorizing') phase.value = 'input';
      }
    }, 500);
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'ไม่สามารถเชื่อมต่อ Google ได้';
    phase.value = 'error';
  }
}

async function doImport(state) {
  phase.value = 'importing';
  try {
    const { data } = await api.post('/google/import-form', { state, formUrl: formUrl.value });
    result.value = data;
    phase.value = 'done';
    showToast?.(`นำเข้า "${data.title}" สำเร็จ!`);
    emit('imported');
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'นำเข้า Google Form ไม่สำเร็จ';
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
.im-note { display:flex; align-items:flex-start; gap:6px; font-size:11px; color:var(--text3); background:var(--slate); border-radius:var(--r2); padding:8px 10px; line-height:1.5; }

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
