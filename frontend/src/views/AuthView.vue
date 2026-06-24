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
        <div class="auth-footer-govt">สำหรับหน่วยงานภาครัฐ · ปลอดภัย · เชื่อถือได้</div>
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
          <div class="field"><label>รหัสผ่าน</label><input v-model="login.password" type="password" placeholder="••••••••" required></div>
          <button type="button" class="forgot-link" @click="tab = 'forgot'">ลืมรหัสผ่าน?</button>
          <p v-if="error" style="color:var(--red);font-size:12px;">{{ error }}</p>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}</button>
          <p class="auth-footer-link">ยังไม่มีบัญชี? <a @click="tab = 'register'">สมัครสมาชิกฟรี</a></p>
        </form>

        <!-- Register -->
        <form v-else-if="tab === 'register'" style="display:flex;flex-direction:column;gap:13px;" @submit.prevent="doRegister">
          <div class="form-row">
            <div class="field"><label>ชื่อ</label><input v-model="reg.first_name" type="text" placeholder="สมชาย"></div>
            <div class="field"><label>นามสกุล</label><input v-model="reg.last_name" type="text" placeholder="ใจดี"></div>
          </div>
          <div class="field"><label>ไอดีผู้ใช้</label><input v-model="reg.username" type="text" placeholder="somchai99" required></div>
          <div class="field"><label>อีเมล</label><input v-model="reg.email" type="email" placeholder="email@example.com" required></div>
          <div class="field"><label>รหัสผ่าน</label><input v-model="reg.password" type="password" placeholder="อย่างน้อย 8 ตัว" minlength="8" required></div>
          <div class="field"><label>ยืนยันรหัสผ่าน</label><input v-model="reg.confirm_password" type="password" placeholder="กรอกรหัสผ่านอีกครั้ง" required></div>
          <p v-if="error" style="color:var(--red);font-size:12px;">{{ error }}</p>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชี' }}</button>
          <p class="auth-footer-link">มีบัญชีแล้ว? <a @click="tab = 'login'">เข้าสู่ระบบ</a></p>
        </form>

        <!-- Forgot -->
        <form v-else style="display:flex;flex-direction:column;gap:13px;" @submit.prevent="doForgot">
          <button type="button" class="back-link" @click="tab = 'login'">← กลับ</button>
          <p style="font-size:13px;color:var(--text3);">กรอกอีเมลเพื่อรับลิงก์รีเซตรหัสผ่าน</p>
          <div class="field"><label>อีเมล</label><input v-model="forgotEmail" type="email" placeholder="email@example.com" required></div>
          <p v-if="error"        style="color:var(--red);font-size:12px;">{{ error }}</p>
          <p v-if="forgotMsg"    style="color:#22c55e;font-size:12px;">{{ forgotMsg }}</p>
          <div v-if="forgotLink" style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px;font-size:11px;word-break:break-all;">
            <b>ลิงก์รีเซต (คัดลอกไปวางในเบราว์เซอร์):</b><br>{{ forgotLink }}
          </div>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซต' }}</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router    = useRouter();
const authStore = useAuthStore();
const showToast = inject('showToast');

const tab        = ref('login');
const busy       = ref(false);
const error      = ref('');
const forgotEmail = ref('');
const forgotMsg  = ref('');
const forgotLink = ref('');

const login = ref({ identifier: '', password: '' });
const reg   = ref({ first_name: '', last_name: '', username: '', email: '', password: '', confirm_password: '' });

async function doLogin() {
  error.value = '';
  busy.value  = true;
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
  error.value = ''; forgotMsg.value = ''; forgotLink.value = '';
  busy.value = true;
  try {
    const { data } = await import('@/api').then(m => m.default.post('/auth/forgot-password', { email: forgotEmail.value }));
    forgotMsg.value  = data.message;
    if (data.resetUrl) forgotLink.value = data.resetUrl;
  } catch (e) {
    error.value = e.response?.data?.message || 'เกิดข้อผิดพลาด';
  } finally {
    busy.value = false;
  }
}

async function doRegister() {
  error.value = '';
  if (reg.value.password !== reg.value.confirm_password) {
    error.value = 'รหัสผ่านไม่ตรงกัน กรุณากรอกใหม่';
    return;
  }
  busy.value  = true;
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
