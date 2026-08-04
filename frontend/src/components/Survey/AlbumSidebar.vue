<template>
  <div class="album-side">
    <h4>หมวดหมู่</h4>
    <div class="album-list">
      <div
        class="album-row"
        :class="{ active: activeId === null }"
        @click="$emit('filter', null)"
      >
        <span class="album-dot" style="background:var(--text3);"></span>
        ทั้งหมด
        <span class="album-count">{{ totalCount }}</span>
      </div>
      <div
        class="album-row"
        :class="{ active: activeId === 'unfiled', dragover: dragOverId === 'unfiled' }"
        @click="$emit('filter', 'unfiled')"
        @dragover.prevent="dragOverId = 'unfiled'"
        @dragleave="dragOverId = null"
        @drop="onDrop($event, null)"
      >
        <span class="album-dot" style="background:var(--line);"></span>
        ไม่มีหมวดหมู่
        <span class="album-count">{{ unfiledCount }}</span>
      </div>

      <div
        v-for="a in albums"
        :key="a.id"
        class="album-row"
        :class="{ active: activeId === a.id, dragover: dragOverId === a.id }"
        @click="$emit('filter', a.id)"
        @dragover.prevent="dragOverId = a.id"
        @dragleave="dragOverId = null"
        @drop="onDrop($event, a.id)"
      >
        <span class="album-dot" :style="{ background: a.color }"></span>
        <input
          v-if="renamingId === a.id"
          :ref="el => { if (el) el.focus() }"
          v-model="renameDraft"
          class="album-rename-input"
          maxlength="100"
          @click.stop
          @keyup.enter="confirmRename(a)"
          @keyup.esc="renamingId = null"
          @blur="confirmRename(a)"
        />
        <span v-else class="album-name">{{ a.name }}</span>
        <span class="album-count">{{ a.survey_count || 0 }}</span>
        <button v-if="renamingId !== a.id" class="album-edit" title="เปลี่ยนชื่ออัลบัม" aria-label="เปลี่ยนชื่ออัลบัม" @click.stop="startRename(a)">✎</button>
        <button v-if="renamingId !== a.id" class="album-del" title="ลบอัลบัม" aria-label="ลบอัลบัม" @click.stop="confirmDelete(a)">✕</button>
      </div>
    </div>

    <div class="album-new">
      <input
        v-model="newName"
        placeholder="ชื่ออัลบัมใหม่..."
        maxlength="100"
        @keyup.enter="create"
      />
      <div class="album-swatches">
        <span
          v-for="c in colors"
          :key="c"
          class="album-swatch"
          :class="{ sel: c === newColor }"
          :style="{ background: c }"
          @click="newColor = c"
        ></span>
      </div>
      <button class="btn-sm btn-blue" style="width:100%;" :disabled="creating" @click="create">+ สร้างอัลบัม</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  albums: { type: Array, default: () => [] },
  activeId: { type: [Number, String, null], default: null },
  totalCount: { type: Number, default: 0 },
  unfiledCount: { type: Number, default: 0 },
  // Owned by the parent and tied to the real await surveyStore.createAlbum(...)
  // call, not a local flag — a local flag reset as soon as the fire-and-forget
  // 'create' emit returned, not when the request actually finished, so a
  // fast double-click could fire two create requests before the first one
  // completed.
  creating: { type: Boolean, default: false },
});
const emit = defineEmits(['filter', 'assign', 'create', 'delete', 'rename']);

// Fixed palette — must match backend ALLOWED_COLORS in albumController.js,
// which silently falls back to the default for any other value.
const colors = ['#1A56A0', '#C9A84C', '#166534', '#B91C1C', '#7C3AED'];

const dragOverId = ref(null);
const newName = ref('');
const newColor = ref(colors[0]);
const renamingId = ref(null);
const renameDraft = ref('');

function onDrop(e, albumId) {
  dragOverId.value = null;
  const surveyId = parseInt(e.dataTransfer.getData('text/plain'));
  if (!surveyId) return;
  emit('assign', surveyId, albumId);
}

function create() {
  const name = newName.value.trim();
  if (!name || props.creating) return;
  emit('create', { name, color: newColor.value });
  newName.value = '';
}

function startRename(album) {
  renamingId.value = album.id;
  renameDraft.value = album.name;
}

function confirmRename(album) {
  if (renamingId.value !== album.id) return;
  const name = renameDraft.value.trim();
  renamingId.value = null;
  if (!name || name === album.name) return;
  emit('rename', album.id, { name });
}

function confirmDelete(album) {
  if (!confirm(`ลบอัลบัม "${album.name}" หรือไม่? แบบสอบถามในอัลบัมนี้จะไม่ถูกลบ แค่ย้ายไป "ไม่มีหมวดหมู่"`)) return;
  emit('delete', album.id);
}
</script>

<style scoped>
.album-side {
  width: 200px;
  flex-shrink: 0;
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--r);
  box-shadow: var(--sh1);
  padding: 14px 10px;
  align-self: flex-start;
}
.album-side h4 {
  font-size: 10px;
  font-weight: 700;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: .6px;
  margin-bottom: 8px;
  padding: 0 4px;
}
.album-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text);
  margin-bottom: 3px;
  border: 1.5px dashed transparent;
  transition: background .12s, border-color .12s;
  position: relative;
}
.album-row:hover { background: var(--slate); }
.album-row.active { background: var(--slate2); font-weight: 700; }
.album-row.dragover { border-color: var(--royal); background: rgba(26,86,160,.08); }
.album-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.album-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-count { margin-left: auto; font-size: 10px; color: var(--text3); font-weight: 700; }
.album-del,
.album-edit {
  display: none;
  border: none;
  background: none;
  color: var(--text3);
  font-size: 11px;
  cursor: pointer;
  padding: 2px;
  line-height: 1;
}
.album-row:hover .album-del,
.album-row:hover .album-edit { display: inline-block; }
.album-row:hover .album-count { display: none; }
.album-del:hover { color: var(--red); }
.album-edit:hover { color: var(--royal); }
.album-rename-input {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-family: 'Sarabun', sans-serif;
  padding: 2px 4px;
  border: 1.5px solid var(--royal);
  border-radius: 4px;
  outline: none;
  background: var(--white);
}
.album-new { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--slate2); }
.album-new input {
  width: 100%;
  font-size: 11.5px;
  padding: 6px 8px;
  border: 1.5px solid var(--line);
  border-radius: 5px;
  font-family: 'Sarabun', sans-serif;
  outline: none;
  margin-bottom: 6px;
}
.album-swatches { display: flex; gap: 5px; margin-bottom: 7px; }
.album-swatch { width: 16px; height: 16px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; display: inline-block; }
.album-swatch.sel { border-color: var(--text); }
</style>
