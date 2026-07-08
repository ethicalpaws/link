<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import type { Agent, Message } from '../types';

const props = defineProps<{
  agents: Agent[];
  activeAgents: Set<string>;
  replyingTo: Message | null;
  showAtMenu: boolean;
  atMenuQuery: string;
  filteredAgentsForAt: Agent[];
  isLoading: boolean;
  inputText: string;
}>();

const emit = defineEmits<{
  (e: 'update:inputText', v: string): void;
  (e: 'send'): void;
  (e: 'insertMention', agentId: string): void;
  (e: 'cancelReply'): void;
  (e: 'toggleAgent', agentId: string): void;
  (e: 'update:showAtMenu', v: boolean): void;
  (e: 'update:atMenuQuery', v: string): void;
  (e: 'keydown', e: KeyboardEvent): void;
  (e: 'inputChange'): void;
  (e: 'blur'): void;
}>();

const inputTextarea = ref<HTMLTextAreaElement | null>(null);
const atMenuSelectedIndex = ref(0);

// 监听 filteredAgentsForAt 变化时重置选中索引
watch(() => props.filteredAgentsForAt, () => {
  atMenuSelectedIndex.value = 0;
});

function insertAtCursor(text: string) {
  if (!inputTextarea.value) return;
  const ta = inputTextarea.value;
  const start = ta.selectionStart || 0;
  const end = ta.selectionEnd || 0;
  const before = props.inputText.substring(0, start);
  const after = props.inputText.substring(end);
  const newText = before + text + after;
  emit('update:inputText', newText);
  nextTick(() => {
    ta.selectionStart = ta.selectionEnd = start + text.length;
    ta.focus();
  });
}

function autoResize() {
  if (inputTextarea.value) {
    inputTextarea.value.style.height = 'auto';
    inputTextarea.value.style.height = Math.min(inputTextarea.value.scrollHeight, 120) + 'px';
  }
}

function onInput(e: Event) {
  autoResize();
  const target = e.target as HTMLTextAreaElement;
  const currentValue = target.value;
  const pos = target.selectionStart || 0;
  const textBefore = currentValue.substring(0, pos);

  // 找到最后一个 @ 的位置
  const lastAtIndex = textBefore.lastIndexOf('@');

  if (lastAtIndex !== -1) {
    // 检查 @ 后面是否有有效内容（非空白）
    const textAfterAt = textBefore.substring(lastAtIndex + 1);
    if (textAfterAt && !textAfterAt.includes(' ')) {
      // 有有效内容，显示菜单
      emit('update:atMenuQuery', textAfterAt);
      emit('update:showAtMenu', true);
    } else {
      // @ 后面是空白或为空，关闭菜单
      emit('update:showAtMenu', false);
      emit('update:atMenuQuery', '');
    }
  } else {
    // 没有 @，关闭菜单
    emit('update:showAtMenu', false);
    emit('update:atMenuQuery', '');
  }
  emit('inputChange');
}

