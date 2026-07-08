<template>
  <div>
    <h1>🤖 战友</h1>
    <div class="mb"><button class="btn" @click="startNew">＋ 新增战友</button></div>

    <div class="card">
      <div v-if="agents.length === 0" class="empty">暂无配置</div>
      <div v-for="a in agents" :key="a.id" class="item">
        <div>
          <div class="item-name">{{ a.emoji || '🤖' }} {{ a.name || a.id }}
            <span class="tag" v-if="a.agentDir">目录</span>
            <span class="tag" v-if="a.autoReply">自动回复</span>
            <span class="tag" v-if="a.heartbeat">心跳</span>
          </div>
          <div class="item-desc">{{ (a.prompt || '').slice(0, 60) }}</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-outline" @click="edit(a.id)">编辑</button>
          <button class="btn btn-sm btn-danger" @click="del(a.id)">删除</button>
        </div>
      </div>
    </div>

    <div v-if="editingId !== null" class="card">
      <h2>{{ editingId === '__new__' ? '新增战友' : '编辑: ' + editingId }}</h2>
      <div class="row">
        <div class="col"><label>ID</label><input v-model="form.id" :readonly="editingId !== '__new__'" /></div>
        <div class="col"><label>名称</label><input v-model="form.name" /></div>
        <div class="col"><label>Emoji</label><input v-model="form.emoji" maxlength="2" /></div>
      </div>
      <div class="row">
        <div class="col">
          <label>自动回复</label>
          <select v-model="form.autoReply">
            <option :value="true">是</option>
            <option :value="false">否</option>
          </select>
        </div>
        <div class="col">
          <label>心跳记录</label>
          <select v-model="form.heartbeat">
            <option :value="true">是</option>
            <option :value="false">否</option>
          </select>
        </div>
      </div>
      <div class="mb"><label>身份描述 (prompt)</label><textarea v-model="form.prompt" rows="2"></textarea></div>

      <div style="border:1px solid #1e1e3a;border-radius:8px;padding:12px;margin-bottom:12px" v-if="editingId !== '__new__'">
        <h2 style="margin-top:0;font-size:14px">📁 战友目录文件</h2>
        <div class="mb"><label>SOUL.md</label><textarea v-model="form.soul" rows="3"></textarea></div>
        <div class="mb"><label>AGENTS.md</label><textarea v-model="form.agents" rows="3"></textarea></div>
        <div class="mb">
          <label>TOOLS.md <span style="color:#888;font-size:12px">(工具使用规范)</span></label>
          <textarea v-model="form.toolsmd" rows="4" style="min-height:60px"></textarea>
        </div>
        <div class="mb">
          <label>HEARTBEAT.md <span style="color:#888;font-size:12px">(心跳提示词，每行一个)</span></label>
          <textarea v-model="form.heartbeatMd" rows="3"></textarea>
        </div>

        <div class="mb">
          <label>🔧 允许使用的工具</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
            <label v-for="t in allTools" :key="t.name" class="perm-check">
              <input type="checkbox" :value="t.name" v-model="form.tools" />
              {{ t.name }}
            </label>
            <span v-if="allTools.length === 0" style="color:#555;font-size:12px">暂无可选工具</span>
          </div>
        </div>

        <div class="mb">
          <label>⚡ 允许使用的 Skill</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
            <label v-for="s in allSkills" :key="s" class="perm-check">
              <input type="checkbox" :value="s" v-model="form.skills" />
              {{ s }}
            </label>
            <span v-if="allSkills.length === 0" style="color:#555;font-size:12px">暂无可选 Skill</span>
          </div>
        </div>
      </div>

      <div class="flex">
        <button class="btn" @click="save">💾 保存</button>
        <button class="btn btn-outline" @click="cancelEdit">← 取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'
import { toast } from '../composables/useToast.js'

const agents = ref([])
const editingId = ref(null)
const allTools = ref([])
const allSkills = ref([])
const form = reactive({ id: '', name: '', emoji: '🤖', autoReply: false, prompt: '', soul: '', agents: '', tools: [], skills: [], toolsmd: '', heartbeat: false, heartbeatMd: '' })

// 轮询相关
let pollTimer = null
const pollInterval = 3000 // 3秒轮询一次
const lastContent = ref({ soul: '', agents: '', toolsmd: '', heartbeatMd: '' })

