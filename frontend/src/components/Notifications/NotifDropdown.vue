<template>
  <div class="notif-wrap" ref="wrapRef">
    <button class="notif-btn" @click="toggle">
      🔔
      <span v-if="notifStore.unreadCount > 0" class="notif-badge">
        {{ notifStore.unreadCount > 9 ? '9+' : notifStore.unreadCount }}
      </span>
    </button>

    <div v-if="open" class="notif-dropdown">
      <div class="notif-header">
        <h3>🔔 การแจ้งเตือน</h3>
        <button class="notif-mark-all" @click="markAll">อ่านทั้งหมด</button>
      </div>
      <div class="notif-list">
        <div v-if="notifStore.items.length === 0" class="notif-empty">🎉 ไม่มีการแจ้งเตือนใหม่</div>
        <div
          v-for="n in notifStore.items.slice(0, 6)"
          :key="n.id"
          class="notif-item"
          :class="{ unread: !n.is_read }"
          @click="notifStore.markRead(n.id)"
        >
          <div class="notif-icon" :class="`type-${n.type}`">{{ typeIcon(n.type) }}</div>
          <div class="notif-body">
            <div class="notif-title">{{ n.title }}</div>
            <div class="notif-sub">{{ n.message }}</div>
            <div class="notif-time">{{ formatTime(n.created_at) }}</div>
          </div>
          <div v-if="!n.is_read" class="notif-dot"></div>
        </div>
      </div>
      <div class="notif-footer"><a @click="open = false">ดูทั้งหมด</a></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useNotifStore } from '@/stores/notifications';

const notifStore = useNotifStore();
const open       = ref(false);
const wrapRef    = ref(null);

function toggle() {
  open.value = !open.value;
  if (open.value) notifStore.fetch();
}

async function markAll() {
  await notifStore.markAllRead();
}

function typeIcon(type) {
  return type === 'new' ? '💬' : type === 'goal' ? '🎯' : '⚡';
}

function formatTime(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60)   return 'เมื่อกี้';
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400)return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
  return new Date(d).toLocaleDateString('th-TH');
}

function onOutsideClick(e) {
  if (wrapRef.value && !wrapRef.value.contains(e.target)) open.value = false;
}

onMounted(() => {
  document.addEventListener('click', onOutsideClick);
  notifStore.fetch();
});
onUnmounted(() => document.removeEventListener('click', onOutsideClick));
</script>
