<template>
  <div>
    <h1>📊 系统总览 <span style="font-size:11px;font-weight:400;color:#557;margin-left:8px">⚡ Vue</span></h1>
    <div class="grid2" v-if="s">
      <div class="stat-card">
        <div class="stat-num">{{ s.agents ?? 0 }}</div>
        <div class="stat-label">🤖 战友</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ s.tools ?? 0 }}</div>
        <div class="stat-label">🔧 工具</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ s.skills ?? 0 }}</div>
        <div class="stat-label">⚡ 工作流</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ ms.dailySummaries ?? 0 }}</div>
        <div class="stat-label">📅 日摘要</div>
      </div>
    </div>
    <div class="card">
      <h2>运行信息</h2>
      <div class="item"><span class="item-name">运行时长</span><span>{{ fmtUptime(s?.uptime) }}</span></div>
      <div class="item"><span class="item-name">日摘要</span><span>{{ ms.dailySummaries ?? 0 }} 篇</span></div>
      <div class="item"><span class="item-name">周摘要</span><span>{{ ms.weeklyDigests ?? 0 }} 篇</span></div>
      <div class="item"><span class="item-name">里程碑</span><span>{{ ms.milestones ?? 0 }} 条</span></div>
      <div class="item"><span class="item-name">归档</span><span>{{ ms.hasArchive ? '✅' : '❌' }}</span></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'

const s = ref(null)
const ms = ref({})

onMounted(async () => {
  try {
    s.value = await api.get('/api/admin/status')
    ms.value = await api.get('/api/memory/stats').catch(() => ({}))
  } catch (e) { /* handled by toast */ }
})

function fmtUptime(t) {
  if (!t) return '—'
  const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60)
  return `${d}天 ${h}小时 ${m}分钟`
}
</script>
