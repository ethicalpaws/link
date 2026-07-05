<template>
  <div>
    <h1>📚 知识库</h1>

    <div style="display:flex;gap:8px;margin-bottom:12px">
      <input v-model="searchQuery" placeholder="搜索..." style="flex:1" @keydown.enter="doSearch" />
      <button class="btn btn-outline" @click="doSearch">🔍</button>
    </div>

    <div class="card" style="padding:10px 16px;margin-bottom:12px;font-size:13px">
      <a style="cursor:pointer;color:#6688dd" @click="cd('')">📚 知识库</a>
      <template v-for="(p, i) in pathParts" :key="i">
        <span> / </span>
        <a style="cursor:pointer;color:#6688dd" @click="cd(pathParts.slice(0, i + 1).join('/'))">{{ p }}</a>
      </template>
    </div>

    <!-- 外部目录配置（收起状态） -->
    <div class="card" style="padding:10px 16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" @click="showExtConfig = !showExtConfig">
        <span style="font-size:13px;color:#888">📎 外部知识库目录</span>
        <span style="font-size:12px;color:#666">{{ showExtConfig ? '收起' : '展开' }} {{ extDirs.length > 0 ? '(' + extDirs.length + ' 个)' : '' }}</span>
      </div>
      <div v-if="showExtConfig" style="margin-top:10px">
        <div style="font-size:12px;color:#888;margin-bottom:8px">添加本地知识库目录，Agent 可搜索但不可编辑（适合技术用户使用 VS Code / Obsidian 等维护）</div>
        <div class="mb"><input v-model="newExtDir" placeholder="D:/my-obsidian-vault" style="width:100%" /></div>
        <div class="flex mb">
          <button class="btn btn-sm" @click="addExtDir">＋ 添加</button>
        </div>
        <div v-for="(d, i) in extDirs" :key="i" class="item" style="font-size:12px">
          <span>📎 {{ d }}</span>
          <button class="btn btn-sm btn-danger" @click="removeExtDir(i)">移除</button>
        </div>
        <div v-if="extDirs.length === 0" class="empty" style="font-size:12px;padding:12px">暂无外部目录配置</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn" @click="newNote">📝 写笔记</button>
      <button class="btn btn-outline" @click="importFile">📥 导入</button>
      <button class="btn btn-outline" @click="newFolder">📁 文件夹</button>
    </div>

    <!-- 搜索结果 -->
    <div v-if="searchMode" class="card">
      <h2>🔍 搜索结果: {{ searchQuery }}</h2>
      <button class="btn btn-outline mb" @click="searchMode = false">← 返回</button>
      <div v-for="r in searchResults" :key="r.path + (r._source || '')" class="item" style="cursor:pointer" @click="viewNote(r.path)">
        <div class="item-name">
          📄 {{ r.title }}
          <span v-if="r._source" class="tag" :style="{ background: isExternal(r._source) ? '#1a1a3a' : '#1a1a44', color: isExternal(r._source) ? '#88aaee' : '#8899ee' }">
            {{ isExternal(r._source) ? '外部' : '内置' }}
          </span>
        </div>
        <div class="item-desc">{{ r.description }}</div>
      </div>
      <div v-if="searchResults.length === 0" class="empty">无结果</div>
    </div>

    <!-- 目录浏览 -->
    <div v-else class="card">
      <div v-if="currentDir" class="item" style="cursor:pointer" @click="cd(parentDir)">
        <div class="item-name">.. 返回上级</div>
      </div>
      <div v-for="d in dirs" :key="d" class="item" style="cursor:pointer" @click="cd(d)">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
          <span style="color:#c88;cursor:pointer;font-size:13px" @click.stop="delDir(d)">🗑</span>
          <div class="item-name" style="flex:1;margin-left:8px">📁 {{ d }}</div>
        </div>
      </div>
      <div v-for="f in files" :key="f.path + (f._source || '')" class="item" style="cursor:pointer" @click="viewNote(f.path)">
        <div class="item-name">
          📄 {{ f.title }}
          <span v-if="f._source" class="tag" :style="{ background: isExternal(f._source) ? '#1a1a3a' : '#1a1a44', color: isExternal(f._source) ? '#88aaee' : '#8899ee' }">
            {{ isExternal(f._source) ? '外部' : '内置' }}
          </span>
        </div>
        <div class="item-desc">{{ f.description }}</div>
      </div>
      <div v-if="dirs.length === 0 && files.length === 0" class="empty">📭 空</div>
    </div>

    <!-- 笔记查看 / 编辑 -->
    <div v-if="viewPath" class="card">
      <div v-if="noteReadonly && !isEditing" style="margin-bottom:10px;font-size:12px;color:#888;background:#1a1a2a;padding:8px 12px;border-radius:4px">
        📎 此笔记来自外部目录，请在原编辑器中修改
      </div>
      <div v-if="isEditing && !noteReadonly">
        <h2>✏️ {{ noteData.title }}</h2>
        <div class="row">
          <div class="col"><label>标题</label><input v-model="editTitle" /></div>
          <div class="col"><label>标签</label><input v-model="editTags" /></div>
        </div>
        <div class="mb"><label>正文</label><textarea v-model="editBody" rows="16"></textarea></div>
        <div class="flex">
          <button class="btn" @click="saveEdit">💾 保存</button>
          <button class="btn btn-outline" @click="isEditing = false">取消</button>
        </div>
      </div>
      <div v-else>
        <div style="font-size:12px;color:#888;margin-bottom:8px">
          {{ noteData.relativePath }}
          <span v-if="noteReadonly" class="tag" style="background:#1a1a3a;color:#88aaee">外部</span>
          <span v-for="t in noteData.tags" :key="t" class="tag">{{ t }}</span>
        </div>
        <div class="flex" style="gap:4px;margin-bottom:12px">
          <button class="btn btn-sm btn-outline" @click="startEdit" :disabled="noteReadonly">✏️ 编辑</button>
          <button class="btn btn-sm btn-outline" @click="exportNote">📤 导出</button>
          <button class="btn btn-sm btn-danger" @click="deleteNote" :disabled="noteReadonly">🗑 删除</button>
          <button class="btn btn-sm btn-outline" @click="viewPath = ''">← 返回</button>
        </div>
        <div class="markdown-body" v-html="renderedNote"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api.js'
