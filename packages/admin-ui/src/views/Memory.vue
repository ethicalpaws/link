<template>
  <div>
    <h1>📅 成长轨迹</h1>

    <div class="card">
      <h2>日摘要</h2>
      <div v-if="summaries.length === 0" class="empty">暂无日摘要</div>
      <div v-for="s in summaries" :key="s.date" class="item">
        <div>
          <div class="item-name">📅 {{ s.date }}</div>
          <div class="item-desc">{{ s.preview || '' }}</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-outline" @click="viewDaily(s.date)">查看</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>周摘要</h2>
      <div v-if="digests.length === 0" class="empty">暂无周摘要</div>
      <div v-for="d in digests" :key="d.weekKey" class="item">
        <div>
          <div class="item-name">📊 {{ d.weekKey }}</div>
          <div class="item-desc">{{ d.preview || '' }}</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-outline" @click="viewDigest(d.weekKey)">查看</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>里程碑</h2>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input v-model="milestoneTitle" placeholder="标题" style="flex:1" />
        <input v-model="milestoneDesc" placeholder="描述" style="flex:2" />
        <button class="btn btn-sm" @click="addMilestone">＋</button>
      </div>
      <div v-if="milestones.length === 0" class="empty">暂无里程碑</div>
      <div v-for="m in milestones" :key="m.id" class="item">
        <div>
          <div class="item-name">🏆 {{ m.title }}</div>
          <div class="item-desc">{{ m.date }} · {{ (m.description || '').slice(0, 60) }}</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-danger" @click="delMilestone(m.id)">删除</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>归档</h2>
      <pre style="font-size:12px;color:#888;max-height:200px;overflow:auto;white-space:pre-wrap">{{ archiveContent || '暂无归档' }}</pre>
    </div>

    <!-- 查看详情弹窗 -->
    <div v-if="detailContent" class="modal-overlay" @click.self="detailContent = ''">
      <div class="modal-box">
        <div class="markdown-body" v-html="rendered"></div>
        <div class="flex mt"><button class="btn btn-outline" @click="detailContent = ''">关闭</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api.js'
import { marked } from 'marked'

const summaries = ref([])
const digests = ref([])
const milestones = ref([])
const archiveContent = ref('')
const detailContent = ref('')
const milestoneTitle = ref('')
const milestoneDesc = ref('')

const rendered = computed(() => detailContent.value ? marked.parse(detailContent.value).replace(/<img[^>]*>/g, '') : '')

onMounted(load)
async function load() {
  const [s, mi, a, d] = await Promise.all([
    api.get('/api/memory/daily-summaries?days=7').catch(() => ({})),
    api.get('/api/memory/milestones').catch(() => ({})),
    api.get('/api/memory/archive').catch(() => ({})),
    api.get('/api/memory/digests').catch(() => ({})),
  ])
  summaries.value = s.summaries || []
  milestones.value = mi.milestones || []
  archiveContent.value = a.content || ''
  digests.value = d.digests || []
}

async function viewDaily(date) {
  const d = await api.get('/api/memory/daily-summary/' + date)
  detailContent.value = d.content
}
async function viewDigest(key) {
  const d = await api.get('/api/memory/digest/' + key)
  detailContent.value = d.content
}
async function addMilestone() {
  if (!milestoneTitle.value) return
  await api.put('/api/memory/milestone', { title: milestoneTitle.value, description: milestoneDesc.value })
  milestoneTitle.value = ''
  milestoneDesc.value = ''
  load()
}
async function delMilestone(id) {
  if (!confirm('确定删除里程碑？')) return
  await api.delete('/api/memory/milestone/' + id)
  load()
}
</script>
