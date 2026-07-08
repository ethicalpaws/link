<template>
  <div>
    <h1>🧠 模型配置</h1>
    <div class="card">
      <div class="row">
        <div class="col"><label>Provider</label><select v-model="form.provider"><option v-for="p in providers" :key="p" :value="p">{{ p }}</option></select></div>
        <div class="col"><label>模型名</label><input v-model="form.model" /></div>
      </div>
      <div class="mb"><label>API Key</label><input v-model="form.apiKey" type="password" /></div>
      <div class="mb"><label>Base URL</label><input v-model="form.baseUrl" /></div>
      <div class="flex"><button class="btn" @click="save">💾 保存</button></div>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { api } from '../api.js'
import { toast } from '../composables/useToast.js'

const providers = ['openclaw', 'openai', 'minimax', 'deepseek', 'custom']
const form = reactive({ provider: 'openclaw', model: '', apiKey: '', baseUrl: '' })

onMounted(async () => {
  try {
    const d = await api.get('/api/admin/llm-config').catch(() => ({}))
    if (d.config) Object.assign(form, d.config)
  } catch (e) { toast(e.message, 'error') }
})

async function save() {
  try {
    await api.put('/api/admin/llm-config', { ...form })
    toast('✅ 已保存')
  } catch (e) { toast(e.message, 'error') }
}
</script>
