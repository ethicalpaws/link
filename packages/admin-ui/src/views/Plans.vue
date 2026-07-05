<template>
  <div>
    <h1>📋 计划</h1>
    <div class="card">
      <div v-for="p in plans" :key="p.type" class="item">
        <div>
          <div class="item-name">{{ p.label }}</div>
          <div class="item-desc">{{ p.preview || '(空)' }}</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-outline" @click="edit(p.type)">编辑</button>
          <button class="btn btn-sm btn-danger" @click="del(p.type)">删除</button>
        </div>
      </div>
    </div>
    <div class="card">
      <h2>编辑器</h2>
      <div class="mb">
        <label>类型</label>
        <select v-model="curType">
          <option v-for="p in plans" :key="p.type" :value="p.type">{{ p.label }}</option>
        </select>
      </div>
      <div class="mb"><textarea v-model="curContent" rows="8" placeholder="在此编辑计划内容..."></textarea></div>
      <div class="flex"><button class="btn" @click="save">💾 保存</button></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'
import { toast } from '../composables/useToast.js'

const types = ['period', 'weekly', 'monthly', 'quarterly']
const labels = { period: '[阶段] 长期计划', weekly: '[周] 周计划', monthly: '[月] 月计划', quarterly: '[季度] 季度计划' }
const plans = ref([])
const curType = ref('period')
const curContent = ref('')

async function refresh() {
  try {
    const rs = await Promise.all(types.map(t => api.get('/api/memory/plan/' + t).catch(() => ({ exists: false, content: '' }))))
    plans.value = types.map((t, i) => {
      const c = (rs[i] && rs[i].content) || ''
      return { type: t, label: labels[t], preview: c ? c.slice(0, 50).replace(/\n/g, ' ') + (c.length > 50 ? '...' : '') : '' }
    })
    loadContent(curType.value)
  } catch (e) { toast(e.message, 'error') }
}
onMounted(refresh)

function edit(t) { curType.value = t; loadContent(t) }
async function loadContent(t) {
  const r = await api.get('/api/memory/plan/' + t).catch(() => ({}))
  curContent.value = (r && r.content) || ''
}
async function save() {
  if (!curContent.value) { toast('内容不能为空', 'error'); return }
  try {
    await api.put('/api/memory/plan/' + curType.value, { content: curContent.value })
    toast('✅ 已保存')
    refresh()
  } catch (e) { toast(e.message, 'error') }
}
async function del(t) {
  if (!confirm('确定删除？')) return
  try {
    await api.delete('/api/memory/plan/' + t)
    toast('已删除')
    refresh()
  } catch (e) { toast(e.message, 'error') }
}
</script>
