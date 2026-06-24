<template>
  <div class="screen-auth">
    <div class="auth-wrap" style="max-width:460px;margin:auto;">
      <div class="auth-right" style="width:100%;padding:40px 36px;">
        <div class="auth-right-title">รีเซตรหัสผ่าน</div>
        <div class="auth-right-sub">กรอกรหัสผ่านใหม่ของคุณ</div>

        <div v-if="done" style="margin-top:24px;text-align:center;">
          <div style="font-size:40px;">✅</div>
          <div style="font-size:15px;font-weight:700;color:var(--navy);margin-top:10px;">รีเซตรหัสผ่านเรียบร้อยแล้ว</div>
          <button class="btn-primary" style="margin-top:20px;" @click="$router.push('/auth')">เข้าสู่ระบบ</button>
        </div>

        <div v-else-if="!token" style="margin-top:24px;color:var(--red);font-size:13px;">
          ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ใหม่
        </div>

        <form v-else style="display:flex;flex-direction:column;gap:13px;margin-top:20px;" @submit.prevent="doReset">
          <div class="field"><label>รหัสผ่านใหม่</label><input v-model="password" type="password" placeholder="อย่างน้อย 8 ตัว" minlength="8" required></div>
          <div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input v-model="confirm" type="password" placeholder="กรอกรหัสผ่านอีกครั้ง" required></div>
          <p v-if="error" style="color:var(--red);font-size:12px;">{{ error }}</p>
          <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่' }}</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/api';

const route    = useRoute();
const router   = useRouter();
const token    = route.query.token || '';
const password = ref('');
const confirm  = ref('');
const error    = ref('');
const busy     = ref(false);
const done     = ref(false);

async function doReset() {
  error.value = '';
  if (password.value !== confirm.value) { error.value = 'รหัสผ่านไม่ตรงกัน'; return; }
  busy.value = true;
  try {
    await api.post('/auth/reset-password', { token, password: password.value });
    done.value = true;
  } catch (e) {
    error.value = e.response?.data?.message || 'เกิดข้อผิดพลาด';
  } finally {
    busy.value = false;
  }
}
</script>
