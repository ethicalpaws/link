<script setup lang="ts">
import type { Shortcut } from '../types';

defineProps<{
  shortcuts: Shortcut[];
}>();

defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <div class="help-overlay" @click.self="$emit('close')">
    <div class="help-panel">
      <div class="help-panel__header">
        <span>⌨️ 快捷键 & 命令</span>
        <button class="help-panel__close" @click="$emit('close')">✕</button>
      </div>
      <div class="help-panel__list">
        <div v-for="s in shortcuts" :key="s.keys" class="help-item">
          <kbd class="help-item__key">{{ s.keys }}</kbd>
          <span class="help-item__desc">{{ s.desc }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
