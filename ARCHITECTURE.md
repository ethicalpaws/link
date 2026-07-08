# LINK 项目架构文档

**版本**: v0.1.0
**更新**: 2026-07-09
**Node.js**: >=22

---

## 一、技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js 22+ |
| HTTP 服务器 | Express 4.22+ |
| LLM 接口 | OpenAI 兼容 API（当前: MiniMax-M3） |
| 聊天前端 | Vue 3 + Vite（新建） / Vanilla JS（旧版，已弃用） |
| Admin UI | Vue 3 + Vite + vue-router 4 |
| Markdown | marked ^12 |
| 代码高亮 | highlight.js ^11 |
| YAML | js-yaml ^4.1 |
| 存储 | 文件系统（JSON + Markdown），无数据库 |
| MCP | @modelcontextprotocol/sdk ^1.29 |

---

## 二、目录结构

```
E:\tep_working\BRIDGE\
├── bin/link                          # 进程入口
├── link.config.js                    # 用户配置（端口/代理/LLM/记忆等）
├── package.json                      # 根 workspace 配置（7 个包）
├── data/                             # 运行时数据目录
│   ├── rooms.json                    # 房间 + 消息历史（JSON 对象，key 为 roomId）
│   ├── agents-config.json            # 7 个代理配置
│   ├── llm-config.json               # LLM provider 配置
│   ├── schedules-config.json         # 定时任务配置
│   ├── room-tokens.json              # 房间访问 token
│   ├── knowledge/                    # 知识库（Markdown 笔记）
│   ├── daily-summary/                # 每日摘要（.md 文件）
│   ├── digest/                       # 周摘要（.md 文件）
│   ├── archive.md                    # 长期归档
│   ├── milestones.md                 # 里程碑记录
│   ├── core_identity.md              # 核心身份设定
│   ├── user-md-content.md            # 用户自定义内容
│   ├── period.md                     # 当前周期计划
│   ├── weekly.md                     # 周计划
│   └── logs/                         # JSONL 日志文件
│       ├── access-YYYY-MM-DD.log
│       ├── audit-YYYY-MM-DD.log
│       ├── scheduler-YYYY-MM-DD.log
│       ├── system-YYYY-MM-DD.log
│       └── llm-YYYY-MM-DD.log
├── agents/                           # 7 个代理的身份文件
│   └── {chronos,guidelight,anchor,echo,libra,lucero,custos}/
│       ├── SOUL.md                   # 代理灵魂/核心信条
│       ├── AGENTS.md                 # 角色设定
│       ├── TOOLS.md                  # 工具列表（供 LLM 使用）
│       └── HEARTBEAT.md              # 心跳内容（每小时推送）
├── tools/                            # ~70 个 YAML 工具定义
├── skills/                           # ~42 个多步工作流 YAML
├── workspace/                        # Per-agent 工作目录
│   └── {agentId}/heartbeat/          # 心跳日志
│       └── {date}.md
└── packages/
    ├── gateway/                      # Express 服务器核心
    │   ├── index.js                  # createServer() 入口
    │   ├── public/                   # 静态文件
    │   │   ├── index.html            # 旧版聊天界面（Vanilla JS，已弃用）
    │   │   ├── app.js                # 旧版聊天逻辑（~520 行）
    │   │   ├── style.css             # 旧版样式
    │   │   ├── marked.min.js
    │   │   └── chat-ui/              # 🆕 新版 Vue 3 聊天界面
    │   │       ├── index.html
    │   │       ├── src/
    │   │       │   ├── main.ts
    │   │       │   ├── App.vue           # 主组件（~730 行）
    │   │       │   ├── types.ts           # 类型定义
    │   │       │   ├── composables/       # Vue 3 Composition API 逻辑拆分
    │   │       │   │   ├── useSSE.ts      # SSE 连接 + 指数退避重连
    │   │       │   │   ├── useRooms.ts     # 房间 CRUD + 消息加载
    │   │       │   │   ├── useTheme.ts     # 主题 + 自动跟随系统
    │   │       │   │   ├── useMarkdown.ts  # marked + DOMPurify 消毒 + 缓存
    │   │       │   │   ├── useToast.ts     # Toast 提示
    │   │       │   │   ├── useApi.ts
    │   │       │   │   └── useConnection.ts
    │   │       │   └── styles/
    │   │       │       ├── index.css      # 组件样式
    │   │       │       └── themes.css     # 12 套主题
    │   │       ├── dist/             # 生产构建产物
    │   │       ├── package.json
    │   │       ├── vite.config.ts
    │   │       └── tsconfig.json
    │   ├── lib/
    │   │   ├── sse-bus.js            # SSE 广播 + 100 条环形缓冲 + 5 分钟 TTL
    │   │   ├── room-manager.js       # 房间 CRUD + 消息持久化 + 自动截断
    │   │   ├── chat-service.js       # @ 解析 + determineResponders + prompt 构建
    │   │   ├── tool-runner.js        # LLM ↔ 工具循环（权限过滤 + 路径安全）
    │   │   ├── scheduler.js          # PushScheduler（30s tick）+ 3 系统任务
    │   │   ├── builtin-tools.js      # 8 个内置工具（read_file 等）
    │   │   ├── room-auth.js          # 房间级 Bearer Token 认证
    │   │   ├── logger.js             # category JSONL 文件日志
    │   │   ├── audit.js              # 工具调用/权限拒绝审计
    │   │   └── mcp-bridge.js         # MCP StdioClientTransport 桥接
    │   └── routes/
    │       ├── chat.js               # POST /api/chat, /api/chat/stream
    │       ├── rooms.js              # CRUD + DELETE messages/:msgId
    │       ├── agents.js             # GET /api/agents
    │       ├── memory.js             # 记忆系统 API
    │       ├── knowledge.js          # 知识库 API
    │       └── admin.js              # 管理 API（工具/技能/LLM/计划等）
    │
    ├── llm/                          # LLM 抽象层
    │   ├── index.js                  # call() / stream() / healthCheck() / setProvider()
    │   ├── config.js                 # LLMConfig（primary/fallback/timeout/retries + 熔断）
    │   ├── client.js                 # httpRequest（指数退避 + 超时）
    │   ├── stream.js                 # parseSSEStream / streamRequest
    │   ├── health.js                 # CircuitBreaker（3 次失败 → 30s open）
    │   ├── format.js                 # buildBody / parseResponse / stripThinking
    │   ├── signal.js                 # combineSignals（⚠️ 有监听器泄漏 bug）
    │   └── providers/
    │       ├── openai-compat.js      # 默认 provider（minimax/deepseek 等）
    │       └── openclaw.js           # openclaw/{agentId} 格式
    │
    ├── memory/                       # 4 层压缩记忆系统
    │   ├── index.js
    │   ├── storage.js                # 日/周摘要存储 + 归档 + 里程碑
    │   ├── pipeline.js               # generateDailySummary / generateWeeklyDigest
    │   └── context.js                # buildContext（6 层上下文 → system prompt）
    │
    ├── registry/                     # 工具 + 技能注册中心
    │   ├── index.js
    │   ├── tool-registry.js          # Map 存储 / register / get / execute
    │   ├── skill-registry.js         # 步骤执行 + {{steps.X.result}} 引用解析
    │   ├── yaml-loader.js            # loadFromDir（工具）/ loadSkillsFromDir（技能）
    │   ├── mcp-bridge.js             # MCP 连接（5→60s 指数退避 + jitter）
    │   ├── link-skill.js             # @link/skill-* 社区技能基类
    │   ├── package-scanner.js        # 扫描 node_modules/@link/skill-*
    │   └── executors/
    │       ├── http.js               # HTTPS GET/POST + AbortController + URL 模板
    │       ├── command.js            # child_process.exec + 单引号转义
    │       └── ssh.js                # child_process.spawn（无 shell）
    │
    ├── knowledge/                    # Markdown 知识库
    │   ├── index.js                  # createKnowledgeBase()
    │   ├── storage.js                # gray-matter frontmatter / getAllNoteFiles
    │   ├── indexer.js                # buildIndex / updateEntry / rebuild
    │   └── search.js                 # 加权搜索（title×10 / tags×5 / desc×3 / summary×1）
    │
    ├── admin-ui/                     # Vue 3 管理后台（/admin）
    │   ├── src/
    │   │   ├── main.js
    │   │   ├── App.vue               # 侧边栏 + 路由视图 + Toast 容器
    │   │   ├── router/index.js       # 11 个路由（Dashboard/Agents/Tools/LLM 等）
    │   │   ├── api.js                # fetch 包装器
    │   │   ├── composables/
    │   │   │   └── useToast.js       # Toast 单例
    │   │   ├── assets/admin.css      # 全局暗色主题 + .markdown-body 样式
    │   │   └── views/                # 11 个页面组件
    │   └── public/
    │
    └── create-link-app/              # npm create link-app 脚手架
```

