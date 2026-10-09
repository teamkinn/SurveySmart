<template>
  <div class="screen-auth">
    <div class="auth-wrap">
      <!-- Left brand panel -->
      <div class="auth-left">
        <div class="auth-brand">
          <div class="auth-brand-icon">📋</div>
          <div class="auth-brand-name">แบบสอบถาม<br>ออนไลน์</div>
          <div class="auth-brand-sub">SurveySmart</div>
        </div>
        <div class="auth-features">
          <div class="auth-feature"><div class="auth-feature-dot"></div><div class="auth-feature-text">สร้างแบบสอบถาม Likert มาตรฐาน ก.พ.ร.</div></div>
          <div class="auth-feature"><div class="auth-feature-dot"></div><div class="auth-feature-text">วิเคราะห์ค่าเฉลี่ย (x̄) และ S.D. อัตโนมัติ</div></div>
          <div class="auth-feature"><div class="auth-feature-dot"></div><div class="auth-feature-text">แชร์ผ่าน QR Code และลิงก์ทันที</div></div>
          <div class="auth-feature"><div class="auth-feature-dot"></div><div class="auth-feature-text">Dashboard แสดงผลแบบ Real-time</div></div>
        </div>
      </div>

      <!-- Right form panel -->
      <div class="auth-right">
        <div class="auth-right-title">เข้าสู่ระบบ</div>
        <div class="auth-right-sub">กรุณาระบุข้อมูลเพื่อเข้าใช้งานระบบ</div>

        <div class="auth-tabs">
          <button class="auth-tab" :class="{ active: tab === 'login' }" @click="tab = 'login'">เข้าสู่ระบบ</button>
          <button class="auth-tab" :class="{ active: tab === 'register' }" @click="tab = 'register'">สมัครสมาชิก</button>
        </div>

        <!-- Login -->
        <form v-if="tab === 'login'" style="display:flex;flex-direction:column;gap:13px;" @submit.prevent="doLogin">
          <div class="field"><label>ไอดี หรือ อีเมล</label><input v-model="login.identifier" type="text" placeholder="username หรือ email" required></div>
          <div class="field"><label>รหัสผ่าน</label>
            <div class="pw-wrap">
              <input v-model="login.password" :type="show.login ? 'text' : 'password'" placeholder="••••••••" required>
              <button type="button" class="pw-toggle" tabindex="-1" :aria-label="show.login ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'" @mousedown.prevent @click="show.login = !show.login"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line v-if="show.login" x1="3" y1="3" x2="21" y2="21"/></svg></button>
            </div>
          </div>
          <button type="button" class="forgot-link" @click="tab = 'forgot'">ลืมรหัสผ่าน?</button>
          <p v-if="error" style="color:var(--red);font-size:12px;">{{ error }}</p>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}</button>
          <p class="auth-footer-link">ยังไม่มีบัญชี? <a @click="tab = 'register'">สมัครสมาชิก</a></p>
        </form>

        <!-- Register -->
        <form v-else-if="tab === 'register'" style="display:flex;flex-direction:column;gap:13px;" @submit.prevent="doRegister">
          <div class="form-row">
            <div class="field"><label>ชื่อ</label><input v-model="reg.first_name" type="text" placeholder="สมชาย"></div>
            <div class="field"><label>นามสกุล</label><input v-model="reg.last_name" type="text" placeholder="ใจดี"></div>
          </div>
          <div class="field"><label>ไอดีผู้ใช้</label><input v-model="reg.username" type="text" placeholder="somchai99" required></div>
          <div class="field"><label>อีเมล</label><input v-model="reg.email" type="email" placeholder="email@example.com" required></div>
          <div class="field"><label>รหัสผ่าน</label>
            <div class="pw-wrap">
              <input v-model="reg.password" :type="show.reg ? 'text' : 'password'" placeholder="อย่างน้อย 8 ตัว" minlength="8" required>
              <button type="button" class="pw-toggle" tabindex="-1" :aria-label="show.reg ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'" @mousedown.prevent @click="show.reg = !show.reg"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line v-if="show.reg" x1="3" y1="3" x2="21" y2="21"/></svg></button>
            </div>
          </div>
          <div class="field"><label>ยืนยันรหัสผ่าน</label>
            <div class="pw-wrap">
              <input v-model="reg.confirm_password" :type="show.regConfirm ? 'text' : 'password'" placeholder="กรอกรหัสผ่านอีกครั้ง" required>
              <button type="button" class="pw-toggle" tabindex="-1" :aria-label="show.regConfirm ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'" @mousedown.prevent @click="show.regConfirm = !show.regConfirm"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line v-if="show.regConfirm" x1="3" y1="3" x2="21" y2="21"/></svg></button>
            </div>
          </div>
          <p v-if="error" style="color:var(--red);font-size:12px;">{{ error }}</p>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชี' }}</button>
          <p class="auth-footer-link">มีบัญชีแล้ว? <a @click="tab = 'login'">เข้าสู่ระบบ</a></p>
        </form>

        <!-- Forgot: step 1 — request an OTP code by email -->
        <form v-else-if="tab === 'forgot' && forgotStep === 'email'" style="display:flex;flex-direction:column;gap:13px;" @submit.prevent="doForgot">
          <button type="button" class="back-link" @click="backToLogin">← กลับ</button>
          <p style="font-size:13px;color:var(--text3);">กรอกอีเมลเพื่อรับรหัสยืนยันสำหรับรีเซตรหัสผ่าน</p>
          <div class="field"><label>อีเมล</label><input v-model="forgotEmail" type="email" placeholder="email@example.com" required></div>
          <p v-if="error"    style="color:var(--red);font-size:12px;">{{ error }}</p>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? 'กำลังส่ง...' : 'ส่งรหัสยืนยัน' }}</button>
        </form>

        <!-- Forgot: step 2 — enter and verify the OTP code (no password fields yet) -->
        <form v-else-if="tab === 'forgot' && forgotStep === 'code'" style="display:flex;flex-direction:column;gap:13px;" @submit.prevent="doVerifyCode">
          <button type="button" class="back-link" @click="forgotStep = 'email'">← กลับ</button>
          <p style="font-size:13px;color:var(--text3);">
            ระบบได้ส่งรหัสยืนยัน 6 หลักไปที่ {{ forgotEmail }} แล้ว (หมดอายุใน 15 นาที) กรอกรหัสด้านล่างเพื่อยืนยัน
          </p>
          <div class="field"><label>รหัสยืนยัน</label><input v-model="otpCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="123456" required autofocus></div>
          <p v-if="error"    style="color:var(--red);font-size:12px;">{{ error }}</p>
          <p v-if="forgotMsg" style="color:#22c55e;font-size:12px;">{{ forgotMsg }}</p>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? 'กำลังตรวจสอบ...' : 'ยืนยันรหัส' }}</button>
          <button type="button" class="forgot-link" :disabled="busy" @click="doForgot">ไม่ได้รับรหัส? ส่งอีกครั้ง</button>
        </form>

        <!-- Forgot: step 3 — code verified, now set the new password -->
        <form v-else style="display:flex;flex-direction:column;gap:13px;" @submit.prevent="doResetWithCode">
          <button type="button" class="back-link" @click="forgotStep = 'code'">← กลับ</button>
          <p style="font-size:13px;color:var(--text3);">รหัสยืนยันถูกต้อง ตั้งรหัสผ่านใหม่ของคุณด้านล่าง</p>
          <div class="field"><label>รหัสผ่านใหม่</label>
            <div class="pw-wrap">
              <input v-model="otpPassword" :type="show.newPw ? 'text' : 'password'" placeholder="อย่างน้อย 8 ตัว" minlength="8" required autofocus>
              <button type="button" class="pw-toggle" tabindex="-1" :aria-label="show.newPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'" @mousedown.prevent @click="show.newPw = !show.newPw"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line v-if="show.newPw" x1="3" y1="3" x2="21" y2="21"/></svg></button>
            </div>
          </div>
          <div class="field"><label>ยืนยันรหัสผ่านใหม่</label>
            <div class="pw-wrap">
              <input v-model="otpConfirm" :type="show.newConfirm ? 'text' : 'password'" placeholder="กรอกรหัสผ่านอีกครั้ง" required>
              <button type="button" class="pw-toggle" tabindex="-1" :aria-label="show.newConfirm ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'" @mousedown.prevent @click="show.newConfirm = !show.newConfirm"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line v-if="show.newConfirm" x1="3" y1="3" x2="21" y2="21"/></svg></button>
            </div>
          </div>
          <p v-if="error"    style="color:var(--red);font-size:12px;">{{ error }}</p>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน' }}</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import api from '@/api';

