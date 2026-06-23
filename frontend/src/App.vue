<template>
  <RouterView />
  <Teleport to="body">
    <div class="toast" :class="{ show: toast.show }">{{ toast.msg }}</div>
  </Teleport>
</template>

<script setup>
import { provide, reactive } from 'vue';

const toast = reactive({ show: false, msg: '' });
let toastTimer = null;

function showToast(msg) {
  toast.msg = msg;
  toast.show = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.show = false), 2800);
}

provide('showToast', showToast);
</script>
