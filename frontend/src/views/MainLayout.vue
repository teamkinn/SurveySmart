<template>
  <div style="display:flex;flex-direction:column;min-height:100vh;">
    <!-- TOP HEADER -->
    <div class="top-header">
      <div class="top-header-brand">
        <div class="brand-icon">📋</div>
        <div class="brand-name">แบบสอบถามออนไลน์</div>
        <div class="brand-sep"></div>
        <div class="brand-sub">SurveySmart</div>
      </div>
      <div class="top-header-right">
        <div class="user-chip">
          <div class="chip-avatar">{{ initials }}</div>
          <div class="chip-name">{{ fullName }}</div>
        </div>
        <button class="top-header-btn" @click="doLogout">ออกจากระบบ</button>
      </div>
    </div>

    <!-- NAV BAR -->
    <div class="top-nav">
      <div class="top-nav-left">
        <RouterLink v-for="nav in navItems" :key="nav.to" :to="nav.to" custom v-slot="{ isActive, navigate }">
          <button class="top-nav-item" :class="{ active: isActive }" @click="navigate">
            <span>{{ nav.icon }}</span> {{ nav.label }}
          </button>
        </RouterLink>
      </div>
      <div class="top-nav-right">
        <button class="btn-new" @click="openBuilder">＋ สร้างแบบสอบถาม</button>
      </div>
    </div>

    <!-- PAGE CONTENT -->
    <div class="main-content" style="flex:1;">
      <RouterView />
    </div>

    <!-- SURVEY BUILDER MODAL -->
    <SurveyBuilder ref="builderRef" @created="onSurveyCreated" />
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSurveyStore } from '@/stores/surveys';
import SurveyBuilder from '@/components/Survey/SurveyBuilder.vue';

const router      = useRouter();
const authStore   = useAuthStore();
const surveyStore = useSurveyStore();
const showToast   = inject('showToast');

const builderRef = ref(null);

const navItems = [
  { to: '/',          icon: '🏠', label: 'หน้าหลัก' },
  { to: '/surveys',   icon: '📋', label: 'แบบสอบถามของฉัน' },
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/shared',    icon: '👁️', label: 'แชร์ให้ฉันดู' },
];

const initials = computed(() => {
  const u = authStore.user;
  if (!u) return 'U';
  return (u.first_name?.[0] || u.username?.[0] || 'U').toUpperCase();
});

const fullName = computed(() => {
  const u = authStore.user;
  if (!u) return '';
  return u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username;
});

function doLogout() {
  authStore.logout();
  showToast('ออกจากระบบแล้ว');
  router.push('/login');
}

function openBuilder() {
  builderRef.value?.open();
}

function onSurveyCreated() {
  surveyStore.fetchAll();
  showToast('สร้างแบบสอบถามเรียบร้อย 🎊');
}
</script>