const router = useRouter();
const authStore = useAuthStore();
const showToast = inject('showToast');

const tab = ref('login');
const busy = ref(false);
const error = ref('');
const forgotEmail = ref('');
const forgotMsg = ref('');
const forgotStep = ref('email'); // 'email' → request OTP, 'code' → verify OTP, 'password' → set new password
const otpCode = ref('');
const otpPassword = ref('');
const otpConfirm = ref('');

// สถานะเปิด/ปิดการแสดงรหัสผ่านของแต่ละช่อง (แยกกัน กดช่องหนึ่งอีกช่องไม่เปลี่ยนตาม)
const show = ref({ login: false, reg: false, regConfirm: false, newPw: false, newConfirm: false });

const login = ref({ identifier: '', password: '' });
const reg = ref({ first_name: '', last_name: '', username: '', email: '', password: '', confirm_password: '' });

async function doLogin() {
  error.value = '';
  busy.value = true;
  try {
    await authStore.login(login.value.identifier, login.value.password);
    showToast('ยินดีต้อนรับ! 👋');
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.message || 'เกิดข้อผิดพลาด';
  } finally {
    busy.value = false;
  }
}

async function doForgot() {
  error.value = ''; forgotMsg.value = ''; otpCode.value = '';
  busy.value = true;
  try {
    const { data } = await api.post('/auth/forgot-password', { email: forgotEmail.value });
    forgotStep.value = 'code';
    forgotMsg.value = data.message;
  } catch (e) {
    error.value = e.response?.data?.message || 'เกิดข้อผิดพลาด';
  } finally {
    busy.value = false;
  }
}

