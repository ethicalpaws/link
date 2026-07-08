<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Room } from '../types';

const props = defineProps<{
  rooms: Room[];
  currentRoomId: string;
  searchQuery: string;
  showCreateRoom: boolean;
  newRoomName: string;
  soundEnabled: boolean;
  messageSearchQuery: string;
  currentTheme: string;
  autoTheme: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:searchQuery', v: string): void;
  (e: 'update:showCreateRoom', v: boolean): void;
  (e: 'update:newRoomName', v: string): void;
  (e: 'switchRoom', roomId: string): void;
  (e: 'deleteRoom', roomId: string): void;
  (e: 'createRoom'): void;
  (e: 'close'): void;
  (e: 'toggleSound'): void;
  (e: 'update:messageSearchQuery', v: string): void;
  (e: 'searchMessages', query: string): void;
  (e: 'setTheme', theme: string): void;
  (e: 'toggleAutoTheme'): void;
}>();

const showMessageSearch = ref(false);

const themeOptions = [
  { value: '', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'midnight', label: '夜间护眼' },
  { value: 'smoky-blue', label: '雾霾蓝' },
  { value: 'mint', label: '薄荷绿' },
  { value: 'rose', label: '玫瑰红' },
  { value: 'amber', label: '琥珀橙' },
  { value: 'lavender', label: '薰衣草紫' },
  { value: 'glacier', label: '冰川蓝' },
  { value: 'chocolate', label: '巧克力' },
  { value: 'clean', label: '极简纯白' },
  { value: 'cyber', label: '赛博朋克' },
];

const filteredRooms = computed(() => {
  if (!props.searchQuery.trim()) return props.rooms;
  const q = props.searchQuery.toLowerCase();
  return props.rooms.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.lastMessage?.content.toLowerCase().includes(q)
  );
});

function formatRoomTime(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}小时前`;
  if (hours < 48) return '昨天';
  return `${Math.floor(hours / 24)}天前`;
}

function toggleMessageSearch() {
  showMessageSearch.value = !showMessageSearch.value;
  if (!showMessageSearch.value) {
    emit('update:messageSearchQuery', '');
  }
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    emit('searchMessages', props.messageSearchQuery);
  }
  if (e.key === 'Escape') {
    showMessageSearch.value = false;
    emit('update:messageSearchQuery', '');
  }
}
</script>

<template>
  <div class="sidebar" :class="{ open: true }">
    <div class="sidebar__header">
      <span class="sidebar__title">会话列表</span>
      <button class="sidebar__close" @click="$emit('close')">✕</button>
    </div>

    <!-- 搜索 -->
    <div class="sidebar__search">
      <input
        :value="searchQuery"
        @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="搜索会话..."
        class="sidebar__search-input"
      />
    </div>

    <!-- 功能按钮栏 -->
    <div class="sidebar__actions">
      <button
        class="sidebar__action-btn"
        :class="{ active: soundEnabled }"
        @click="$emit('toggleSound')"
        :title="soundEnabled ? '关闭提示音' : '开启提示音'"
      >
        {{ soundEnabled ? '🔔' : '🔕' }}
      </button>
      <button
        class="sidebar__action-btn"
        :class="{ active: showMessageSearch }"
        @click="toggleMessageSearch"
        title="搜索消息"
      >
        🔍
      </button>
    </div>

    <!-- 消息搜索 -->
    <div v-if="showMessageSearch" class="sidebar__message-search">
      <input
        :value="messageSearchQuery"
        @input="$emit('update:messageSearchQuery', ($event.target as HTMLInputElement).value)"
        @keydown="onSearchKeydown"
        type="text"
        placeholder="搜索消息内容... (回车搜索)"
        class="sidebar__search-input"
        autofocus
      />
      <button
        v-if="messageSearchQuery"
        class="sidebar__search-clear"
        @click="$emit('update:messageSearchQuery', '')"
        title="清除搜索"
      >
        ✕
      </button>
    </div>

    <!-- 新建房间 -->
    <div class="sidebar__new">
      <button v-if="!showCreateRoom" class="sidebar__new-btn" @click="$emit('update:showCreateRoom', true)">
        + 新建会话
      </button>
      <div v-else class="sidebar__new-form">
        <input
          :value="newRoomName"
          @input="$emit('update:newRoomName', ($event.target as HTMLInputElement).value)"
          type="text"
          placeholder="会话名称..."
          class="sidebar__new-input"
          @keydown.enter="$emit('createRoom')"
          @keydown.escape="$emit('update:showCreateRoom', false)"
          autofocus
        />
        <div class="sidebar__new-actions">
          <button class="btn-cancel" @click="$emit('update:showCreateRoom', false)">取消</button>
          <button class="btn-confirm" @click="$emit('createRoom')">创建</button>
        </div>
      </div>
    </div>

    <!-- 房间列表 -->
    <div class="sidebar__rooms">
      <div
        v-for="room in filteredRooms"
        :key="room.id"
        class="room-item"
        :class="{ active: room.id === currentRoomId }"
        @click="$emit('switchRoom', room.id)"
      >
        <div class="room-item__main">
          <div class="room-item__name">{{ room.name }}</div>
          <div v-if="room.lastMessage" class="room-item__preview">
            <span v-if="room.lastMessage.name" class="room-item__sender">
              {{ room.lastMessage.name }}:
            </span>
            {{ room.lastMessage.content }}
          </div>
        </div>
        <div class="room-item__meta">
          <span class="room-item__time">{{ formatRoomTime(room.updatedAt) }}</span>
          <button
            v-if="rooms.length > 1"
            class="room-item__delete"
            @click.stop="$emit('deleteRoom', room.id)"
            title="删除会话"
          >
            🗑
          </button>
        </div>
      </div>

      <div v-if="filteredRooms.length === 0" class="sidebar__empty">
        <template v-if="searchQuery">未找到匹配的会话</template>
        <template v-else>暂无会话</template>
      </div>
    </div>

    <!-- 主题切换 -->
    <div class="sidebar__theme">
      <div class="sidebar__theme-label">
        主题
        <button
          class="auto-theme-btn"
          :class="{ active: autoTheme }"
          @click="$emit('toggleAutoTheme')"
          :title="autoTheme ? '已开启跟随系统' : '点击开启跟随系统主题'"
        >
          {{ autoTheme ? '☑️ 自动' : '⬜ 自动' }}
        </button>
      </div>
      <div class="sidebar__theme-options" :class="{ dimmed: autoTheme }">
        <button
          v-for="theme in themeOptions"
          :key="theme.value"
          class="theme-btn"
          :class="{ active: !autoTheme && currentTheme === theme.value }"
          @click="autoTheme ? {} : $emit('setTheme', theme.value)"
          :title="autoTheme ? '关闭自动跟随后再选择' : theme.label"
          :disabled="autoTheme"
        >
          {{ theme.label }}
        </button>
      </div>
    </div>
  </div>
</template>