function startPolling(id) {
  stopPolling()
  lastContent.value = { soul: form.soul, agents: form.agents, toolsmd: form.toolsmd, heartbeatMd: form.heartbeatMd }
  pollTimer = setInterval(async () => {
    if (editingId.value !== id) { stopPolling(); return }
    try {
      const files = await api.get('/api/admin/agents/' + id + '/files')
      let changed = false
      if (files.soul !== lastContent.value.soul) { form.soul = files.soul; lastContent.value.soul = files.soul; changed = true }
      if (files.agents !== lastContent.value.agents) { form.agents = files.agents; lastContent.value.agents = files.agents; changed = true }
      if (files.toolsmd !== lastContent.value.toolsmd) { form.toolsmd = files.toolsmd; lastContent.value.toolsmd = files.toolsmd; changed = true }
      if (files.heartbeat !== lastContent.value.heartbeatMd) { form.heartbeatMd = files.heartbeat; lastContent.value.heartbeatMd = files.heartbeat; changed = true }
      if (changed) toast('检测到文件已更新，已同步', 'info')
    } catch (_) { /* 轮询失败忽略 */ }
  }, pollInterval)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function load() {
  try {
    const [d, td, sd] = await Promise.all([
      api.get('/api/admin/agents-config'),
      api.get('/api/admin/tools').catch(() => ({ tools: [] })),
      api.get('/api/admin/skills').catch(() => ({ skills: [] })),
    ])
    agents.value = d.agents || []
    allTools.value = td.tools || []
    allSkills.value = (sd.skills || []).map(s => s.name)
  } catch (e) { toast(e.message, 'error') }
}
onMounted(load)
onUnmounted(stopPolling)

async function edit(id) {
  const a = agents.value.find(x => x.id === id)
  if (!a) return
  editingId.value = id
  Object.assign(form, {
    id: a.id,
    name: a.name || '',
    emoji: a.emoji || '🤖',
    autoReply: !!a.autoReply,
    heartbeat: !!a.heartbeat,
    prompt: a.prompt || '',
    soul: '',
    agents: '',
    tools: a.tools || [],
    skills: a.skills || [],
    toolsmd: '',
    heartbeatMd: ''
  })
  // 单独拉取 .md 文件内容，不污染 agents-config.json
  try {
    const files = await api.get('/api/admin/agents/' + id + '/files')
    form.soul = files.soul || ''
    form.agents = files.agents || ''
    form.toolsmd = files.toolsmd || ''
    form.heartbeatMd = files.heartbeat || ''
  } catch (_) { /* 文件不存在时忽略 */ }
  // 开始轮询检测外部文件变化
  startPolling(id)
}
function startNew() {
  editingId.value = '__new__'
  Object.assign(form, { id: '', name: '', emoji: '🤖', autoReply: false, heartbeat: false, prompt: '', soul: '', agents: '', tools: [], skills: [], toolsmd: '', heartbeatMd: '' })
}
function cancelEdit() { editingId.value = null; stopPolling() }

async function del(id) {
  if (!confirm('确定删除战友「' + id + '」？')) return
  try {
    const list = agents.value.filter(a => a.id !== id)
    await api.put('/api/admin/agents-config', { agents: list })
    toast('已删除')
    load()
  } catch (e) { toast(e.message, 'error') }
}

async function save() {
  if (!form.id) { toast('请输入 ID', 'error'); return }
  try {
    const list = [...agents.value]
    const idx = list.findIndex(a => a.id === form.id)
    const cfg = { id: form.id, name: form.name || form.id, emoji: form.emoji || '🤖', autoReply: form.autoReply, heartbeat: form.heartbeat, prompt: form.prompt, agentDir: './agents/' + form.id }
    if (form.tools.length > 0) cfg.tools = form.tools
    if (form.skills.length > 0) cfg.skills = form.skills
    const writeFiles = { id: form.id }
    if (form.soul !== undefined) writeFiles.soul = form.soul
    if (form.agents !== undefined) writeFiles.agents = form.agents
    if (form.toolsmd !== undefined) writeFiles.toolsmd = form.toolsmd
    if (form.heartbeatMd !== undefined) writeFiles.heartbeat = form.heartbeatMd
    if (idx >= 0) list[idx] = cfg; else list.push(cfg)
    await api.put('/api/admin/agents-config', { agents: list, writeFiles })
    toast('✅ 已保存')
    stopPolling()
    editingId.value = null
    load()
  } catch (e) { toast(e.message, 'error') }
}
</script>

<style scoped>
.perm-check { display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer; background:#111; padding:4px 8px; border-radius:4px; border:1px solid #1e1e3a; }
</style>