---

## 三、启动流程

```
bin/link
  ↓
读取 link.config.js
  ↓
初始化 @link/llm（LLMConfig + primary/fallback）
  ↓
初始化 @link/memory（data/ 目录）
  ↓
初始化 @link/registry
  ├─ ToolRegistry + SkillRegistry
  ├─ YamlLoader.loadFromDir(tools/) → 68 个工具
  └─ YamlLoader.loadSkillsFromDir(skills/) → 42 个技能
  ↓
连接 MCP 服务器（后台异步，5→60s 退避）
  ↓
读取 data/agents-config.json（7 个代理）
  ↓
createServer(config)
  ├─ 创建 SSEBus
  ├─ 创建 RoomManager（data/rooms.json）
  ├─ 注册 8 个内置工具
  ├─ 挂载路由
  │   ├─ /api/rooms → createRoomRoutes
  │   ├─ /api/chat → createChatRoute（流式 SSE）
  │   ├─ /api/agents → createAgentRoutes
  │   ├─ /api/knowledge → createKnowledgeRoutes
  │   ├─ /api/memory → createMemoryRoutes
  │   ├─ /api/admin → createAdminRoutes（Basic Auth 保护）
  │   └─ /api/events → SSE 广播端点
  ├─ 静态文件服务
  │   ├─ / → chat-ui/dist/（Vue 新界面）
  │   ├─ /admin → admin-ui/dist/（Vue 管理后台）
  │   └─ /admin/* → admin-ui/dist/
  ├─ PushScheduler 启动（30s tick）
  └─ 监听 port 3000
```