function onAtMenuKeydown(e: KeyboardEvent) {
  e.stopPropagation(); // 阻止事件冒泡到 textarea

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    atMenuSelectedIndex.value = Math.min(atMenuSelectedIndex.value + 1, props.filteredAgentsForAt.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    atMenuSelectedIndex.value = Math.max(atMenuSelectedIndex.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const agent = props.filteredAgentsForAt[atMenuSelectedIndex.value];
    if (agent) {
      emit('insertMention', agent.id);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    // 不 stopPropagation，让事件冒泡到 App.vue 关闭所有面板
    emit('update:showAtMenu', false);
  }
}

function onTextareaKeydown(e: KeyboardEvent) {
  // 如果 @ 菜单打开，Escape 先关闭菜单（不阻止冒泡，其他面板也会关闭）
  if (e.key === 'Escape' && props.showAtMenu) {
    emit('update:showAtMenu', false);
    return; // 不 stopPropagation，让事件继续冒泡到 App.vue
  }

  // 如果 @ 菜单打开，方向键和 Enter 由菜单处理
  // 但 Ctrl+ArrowUp/Down（历史浏览）要放行，让 App.vue 处理
  if (props.showAtMenu && ['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
    if (e.ctrlKey) {
      // Ctrl+方向键是历史浏览，不拦截，冒泡给 App.vue
      // 继续往下走到 emit('keydown', e)
    } else {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        const agent = props.filteredAgentsForAt[atMenuSelectedIndex.value];
        if (agent) {
          emit('insertMention', agent.id);
        }
      } else if (e.key === 'ArrowUp') {
        atMenuSelectedIndex.value = Math.max(atMenuSelectedIndex.value - 1, 0);
      } else if (e.key === 'ArrowDown') {
        atMenuSelectedIndex.value = Math.min(atMenuSelectedIndex.value + 1, props.filteredAgentsForAt.length - 1);
      }
      return;
    }
  }

  emit('keydown', e);
}

function selectAgent(agent: Agent) {
  emit('insertMention', agent.id);
}

defineExpose({ insertAtCursor, focus: () => inputTextarea.value?.focus() });
</script>

<template>
  <div class="input-bar">
    <!-- 回复引用栏 -->
    <div v-if="replyingTo" class="reply-bar">
      <div class="reply-bar__info">
        <span class="reply-bar__label">回复</span>
        <span class="reply-bar__author">{{ replyingTo.role === 'user' ? '我' : (replyingTo.agentName || '助手') }}：</span>
        <span class="reply-bar__text">{{ replyingTo.content.slice(0, 60) }}{{ replyingTo.content.length > 60 ? '...' : '' }}</span>
      </div>
      <button class="reply-bar__close" @click="$emit('cancelReply')" title="取消回复">✕</button>
    </div>

    <!-- 快捷@栏 -->
    <div class="quick-at">
      <div v-for="(agent, idx) in agents" :key="agent.id" class="quick-at__item">
        <button
          class="quick-at__btn"
          :class="{ active: activeAgents.has(agent.id) }"
          @click="$emit('insertMention', agent.id)"
          :title="`@${agent.name} (Ctrl+Shift+${idx + 1})`"
        >
          <span class="quick-at__emoji">{{ agent.emoji }}</span>
          <span class="quick-at__name">{{ agent.name }}</span>
          <kbd class="quick-at__key">⌥{{ idx + 1 }}</kbd>
        </button>
      </div>
    </div>

    <!-- @ 菜单 -->
    <div v-if="showAtMenu" class="at-menu">
      <div class="at-menu__list">
        <button
          v-for="(agent, idx) in filteredAgentsForAt"
          :key="agent.id"
          class="at-menu__item"
          :class="{ selected: idx === atMenuSelectedIndex }"
          @click="selectAgent(agent)"
          @mouseenter="atMenuSelectedIndex = idx"
        >
          <span class="at-menu__emoji">{{ agent.emoji }}</span>
          <span class="at-menu__name">{{ agent.name }}</span>
          <span class="at-menu__id">{{ agent.id }}</span>
        </button>
        <div v-if="filteredAgentsForAt.length === 0" class="at-menu__empty">
          未找到代理
        </div>
      </div>
    </div>

    <div class="input-wrap">
      <div class="input-box">
        <textarea
          ref="inputTextarea"
          :value="inputText"
          @input="onInput"
          placeholder="输入 @ 触发提及，或点击上方按钮..."
          rows="1"
          @keydown="onTextareaKeydown"
          @blur="$emit('blur')"
          :disabled="isLoading"
        ></textarea>
        <button
          class="send-btn"
          @click="$emit('send')"
          :disabled="!inputText.trim() || isLoading"
        >
          ▲
        </button>
      </div>
      <div class="input-hint">
        <span title="Enter 发送">Enter 发送</span>
        <span class="separator">·</span>
        <span title="@ 提及代理">@ 提及</span>
        <span class="separator">·</span>
        <span title="Alt+1-7 快捷@">Alt+1-7 快捷@</span>
        <span class="separator">·</span>
        <span title="Ctrl+↑↓ 浏览历史">Ctrl+↑↓ 历史</span>
      </div>
    </div>
  </div>
</template>
