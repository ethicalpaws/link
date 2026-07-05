<template>
  <div>
    <h1>⚡ 工作流</h1>
    <div class="card">
      <div v-if="skills.length === 0" class="empty">暂无工作流配置</div>
      <div v-for="s in skills" :key="s.name" class="item">
        <div>
          <div class="item-name">{{ s.name }}</div>
          <div class="item-desc">{{ s.description }} · {{ s.stepCount }} 步</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'

const skills = ref([])
onMounted(async () => {
  const d = await api.get('/api/admin/skills')
  skills.value = d.skills || []
})
</script>