---

## 四、聊天消息流程

```
用户输入 "@司辰 内存马手感火热"
  ↓
POST /api/chat/stream
  ↓
handleAgents()
  ├─ determineResponders() → [司辰]
  │   └─ parseMentions("@司辰") → [chronos]
  │   └─ activeAgents 过滤
  ├─ 写入 SSE 路由事件: data: {type:'routing', agents:[司辰]}
  ├─ buildAgentPrompt(chronos, message, history)
  │   └─ buildContext(memoryStorage) → 日/周摘要
  │   └─ buildTranscript(history) → 滑动窗口 60 条
  │   └─ loadAgentFiles(chronos) → SOUL.md + AGENTS.md
  │   └─ → messages[]
  ├─ callWithTools(chronos, messages, llmCall, toolRegistry)
  │   └─ LLM → 工具调用循环
  │   └─ 每次 token: data: {type:'token', agent:chronos, token:'...'}
  │   └─ 完成: data: {type:'done', agent:chronos}
  ├─ roomManager.appendBatch()
  └─ data: {type:'complete'}

SSE 事件实时推送 → 前端 Vue 组件
  ↓
handleServerEvent()
  ├─ 'routing' → 显示路由节点
  ├─ 'token' → 累积到 streamBuffers → 更新消息内容
  ├─ 'done' → 标记消息完成
  └─ 'complete' → 刷新房间列表
```

---

## 五、路由决策逻辑

`determineResponders(message, activeAgents, agents)`:

```
有 @ 提及？
  ├─ 是 → 只路由到被提及的代理（不再叠加 autoReply）
  └─ 否 → 路由到 autoReply=true 的代理
      └─ activeAgents 非空时再过滤
```

---

## 六、SSE 系统

**SSEBus** (`lib/sse-bus.js`):
- 全局 subscribers + per-room subscribers
- 100 条环形缓冲（`MAX_BUFFER = 100`）
- 5 分钟 TTL（`getMissedEvents` 时过滤）
- `broadcast(event, roomId)` → 全局或指定房间
- `getMissedEvents(since, roomId)` → 断线重连补发

**SSE 端点**:
- `GET /api/events` → 实时订阅
- `GET /api/events/missed?since=timestamp` → 断线重连补发

---

## 七、记忆系统

4 层压缩:
```
原始消息（无限）
  ↓ dailySummary（14 天后清理）
日摘要（14 天后归档）
  ↓ weeklyDigest（52 周后清理）
周摘要（52 周后归档）
  ↓ archive
长期归档（永久保留）
```

`buildContext()` 构建 6 层 system prompt:
1. 今日日摘要
2. 本周周摘要
3. user-md-content.md
4. core_identity.md
5. period.md
6. weekly.md

---

## 八、工具执行流程

