<template>
  <div>
    <h1>定时任务</h1>
    <div class="card">
      <div v-if="schedules.length === 0" class="empty">暂无定时任务</div>
      <div v-for="(s, i) in schedules" :key="i" class="item">
        <div class="item-name">{{ s.desc || '无描述' }} <span style="color:#666;font-size:12px">{{ timeLabel(s) }} @{{ agentName(s.agent) }}</span><span v-if="s.showInChat" style="color:#666;font-size:12px"> -> {{ roomName(s.roomId) }}</span></div>
        <div class="actions">
          <button class="btn btn-sm btn-outline" @click="edit(i)">编辑</button>
          <button class="btn btn-sm btn-danger" @click="del(i)">删除</button>
        </div>
      </div>
    </div>
    <div class="card">
      <h2>{{ editingIdx !== null ? '编辑定时任务' : '新增定时任务' }}</h2>
      <div class="row">
        <div class="col"><label>描述</label><input v-model="form.desc" /></div>
        <div class="col"><label>Agent</label><select v-model="form.agent"><option value="" disabled>选择战友</option><option v-for="a in agents" :key="a.id" :value="a.id">{{ a.emoji }} {{ a.name || a.id }}</option></select></div>
      </div>
      <div class="row">
        <div class="col"><label>频率</label><select v-model.number="form.dayOfWeek"><option :value="undefined">每天</option><option :value="0">周日</option><option :value="1">周一</option><option :value="2">周二</option><option :value="3">周三</option><option :value="4">周四</option><option :value="5">周五</option><option :value="6">周六</option></select></div>
        <div class="col"><label>小时</label><input v-model.number="form.hour" type="number" min="0" max="23" /></div>
        <div class="col"><label>分钟</label><input v-model.number="form.minute" type="number" min="0" max="59" /></div>
      </div>
      <div class="mb"><label>Prompt</label><textarea v-model="form.prompt" rows="2"></textarea></div>
      <div class="flex"><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" v-model="form.showInChat" />推送到群聊</label><select v-if="form.showInChat" v-model="form.roomId" style="flex:1"><option value="">选择群聊</option><option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.name }}</option></select></div>
      <div class="flex mt"><button class="btn" @click="save">{{ editingIdx !== null ? '更新' : '添加' }}</button><button v-if="editingIdx !== null" class="btn btn-outline" @click="cancelEdit">取消</button></div>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '../api.js'
import { toast } from '../composables/useToast.js'
const schedules = ref([])
const rooms = ref([])
const agents = ref([])
const editingIdx = ref(null)
const form = reactive({ dayOfWeek: undefined, hour: 9, minute: 0, agent: '', desc: '', prompt: '', showInChat: false, roomId: '' })
onMounted(load)
async function load() { try { const [d, r, a] = await Promise.all([api.get('/api/admin/schedules'), api.get('/api/rooms').catch(() => []), api.get('/api/agents').catch(() => [])]); schedules.value = d.schedules || []; rooms.value = r || []; agents.value = a || [] } catch (e) { toast(e.message, 'error') } }
function pad(n) { return String(n).padStart(2, '0') }
function timeLabel(s) { const t = pad(s.hour) + ':' + pad(s.minute); if (s.dayOfWeek !== undefined) return '每周' + ['日','一','二','三','四','五','六'][s.dayOfWeek] + ' ' + t; return '每天 ' + t }
function agentName(id) { if (!id) return ''; const a = agents.value.find(x => x.id === id); return a ? (a.emoji || '') + ' ' + (a.name || id) : '' }
function roomName(id) { if (!id) return ''; const r = rooms.value.find(x => x.id === id); return r ? r.name : '' }
function resetForm() { editingIdx.value = null; form.dayOfWeek = undefined; form.hour = 9; form.minute = 0; form.agent = ''; form.desc = ''; form.prompt = ''; form.showInChat = false; form.roomId = '' }
function edit(i) { editingIdx.value = i; const s = schedules.value[i]; Object.assign(form, { dayOfWeek: s.dayOfWeek, hour: s.hour || 9, minute: s.minute || 0, agent: s.agent || '', desc: s.desc || '', prompt: s.prompt || '', showInChat: !!s.showInChat, roomId: s.roomId || '' }) }
async function save() { if (!form.agent) { toast('请选择战友', 'error'); return } try { const list = [...schedules.value]; const entry = { hour: form.hour || 9, minute: form.minute || 0, agent: form.agent, desc: form.desc.trim() || '定时任务', prompt: form.prompt.trim(), showInChat: form.showInChat, roomId: form.showInChat ? form.roomId : null }; if (form.dayOfWeek !== undefined) entry.dayOfWeek = form.dayOfWeek; if (editingIdx.value !== null) { list[editingIdx.value] = entry; toast('已更新') } else { list.push(entry); toast('已添加') } await api.put('/api/admin/schedules', { schedules: list }); resetForm(); load() } catch (e) { toast(e.message, 'error') } }
async function del(i) { if (!confirm('确定删除？')) return; try { const list = schedules.value.filter((_, idx) => idx !== i); await api.put('/api/admin/schedules', { schedules: list }); toast('已删除'); schedules.value = list } catch (e) { toast(e.message, 'error') } }
function cancelEdit() { resetForm() }
</script>
