# LINK

**Long-term Intelligent & Individual Navigation Keystone**

陪你走得更远。

LINK 是一个基于 Node.js 的多 Agent 陪伴平台，为个性化、长期成长者设计 — 记录你的轨迹、校准你的方向、检验你的进步、陪伴你成长。

---

## 特性

### 🧠 记忆系统
四层压缩管道：原始消息 → 日摘要 → 周摘要 → 归档。每次对话，Agent 都知道你走到哪了。

### 🤖 战友系统
多个 AI 角色同时在线，各司其职（校准者/记录者…）。基于 @提及或 autoReply 触发，白名单工具权限隔离。

### 📚 知识库
Markdown + YAML frontmatter 笔记管理，支持全文搜索。外部知识库目录可挂载（Obsidian/VS Code 笔记）。

### ⏰ 定时任务
支持每天或每周特定星期几触发，Agent 自动执行并推送结果到群聊（可选）。

### 🔧 工具生态
- **内置工具**：read_file / write_file / list_dir / search_content / web_search / fetch_url / get_date
- **YAML 自定义工具**：零代码，编写 YAML 即可添加 HTTP/command/SSH 工具
- **MCP 协议**：连接标准 MCP Server，自动发现工具
- **Skill 编排**：多步骤工作流，YAML 定义工具组合

### 🔒 安全
白名单工具权限 · 路径安全校验 · 命令注入防护 · SSRF 防护 · Basic Auth 管理面板 · 完整审计日志

### 💾 极简运维
无数据库，纯文件系统持久化 · 单进程，无需 Docker/K8s · 仅 4 个运行时依赖

---

## 技术栈

Node.js 22+ · Express · Vanilla JS 聊天前端 · Vue 3 管理面板 · OpenAI 兼容 API · MCP

---

## 快速开始

### 环境要求

- Node.js ≥ 22

### 安装

```bash
git clone https://github.com/ethicalpaws/LINK.git
cd LINK
npm install
```


### 启动

```bash
npm start
```

访问：
- 💬 聊天：http://localhost:3000
- ⚙️ 管理面板：http://localhost:3000/admin（首次自动生成随机密码【均为一次性，每次启动都不同】，打印在控制台）

---

### 配置 LLM

在浏览器打开 http://localhost:3000/admin → LLM 页面，填写你的 API Key 和 provider（支持 OpenAI / MiniMax / DeepSeek / 通义千问 / ChatGPT / OpenClaw 等）。

或直接在 `data/llm-config.json` 配置：

```json
{
  "provider": "openai",
  "apiKey": "sk-...",
  "model": "gpt-4o-mini",
  "baseUrl": "https://api.openai.com/v1"
}
```

## 项目结构

```
LINK/
├── bin/link                      # 启动入口
├── link.config.js                # 系统配置（可选）
├── data/                         # 运行时数据
│   ├── agents-config.json        # 战友列表
│   ├── llm-config.json           # LLM 配置
│   ├── rooms.json                # 房间历史
│   ├── knowledge/                # 知识库笔记
│   └── daily-summary/            # 日摘要（自动生成）
├── agents/                       # 战友身份定义
│   └── example/
│       ├── SOUL.md               # 灵魂底色
│       ├── AGENTS.md             # 工作规范
│       └── TOOLS.md              # 工具规范
├── tools/                        # 自定义 YAML 工具
├── skills/                       # Skill 编排
├── packages/
│   ├── gateway/                  # HTTP 网关 + 工具引擎
│   ├── llm/                      # LLM 适配层
│   ├── memory/                   # 记忆系统
│   ├── registry/                 # 工具注册 + MCP Bridge
│   ├── knowledge/                # 知识库
│   ├── admin-ui/                 # Vue 3 管理面板
│   └── create-link-app/          # npm create link-app 脚手架

```

---

## 管理面板

访问 `/admin`，包含 11 个页面：

| 页面 | 功能 |
|------|------|
| 🤖 战友 | 添加/编辑 Agent，配置工具权限、SOUL.md、AGENTS.md、TOOL.md |
| 💬 聊天 | 群聊界面，SSE 实时推送 |
| 📊 Dashboard | 系统状态概览 |
| 🛠️ 工具 | 创建/编辑 YAML 工具 |
| 📋 Skill | 创建/编辑 Skill 编排 |
| 🤝 MCP | 配置 MCP Server |
| 📚 知识库 | 笔记 CRUD + 搜索 |
| 📅 计划 |  阶段计划 / 周计划 |
| ⏰ 定时任务 | 配置每日/每周定时任务 |
| 🧠 记忆 | 日摘要 / 周摘要 / 归档 |
| 🔐 身份 | 配置核心初衷 / 虚拟身份 |

---

## 添加自定义工具

在 `tools/` 目录下创建 YAML 文件：

```yaml
name: my_tool
description: 我的工具描述
type: http                          # http | command | ssh
params:
  query:
    type: string
    description: 搜索关键词
    required: true
url: https://api.example.com/search?q={{query}}
method: GET
```

---

## 社区

- GitHub Issues：Bug 报告和功能建议
- 欢迎提交 PR

---

## License

MIT