import { marked } from 'marked'
import { toast } from '../composables/useToast.js'

const currentDir = ref('')
const dirs = ref([])
const files = ref([])
const searchQuery = ref('')
const searchMode = ref(false)
const searchResults = ref([])
const viewPath = ref('')
const noteData = ref({})
const isEditing = ref(false)
const editTitle = ref('')
const editTags = ref('')
const editBody = ref('')
const noteReadonly = ref(false)

// 外部目录配置
const showExtConfig = ref(false)
const extDirs = ref([])
const newExtDir = ref('')

const pathParts = computed(() => currentDir.value ? currentDir.value.split('/') : [])
const parentDir = computed(() => {
  if (!currentDir.value) return ''
  const i = currentDir.value.lastIndexOf('/')
  return i >= 0 ? currentDir.value.slice(0, i) : ''
})
const renderedNote = computed(() => noteData.value.body ? marked.parse(noteData.value.body).replace(/<img[^>]*>/g, '') : '')

function isExternal(source) {
  return source && !source.includes('\\knowledge') && !source.includes('/knowledge')
}

onMounted(() => { loadDir(); loadExtConfig() })

async function loadExtConfig() {
  try {
    const d = await api.get('/api/knowledge/external-config')
    extDirs.value = d.dirs || []
  } catch {}
}

async function addExtDir() {
  if (!newExtDir.value.trim()) return
  const dirs = [...extDirs.value, newExtDir.value.trim()]
  try {
    await api.put('/api/knowledge/external-config', { dirs })
    toast('✅ 已保存，重启后生效')
    extDirs.value = dirs
    newExtDir.value = ''
  } catch (e) { toast(e.message, 'error') }
}

