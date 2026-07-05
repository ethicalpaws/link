<template>
  <div>
    <h1>🤝 MCP Server</h1>

    <div class="card">
      <h2>已配置的 MCP Server</h2>
      <div v-if="servers.length === 0" class="empty">暂无配置</div>
      <div v-for="(s, i) in servers" :key="i" class="item">
        <div>
          <div class="item-name">{{ s.name }}
            <span class="tag" v-if="s.command">{{ s.command }}</span>
          </div>
          <div class="item-desc">{{ s.args ? s.args.join(' ') : '' }}</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-danger" @click="del(i)">删除</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>{{ editing !== null ? '编辑 MCP Server' : '新增 MCP Server' }}</h2>
      <div class="row">
        <div class="col"><label>名称</label><input v-model="form.name" placeholder="filesystem" /></div>
        <div class="col"><label>命令</label><input v-model="form.command" placeholder="npx" /></div>
      </div>
      <div class="mb"><label>参数</label><input v-model="form.argsStr" placeholder="-y @modelcontextprotocol/server-filesystem ." /></div>
      <div class="mb"><label>环境变量（可选，JSON格式）</label><input v-model="form.envStr" placeholder='{"GITHUB_TOKEN":"ghp_xxx"}' /></div>
      <div class="flex">
        <button class="btn" @click="save">💾 保存</button>
        <button class="btn btn-outline" @click="resetForm">清空</button>
      </div>
    </div>

    <div class="card">
      <h2>📖 配置示例</h2>
      <p style="font-size:13px;color:#888;line-height:1.6;margin-bottom:12px">
        保存后生成 <code>data/mcp-config.json</code>，重启后自动连接。
        以下是表单字段与配置文件的对应关系：
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
        <thead>
          <tr style="background:#111133">
            <th style="padding:8px 12px;border:1px solid #222244;text-align:left">webui 表单字段</th>
            <th style="padding:8px 12px;border:1px solid #222244;text-align:left">配置文件中的位置</th>
            <th style="padding:8px 12px;border:1px solid #222244;text-align:left">示例值</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px 12px;border:1px solid #222244">名称</td>
            <td style="padding:8px 12px;border:1px solid #222244"><code>servers[0].name</code></td>
            <td style="padding:8px 12px;border:1px solid #222244">filesystem</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #222244">命令</td>
            <td style="padding:8px 12px;border:1px solid #222244"><code>servers[0].command</code></td>
            <td style="padding:8px 12px;border:1px solid #222244">npx</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #222244">参数</td>
            <td style="padding:8px 12px;border:1px solid #222244"><code>servers[0].args</code></td>
            <td style="padding:8px 12px;border:1px solid #222244;font-size:12px">["-y","@modelcontextprotocol/server-filesystem","."]</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #222244">环境变量</td>
            <td style="padding:8px 12px;border:1px solid #222244"><code>servers[0].env</code></td>
            <td style="padding:8px 12px;border:1px solid #222244;font-size:12px">{ "GITHUB_TOKEN": "ghp_xxx" }</td>
          </tr>
        </tbody>
      </table>

      <pre style="background:#0a0a18;padding:12px;border-radius:6px;font-size:12px;color:#aaa;line-height:1.5">{
  "servers": [
    {
      "name": "filesystem",      ← 名称
      "command": "npx",           ← 命令
      "args": [                   ← 参数
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."
      ],
      "env": {                    ← 环境变量（可选）
        "GITHUB_TOKEN": "ghp_xxx"
      }
    }
  ]
}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '../api.js'
import { toast } from '../composables/useToast.js'

const servers = ref([])
const editing = ref(null)

const form = reactive({ name: '', command: '', argsStr: '', envStr: '' })

function resetForm() {
  editing.value = null
  form.name = ''
  form.command = ''
  form.argsStr = ''
  form.envStr = ''
}

onMounted(load)
async function load() {
  try {
    const d = await api.get('/api/admin/mcp-config')
    servers.value = d.servers || []
  } catch (e) { toast(e.message, 'error') }
}

async function save() {
  const args = form.argsStr ? form.argsStr.split(' ').filter(Boolean) : []
  let env = undefined
  if (form.envStr.trim()) {
    try { env = JSON.parse(form.envStr) } catch { toast('环境变量格式错误，需要 JSON', 'error'); return }
  }
  const entry = { name: form.name.trim(), command: form.command.trim(), args, env }
  if (!entry.name || !entry.command) { toast('名称和命令不能为空', 'error'); return }

  const list = [...servers.value]
  if (editing.value !== null) list[editing.value] = entry
  else list.push(entry)

  try {
    await api.put('/api/admin/mcp-config', { servers: list })
    toast('✅ 已保存，重启后生效')
    resetForm()
    load()
  } catch (e) { toast(e.message, 'error') }
}

async function del(idx) {
  if (!confirm('确定删除？')) return
  const list = servers.value.filter((_, i) => i !== idx)
  try {
    await api.put('/api/admin/mcp-config', { servers: list })
    toast('已删除')
    load()
  } catch (e) { toast(e.message, 'error') }
}
</script>