// Step 2 → 3: check the OTP is valid before showing the new-password
// fields at all. The code isn't consumed here — /reset-password checks and
// consumes it for real once the user submits a new password.
async function doVerifyCode() {
  error.value = ''; forgotMsg.value = '';
  busy.value = true;
  try {
    await api.post('/auth/verify-reset-code', { email: forgotEmail.value, code: otpCode.value });
    forgotStep.value = 'password';
  } catch (e) {
    error.value = e.response?.data?.message || 'เกิดข้อผิดพลาด';
  } finally {
    busy.value = false;
  }
}

async function doResetWithCode() {
  error.value = ''; forgotMsg.value = '';
  if (otpPassword.value !== otpConfirm.value) { error.value = 'รหัสผ่านไม่ตรงกัน'; return; }
  busy.value = true;
  try {
    await api.post('/auth/reset-password', {
      email: forgotEmail.value,
      code: otpCode.value,
      password: otpPassword.value,
    });
    showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ 🔒');
    backToLogin();
  } catch (e) {
    error.value = e.response?.data?.message || 'เกิดข้อผิดพลาด';
  } finally {
    busy.value = false;
  }
}

function backToLogin() {
  tab.value = 'login';
  forgotStep.value = 'email';
  forgotEmail.value = '';
  otpCode.value = '';
  otpPassword.value = '';
  otpConfirm.value = '';
  error.value = '';
  forgotMsg.value = '';
}

async function doRegister() {
  error.value = '';
  if (reg.value.password !== reg.value.confirm_password) {
    error.value = 'รหัสผ่านไม่ตรงกัน กรุณากรอกใหม่';
    return;
  }
  busy.value = true;
  try {
    await authStore.register(reg.value);
    showToast('สร้างบัญชีเรียบร้อย ยินดีต้อนรับ! 🎉');
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.message || 'เกิดข้อผิดพลาด';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.pw-wrap { position: relative; }
.pw-wrap input { width: 100%; padding-right: 40px; }
/* ซ่อนปุ่มตา/ปุ่มล้างค่าของ Edge ไม่ให้ซ้อนกับปุ่มของเรา */
.pw-wrap input::-ms-reveal,
.pw-wrap input::-ms-clear { display: none; }
.pw-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  padding: 4px;
  background: none;
  border: 0;
  cursor: pointer;
  color: #8a94a6;
}
.pw-toggle:hover { color: #0f2a55; }
</style>