<template>
  <div>
    <h1>🔧 工具</h1>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="color:#888;font-size:13px">共 {{ tools.length }} 个工具</span>
        <button class="btn btn-sm btn-outline" @click="showNew = true">＋ 新建 YAML 工具</button>
      </div>
      <div v-if="tools.length === 0" class="empty">暂无工具</div>
      <div v-for="t in tools" :key="t.name" class="item">
        <div>
          <div class="item-name">{{ t.name }}
            <span class="tag" v-if="t.source === 'builtin'">内置</span>
            <span class="tag" v-else-if="t.source === 'yaml'" style="background:#2a1a1a;color:#ee8888">YAML</span>
            <span class="tag" v-else-if="t.source === 'mcp'" style="background:#1a1a3a;color:#88aaee">MCP</span>
          </div>
          <div class="item-desc">{{ (t.description || '').slice(0, 80) }}</div>
        </div>
      </div>
    </div>

    <div v-if="showNew" class="card">
      <h2>新建工具</h2>
      <div class="mb"><label>工具名称</label><input v-model="newName" /></div>
      <div class="mb"><label>YAML 配置</label><textarea v-model="newConfig" rows="16"></textarea></div>
      <div class="flex">
        <button class="btn" @click="doCreate">💾 保存</button>
        <button class="btn btn-outline" @click="showNew = false">← 返回</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'
import { toast } from '../composables/useToast.js'

const tools = ref([])
const showNew = ref(false)
const newName = ref('')
const newConfig = ref('')

onMounted(load)
async function load() {
  try {
    const d = await api.get('/api/admin/tools')
    tools.value = d.tools || []
  } catch (e) { toast(e.message, 'error') }
}

async function doCreate() {
  if (!newName.value || !newConfig.value) { toast('请填写完整', 'error'); return }
  try {
    await api.post('/api/admin/tools', { name: newName.value, config: newConfig.value })
    toast('✅ 已创建')
    showNew.value = false
    newName.value = ''
    newConfig.value = ''
    load()
  } catch (e) { toast(e.message, 'error') }
}
</script>