async function removeExtDir(idx) {
  if (!confirm('确定移除？')) return
  const dirs = extDirs.value.filter((_, i) => i !== idx)
  try {
    await api.put('/api/knowledge/external-config', { dirs })
    toast('已保存，重启后生效')
    extDirs.value = dirs
  } catch (e) { toast(e.message, 'error') }
}

async function loadDir() {
  try {
    const d = await api.get('/api/knowledge/dir?path=' + encodeURIComponent(currentDir.value))
    dirs.value = d.dirs || []
    files.value = d.files || []
  } catch (e) { toast(e.message, 'error') }
}
function cd(path) { currentDir.value = path; viewPath.value = ''; loadDir() }

async function doSearch() {
  if (!searchQuery.value) return
  try {
    searchMode.value = true
    const d = await api.get('/api/knowledge/search?q=' + encodeURIComponent(searchQuery.value))
    searchResults.value = (d.results || []).map(r => r)
  } catch (e) { toast(e.message, 'error') }
}

async function viewNote(path) {
  try {
    viewPath.value = path
    isEditing.value = false
    noteData.value = await api.get('/api/knowledge/note?path=' + encodeURIComponent(path))
    noteReadonly.value = noteData.value._readonly === true
  } catch (e) { toast(e.message, 'error') }
}
function newNote() {
  const df = currentDir.value ? currentDir.value + '/new.md' : 'new.md'
  viewPath.value = '__new__'
  isEditing.value = true
  noteReadonly.value = false
  editTitle.value = ''
  editTags.value = ''
  editBody.value = ''
  const name = prompt('文件名:', df)
  if (name) { window.__newNotePath = name }
}
async function saveEdit() {
  try {
    if (viewPath.value === '__new__') {
      const path = window.__newNotePath || 'new.md'
      await api.post('/api/knowledge/note', { path, title: editTitle.value || '未命名', body: editBody.value, tags: editTags.value.split(',').map(s => s.trim()).filter(Boolean) })
    } else {
      await api.put('/api/knowledge/note', { path: viewPath.value, title: editTitle.value || noteData.value.title, body: editBody.value, tags: editTags.value.split(',').map(s => s.trim()).filter(Boolean) })
    }
    toast('✅ 已保存')
    isEditing.value = false
    viewPath.value = ''
    loadDir()
  } catch (e) { toast(e.message, 'error') }
}
function startEdit() {
  if (noteReadonly.value) return
  isEditing.value = true
  editTitle.value = noteData.value.title || ''
  editTags.value = (noteData.value.tags || []).join(', ')
  editBody.value = noteData.value.body || ''
}
function exportNote() {
  window.open('/api/knowledge/export?path=' + encodeURIComponent(viewPath.value), '_blank')
}
async function deleteNote() {
  if (noteReadonly.value) return
  if (!confirm('确定删除？')) return
  try {
    await api.delete('/api/knowledge/note', { path: viewPath.value })
    toast('已删除')
    viewPath.value = ''
    loadDir()
  } catch (e) { toast(e.message, 'error') }
}
async function importFile() {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.accept = '.md'
  inp.onchange = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    const r = new FileReader()
    r.onload = async (ev) => {
      try {
        const b = ev.target.result.split(',')[1]
        await api.post('/api/knowledge/import', { name: f.name, content: b, path: (currentDir.value ? currentDir.value + '/' : '') + f.name })
        toast('✅ 已导入')
        loadDir()
      } catch (e) { toast(e.message, 'error') }
    }
    r.readAsDataURL(f)
  }
  inp.click()
}
async function delDir(name) {
  if (!confirm('确定删除目录「' + name + '」？')) return
  try {
    const p = currentDir.value ? currentDir.value + '/' + name : name
    await api.delete('/api/knowledge/dir', { path: p })
    toast('已删除')
    loadDir()
  } catch (e) { toast(e.message, 'error') }
}

async function newFolder() {
  const name = prompt('文件夹名：')
  if (!name || !name.trim()) return
  try {
    await api.post('/api/knowledge/dir', { path: currentDir.value, name: name.trim() })
    loadDir()
  } catch (e) { toast(e.message, 'error') }
}
</script>
