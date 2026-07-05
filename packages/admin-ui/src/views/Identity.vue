<template>
  <div>
    <h1>🪪 身份</h1>

    <div class="card">
      <h2>📄 核心初衷</h2>
      <div class="mb">
        <label style="color:#888;font-size:12px">你的核心初衷，独立保存到 data/core_identity.md</label>
        <textarea v-model="coreContent" rows="8" style="font-size:14px" placeholder="记录你使用 LINK 的核心目的和初衷，例如：&#10;&#10;我想要通过 LINK 记录自己的成长轨迹，&#10;让 AI 战友了解我的背景和需求，&#10;帮助我更好地规划学习和生活。"></textarea>
      </div>
      <div class="flex"><button class="btn" @click="saveCore">💾 保存</button></div>
    </div>

    <div class="card">
      <h2>📄 身份信息（推荐匿版）</h2>
      <div class="mb">
        <label style="color:#888;font-size:12px">写入 agents/{id}/USER.md 的内容，保存后自动同步到所有战友目录</label>
        <textarea v-model="userContent" rows="8" style="font-size:14px" placeholder="填写你希望战友看到的虚拟身份信息，例如：&#10;&#10;# USER · 关于用户&#10;我是一个热爱学习和分享的人，&#10;喜欢探索新技术，也喜欢运动和阅读。&#10;希望能和战友们一起成长进步。"></textarea>
      </div>
      <div class="flex"><button class="btn" @click="saveUserMd">💾 保存并同步</button></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api.js'
import { toast } from '../composables/useToast.js'

const coreContent = ref('')
const userContent = ref('')

onMounted(async () => {
  try {
    const [core, userMd] = await Promise.all([
      api.get('/api/admin/identity'),
      api.get('/api/admin/user-md'),
    ])
    coreContent.value = core.content || ''
    userContent.value = userMd.content || ''
  } catch (e) { toast(e.message, 'error') }
})

async function saveCore() {
  try {
    await api.put('/api/admin/identity', { content: coreContent.value })
    toast('✅ 核心初衷已保存')
  } catch (e) { toast(e.message, 'error') }
}

async function saveUserMd() {
  try {
    await api.put('/api/admin/user-md', { content: userContent.value })
    toast('✅ 身份信息已保存并同步到所有战友')
  } catch (e) { toast(e.message, 'error') }
}
</script>
