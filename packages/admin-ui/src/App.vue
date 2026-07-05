<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">🔗 LINK</div>
      <router-link v-for="item in nav" :key="item.path" :to="item.path" class="nav-link">
        <span v-html="item.icon"></span>
        <span>{{ item.label }}</span>
      </router-link>
      <div style="flex:1"></div>
      <a href="/" class="nav-link" style="border-top:1px solid #1e1e3a;border-left:3px solid transparent;">
        <span>💬</span><span>聊天界面</span>
      </a>
    </aside>
    <main class="main">
      <router-view />
    </main>
    <div class="toast-container">
      <div v-for="t in toasts" :key="t.id" :class="['toast', t.type]">{{ t.msg }}</div>
    </div>
  </div>
</template>

<script setup>
import { useToast } from './composables/useToast.js'

const { toasts } = useToast()

const nav = [
  { path: '/dashboard', icon: '📊', label: '总览' },
  { path: '/agents', icon: '🤖', label: '战友' },
  { path: '/tools', icon: '🔧', label: '工具' },
  { path: '/llm', icon: '🧠', label: '模型' },
  { path: '/memory', icon: '📅', label: '成长轨迹' },
  { path: '/plans', icon: '📋', label: '计划' },
  { path: '/skills', icon: '⚡', label: 'Skill' },
  { path: '/scheduler', icon: '⏰', label: '定时' },
  { path: '/mcp', icon: '🤝', label: 'MCP' },
  { path: '/knowledge', icon: '📚', label: '知识库' },
  { path: '/identity', icon: '🪪', label: '身份' },
]
</script>