```
LLM 返回 tool_calls
  ↓
callWithTools()
  ├─ 权限检查（agent 的 tools 列表）
  ├─ pathSafetyCheck（绝对路径 + 敏感路径）
  ├─ timeout（默认 60s）
  └─ executor.execute(config, args)
      ├─ http.js → HTTPS GET/POST
      ├─ command.js → child_process.exec
      └─ ssh.js → child_process.spawn
  ↓
结果注入 LLM 继续对话
  ↓
循环直到 LLM 不再调用工具
```

---

## 九、近期修复清单（2026-07-09 审计）

### 安全修复

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 1 | `chat-ui/src/App.vue` | `v-html` XSS 风险 | 引入 DOMPurify，所有 Markdown 输出经过 sanitize |
| 2 | `lib/tool-runner.js:244` | `t.args` 为 undefined，参数变字符串 `"undefined"` | 改用 `t.arguments`（OpenAI 标准格式）|

### 功能修复

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 3 | `chat-ui/src/composables/useRooms.ts:86` | `data.room?.history` 但 API 直接返回 `room` | 改为 `data.history` |
| 4 | `chat-ui/src/composables/useRooms.ts` | `updateRoomPreview` 未导出 | 加入 return 对象 |
| 5 | `chat-ui/src/App.vue:578` | init 中调用未定义的 `loadRoomFn` | 统一 alias 为 `loadRoomComposed` |
| 6 | `chat-ui/src/App.vue` | 双击发送按钮重复请求 | 加 `sending` flag，发送前立即禁用 |
| 7 | `lib/chat-service.js:126` | `relayHint` 空语句 + 多余拼接 | 删除无用变量和拼接代码 |
| 8 | `InputBar.vue` | 快捷键描述 `Ctrl+Shift` 与实现 `Alt` 不符 | 修正描述 |

### 架构拆分（App.vue 1373 → 730 行）

| 文件 | 职责 |
|------|------|
| `composables/useSSE.ts` | SSE 连接、指数退避重连（1→2→4→8→16→30s）、流式缓冲 |
| `composables/useRooms.ts` | 房间 CRUD、消息加载、预览更新 |
| `composables/useTheme.ts` | 主题状态、自动跟随系统、localStorage 持久化 |
| `composables/useMarkdown.ts` | marked 配置、DOMPurify 消毒、Map 缓存 |
| `chat-ui/package.json` | 新增 DOMPurify 依赖 |

### UX 优化

| # | 文件 | 优化 |
|---|------|------|
| — | App.vue | Markdown 解析加 Map 缓存（200 条上限，淘汰最旧 25%）|
| — | App.vue | 加载状态「等待响应...」→ 「思考中...」|
| — | App.vue | 大房间（50+ 条）自动折叠最新 50 条，显示展开按钮 |

### 测试新增

| 文件 | 新增测试 |
|------|---------|
| `tests/gateway/chat-service.test.js` | `buildTranscript`（5 个）+ `buildAgentPrompt`（3 个）|
| `tests/gateway/room-manager.test.js` | `removeMessage`（2 个）|

---

## 十、文件命名对照

| 功能 | 文件路径 |
|------|---------|
| 聊天界面入口 | `packages/gateway/public/chat-ui/index.html` |
| Vue 主组件 | `packages/gateway/public/chat-ui/src/App.vue` |
| Vue 样式 | `packages/gateway/public/chat-ui/src/styles/index.css` |
| 主题配置 | `packages/gateway/public/chat-ui/src/styles/themes.css` |
| 服务器入口 | `packages/gateway/index.js` |
| 路由决策 | `packages/gateway/lib/chat-service.js` |
| 房间管理 | `packages/gateway/lib/room-manager.js` |
| SSE 广播 | `packages/gateway/lib/sse-bus.js` |
| 聊天路由 | `packages/gateway/routes/chat.js` |
| 房间 API | `packages/gateway/routes/rooms.js` |
| 定时调度 | `packages/gateway/lib/scheduler.js` |
| 工具运行 | `packages/gateway/lib/tool-runner.js` |
| 内置工具 | `packages/gateway/lib/builtin-tools.js` |
| LLM 调用 | `packages/llm/index.js` |
| 记忆上下文 | `packages/memory/context.js` |
| 知识库 | `packages/knowledge/index.js` |
| 工具注册 | `packages/registry/tool-registry.js` |
| YAML 加载 | `packages/registry/yaml-loader.js` |
| MCP 桥接 | `packages/registry/mcp-bridge.js` |
| 管理 UI | `packages/admin-ui/src/App.vue` |
| 用户配置 | `link.config.js` |
| 进程入口 | `bin/link` |
