<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import type { Message } from '../types';

const props = defineProps<{
  messages: Message[];
  streamingAgents: Set<string>;
  hoveredMsgId: string | null;
  highlightedMsgId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'reply', msg: Message): void;
  (e: 'copy', msg: Message): void;
  (e: 'recall', msg: Message): void;
  (e: 'hover', msgId: string | null): void;
}>();

// 按日期分组的消息
const groupedMessages = computed(() => {
  const groups: { date: string; dateNum: number; messages: Message[] }[] = [];
  let currentGroup: { date: string; dateNum: number; messages: Message[] } | null = null;

  for (const msg of props.messages) {
    const msgDate = new Date(msg.timestamp);
    const dateStr = msgDate.toDateString();
    const dateNum = msgDate.setHours(0, 0, 0, 0);

    if (!currentGroup || currentGroup.date !== dateStr) {
      currentGroup = { date: dateStr, dateNum, messages: [] };
      groups.push(currentGroup);
    }
    currentGroup.messages.push(msg);
  }

  return groups;
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatFullTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

function formatDate(dateNum: number): string {
  const d = new Date(dateNum);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return '今天';
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '');
}

function parseMarkdown(text: string): string {
  try {
    return marked.parse(text) as string;
  } catch {
    return text;
  }
}
</script>

<template>
  <div class="message-list">
    <div v-if="messages.length === 0" class="empty-state">
      <div class="empty-state__icon">💬</div>
      <div class="empty-state__text">开始对话吧</div>
      <div class="empty-state__hint">按 Ctrl+K 打开会话列表</div>
    </div>

    <template v-for="group in groupedMessages" :key="group.date">
      <div class="date-divider">{{ formatDate(group.dateNum) }}</div>

      <div
        v-for="msg in group.messages"
        :key="msg.id"
        class="message"
        :class="[
          msg.role,
          {
            streaming: msg.status === 'sending' && streamingAgents.has(msg.agentId || ''),
            highlighted: highlightedMsgId === msg.id
          }
        ]"
        :data-msg-id="msg.id"
        @contextmenu.prevent="$emit('reply', msg)"
        @mouseenter="$emit('hover', msg.id)"
        @mouseleave="$emit('hover', null)"
      >
        <div class="message__avatar">
          <template v-if="msg.role === 'user'">👤</template>
          <template v-else>{{ msg.agentEmoji || '🤖' }}</template>
        </div>

        <div class="message__bubble-wrap">
          <div v-if="msg.role === 'agent'" class="message__name">
            {{ msg.agentName || '助手' }}
          </div>

          <!-- 回复引用 -->
          <div v-if="msg.replyTo" class="message__reply">
            <span class="message__reply-author">{{ msg.replyTo.agentName || msg.replyTo.role === 'user' ? '我' : '助手' }}：</span>
            <span class="message__reply-text">{{ msg.replyTo.content.slice(0, 50) }}{{ msg.replyTo.content.length > 50 ? '...' : '' }}</span>
          </div>

          <div class="message__bubble" v-html="parseMarkdown(stripThinking(msg.content))"></div>

          <div class="message__meta">
            <span
              v-if="msg.status === 'sending'"
              class="message__status sending"
            >发送中...</span>
            <span
              v-else-if="msg.status === 'error'"
              class="message__status error"
            >! </span>
            <span
              class="message__time"
              :title="formatFullTime(msg.timestamp)"
            >{{ formatTime(msg.timestamp) }}</span>
          </div>

          <!-- 悬停操作按钮 -->
          <div v-if="hoveredMsgId === msg.id && msg.status !== 'sending'" class="msg-actions">
            <button class="msg-action-btn" @click.stop="$emit('reply', msg)" title="回复">🔁</button>
            <button class="msg-action-btn" @click.stop="$emit('copy', msg)" title="复制">📋</button>
            <button
              v-if="msg.role === 'user'"
              class="msg-action-btn danger"
              @click.stop="$emit('recall', msg)"
              title="撤回"
            >🗑</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
