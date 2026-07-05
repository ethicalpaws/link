# LINK 系统架构白皮书

> Long-term Intelligent Navigation Keystone · v0.1.0  
> 最后更新: 2026-07-05

---

## 目录

1. [系统概述](#1-系统概述)
2. [目录结构](#2-目录结构)
3. [模块依赖图](#3-模块依赖图)
4. [五层架构详解](#4-五层架构详解)
5. [核心数据流](#5-核心数据流)
6. [工具调用链路](#6-工具调用链路)
7. [记忆系统管道](#7-记忆系统管道)
8. [安全防护矩阵](#8-安全防护矩阵)
9. [Agent 权限管控](#9-agent-权限管控)
10. [审计日志](#10-审计日志)
11. [MCP Bridge](#11-mcp-bridge)
12. [Skill 系统](#12-skill-系统)
13. [当前不足与改进方案](#13-当前不足与改进方案)

---

## 1. 系统概述

LINK 是一个基于 Node.js monorepo 的多智能体 AI 聊天平台，支持持久化记忆、知识管理、定时任务和可扩展的工具/插件系统。

### 设计哲学

- **无框架前端**：Vanilla JS / Vue 3，不依赖 React 或构建工具链
- **无数据库**：全部文件系统持久化（JSON + Markdown）
- **单进程**：Gateway、LLM 调用、调度器、SSE 全部在一个进程中运行
- **API 优先**：前端通过 REST API + SSE 消费后端
- **中文优先**：所有用户界面、注释和 Agent 模板均为简体中文

### 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 运行环境 | Node.js 22+ | 仅需一个 runtime |
| HTTP 服务 | express ^4.22 | REST API + SSE |
| LLM 协议 | OpenAI 兼容格式 | MiniMax / DeepSeek / OpenAI / 通义千问 / OpenClaw |
| 前端 1（聊天） | Vanilla JS | ~520 行，无依赖 |
| 前端 2（管理） | Vue 3 + Vite | 11 个页面组件，有旧版回退 |
| Markdown | marked ^18 | 前后端共用 |
| YAML 解析 | js-yaml ^4.1 | 工具/Skill 配置 |
| Frontmatter | gray-matter ^4.0 | 知识库笔记 |
| MCP SDK | @modelcontextprotocol/sdk ^1.29 | MCP 协议工具桥接 |
| 外部依赖 | **4 个运行时 npm 包** | express / marked / js-yaml / gray-matter + MCP SDK |

---

## 2. 目录结构

```
E:\LINK\
├── package.json                      # monorepo 根配置（7 个 workspaces）
├── link.config.js                    # 用户配置入口
├── vitest.config.js                  # 测试配置（测试文件待实现）
├── bin/link                          # 进程启动入口
│
├── data/                             # 运行时持久化数据
│   ├── rooms.json                    # 房间 + 聊天历史
│   ├── llm-config.json               # LLM provider 配置（含 API key）
│   ├── agents-config.json            # Agent 列表配置（含 tools/skills 权限）
│   ├── schedules-config.json         # 定时任务配置
│   ├── mcp-config.json               # MCP Server 配置
│   ├── core_identity.md              # 核心初衷
│   ├── user-md-content.md            # 用户身份信息（推荐虚拟身份）
│   ├── period.md                     # 阶段计划
│   ├── weekly-plan.md                # 周计划
│   ├── milestones.md                 # 里程碑记录
│   ├── archive.md                    # 归档存储
│   ├── audit.log                     # 审计日志
│   ├── daily-summary/                # 日摘要文件
│   ├── digest/                       # 周摘要文件
│   ├── weekly.md                     # 本周计划（通过 API 设置）
│   └── knowledge/                    # 知识库笔记
├── external-knowledge.json           # 外部知识库目录配置
│
├── agents/                           # 战友身份目录
│   └── {id}/
│       ├── SOUL.md                   # 灵魂底色、核心信条
│       ├── AGENTS.md                 # 工作规范、职责、权限
│       ├── TOOLS.md                  # 可用工具列表和攻击调用说明
│    
│
├── tools/                            # 自定义 YAML 工具
│   └── _example.yaml                 # 模板（HTTP / command / SSH）
│
├── skills/                           # Skill 编排
│   ├── daily-news.yaml               # 内置 Skill：知识日报
│   ├── knowledge-search.yaml         # 内置 Skill：知识搜索
│   ├── file-organizer.yaml           # 内置 Skill：文件整理
│   └── _example.yaml                 # 模板
│
├── workspace/                        # 工作区
│   └── {agentId}/                    # 每个 Agent 独立子目录
│
├── packages/
│   ├── llm/           @link/llm      # LLM 适配层（call/stream/healthCheck/setProvider）
│   │     ├── index.js                ← 统一入口
│   │     ├── config.js               ← LLMConfig（primary/fallback/timeout/retries）
│   │     ├── health.js               ← CircuitBreaker（3次失败→open→30s恢复）
│   │     ├── client.js               ← HTTP 重试客户端（指数退避）
│   │     ├── stream.js               ← SSE token 流解析
│   │     ├── signal.js               ← AbortSignal 合并工具
│   │     ├── format.js               ← 请求构建 + 响应解析 + safeJSONParse
│   │     └── providers/
│   │           ├── openclaw.js       ← OpenClaw 适配器
│   │           └── openai-compat.js  ← OpenAI 兼容适配器（MiniMax/DeepSeek/Qwen/ChatGPT）
│   │
│   ├── gateway/       @link/gateway  # HTTP 网关 + 工具引擎 + 审计
│   │     ├── index.js                ← Express 装配 + 路由挂载
│   │     ├── lib/
│   │     │   ├── chat-service.js     ← @提及路由 + 上下文截断 + prompt 构建
│   │     │   ├── room-manager.js     ← 房间 CRUD + 原子持久化 + 自动截断
│   │     │   ├── sse-bus.js          ← SSE 广播 + 环形缓冲区 + 重连补发
│   │     │   ├── scheduler.js        ← 定时调度（用户任务 + 系统任务 + 超时）
│   │     │   ├── tool-runner.js      ← 工具引擎（权限过滤 + 路径安全 + 超时）
│   │     │   ├── audit.js            ← 审计日志（工具调用/权限拒绝/路径违规）
│   │     │   └── builtin-tools.js    ← 7 个内置工具（read/write/append_file 等）
│   │     ├── routes/
│   │     │   ├── chat.js             ← POST /api/chat, POST /api/chat/stream
│   │     │   ├── rooms.js            ← 房间 CRUD
│   │     │   ├── agents.js           ← Agent 信息
│   │     │   ├── admin.js            ← 管理 API（状态/工具/LLM/身份/定时/MCP/审计）
│   │     │   ├── memory.js           ← 记忆 API（摘要/里程碑/计划）
│   │     │   └── knowledge.js        ← 知识库 CRUD + 搜索
│   │     └── public/                 ← 聊天前端 SPA（Vanilla JS）
│   │
│   ├── memory/        @link/memory   # 记忆系统
│   │     ├── index.js                ← 统一出口
│   │     ├── storage.js              ← 文件存储（日/周摘要、里程碑、归档）
│   │     ├── pipeline.js             ← 三层压缩管道（摘要 → 周报 → 归档）
│   │     └── context.js              ← 上下文构建
│   │
│   ├── registry/      @link/registry # 工具注册中心 + SkillRegistry + MCP Bridge
│   │     ├── index.js                ← 统一出口
│   │     ├── tool-registry.js        ← Map 注册表 + JSON Schema 转换
│   │     ├── skill-registry.js       ← Skill 注册表 + isAllowed() 权限检查
│   │     ├── yaml-loader.js          ← YAML → Tool / Skill 加载
│   │     ├── mcp-bridge.js           ← MCP 协议桥接（连接→发现→注册→执行）
│   │     ├── package-scanner.js      ← @link/skill-* 社区包扫描
│   │     ├── link-skill.js           ← Skill SDK 基类
│   │     └── executors/
│   │           ├── command.js        ← 命令执行（单引号转义防注入）
│   │           ├── http.js           ← HTTP 请求执行（SSRF 防护）
│   │           └── ssh.js            ← SSH 远程执行（spawn + 参数数组）
│   │
│   ├── knowledge/     @link/knowledge# 知识库
│   │     ├── index.js                ← 统一出口
│   │     ├── storage.js              ← gray-matter 笔记存储
│   │     ├── indexer.js              ← knowledge_index.json 索引构建
│   │     └── search.js               ← 加权搜索（标题×10 / 标签×5 / 描述×3）
│   │
│   ├── admin-ui/      @link/admin-ui # Vue 3 管理面板（11 个页面）
│   │     ├── src/
│   │     │   ├── views/              ← Dashboard/Llm/Memory/Plans/Skills/Identity/Mcp/Tools/Knowledge/Scheduler/Agents
│   │     │   ├── router/             ← Vue Router 配置
│   │     │   ├── composables/        ← useToast 等复用逻辑
│   │     │   └── api.js              ← 统一 API 调用封装
│   │     └── dist/                   ← Vite 构建产物
│   │
│   └── create-link-app/             # npm create link-app 脚手架
│
├── ARCHITECTURE.md                   # 本文档
├── Dockerfile                        # 多阶段构建
├── docker-compose.yml                # 一键部署
└── CHANGELOG.md                      # 版本历史
```

---

## 3. 模块依赖图

```
bin/link（启动入口）
  │
  ├── @link/llm ─────────────────────────────────────────────
  │     ├── index.js         ← 统一入口（call/stream/healthCheck/setProvider）
  │     ├── format.js        ← 工具调用格式（请求构建 + 响应解析 + safeJSONParse）
  │     ├── client.js        ← HTTP 重试 + 超时（指数退避）
  │     ├── stream.js        ← SSE token 流解析
  │     ├── health.js        ← 断路器（3次失败 → open → 30s → half-open）
  │     ├── signal.js        ← AbortSignal 合并工具
  │     └── providers/
  │           ├── openclaw.js        ← OpenClaw 适配器
  │           └── openai-compat.js   ← OpenAI 兼容适配器
  │
  ├── @link/memory ──────────────────────────────────────────
  │     ├── storage.js       ← 文件存储（日/周摘要、里程碑、归档）
  │     ├── pipeline.js      ← 三层压缩管道（摘要 → 周报 → 归档）
  │     └── context.js       ← 上下文构建
  │
  ├── @link/registry ────────────────────────────────────────
  │     ├── tool-registry.js      ← Map 注册表 + JSON Schema 转换
  │     ├── skill-registry.js     ← Skill 注册表 + isAllowed() 权限检查
  │     ├── yaml-loader.js        ← YAML → Tool / Skill 加载
  │     ├── mcp-bridge.js         ← MCP 协议桥接（连接→发现→注册→执行）
  │     ├── package-scanner.js    ← @link/skill-* 社区包扫描
  │     ├── link-skill.js         ← SDK 基类
  │     └── executors/
  │           ├── command.js      ← 命令执行（单引号转义防注入）
  │           ├── http.js         ← HTTP 请求执行（SSRF 防护）
  │           └── ssh.js          ← SSH 远程执行（spawn + 参数数组）
  │
  └── @link/gateway ─────────────────────────────────────────
        ├── index.js               ← Express 装配 + 路由挂载
        ├── lib/
        │   ├── chat-service.js    ← @提及路由 + 上下文截断 + prompt 构建
        │   ├── room-manager.js    ← 房间 CRUD + 原子持久化 + 自动截断
        │   ├── sse-bus.js         ← SSE 广播 + 环形缓冲区 + 重连补发
        │   ├── scheduler.js       ← 定时调度（用户任务 + 系统任务 + 超时）
        │   ├── tool-runner.js     ← 工具引擎（权限过滤 + 路径安全 + 超时）
        │   ├── audit.js           ← 审计日志（工具调用/权限拒绝/路径违规）
        │   └── builtin-tools.js   ← 7 个内置文件/网络工具
        ├── routes/
        │   ├── chat.js            ← POST /api/chat, POST /api/chat/stream
        │   ├── rooms.js           ← 房间 CRUD
        │   ├── agents.js          ← Agent 信息
        │   ├── admin.js           ← 管理 API（状态/工具/LLM/身份/定时/MCP/审计）
        │   ├── memory.js          ← 记忆 API（摘要/里程碑/计划）
        │   └── knowledge.js       ← 知识库 CRUD + 搜索
        └── public/                ← 聊天前端 SPA
              ├── index.html
              ├── app.js           ← Vanilla JS SPA（~520 行）
              ├── style.css
              └── marked.min.js
```

---

## 4. 五层架构详解

### 层 1: 配置层（Configuration）

```
link.config.js          ← 用户编写：战友、LLM、认证、记忆参数
data/*.json             ← 运行时持久化（管理面板可写），含 mcp-config.json
data/mcp-config.json    ← MCP Server 配置（管理面板直接编辑）
agents/{id}/*.md        ← 战友身份定义（可在线编辑）
tools/*.yaml            ← 自定义工具定义
skills/*.yaml           ← Skill 编排（内置 3 个 + 用户自定义）
```

### 层 2: 启动层（Bootstrap）

`bin/link` 按顺序完成：

```
1. 读取 link.config.js
2. 初始化 LLM 模块（从 data/llm-config.json 或 link.config.js 读取配置）
3. 初始化记忆系统（MemoryStorage）
4. 初始化工具注册表
   → 注册内置工具（read_file / write_file / append_file / list_dir / search_content / get_date / web_search / fetch_url）
   → 加载 tools/*.yaml → YamlLoader 解析并注册
   → 加载 skills/*.yaml → 注册到 SkillRegistry
   → scanCommunityPackages() 扫描 @link/skill-* 社区包
   → 连接 MCP Servers（后台异步，不阻塞启动）
5. 读取 Agent 配置（link.config.js → data/agents-config.json 覆盖）
6. 构建上下文（buildContext）
7. 启动 Gateway（Express + SSE + Scheduler）
```

### 层 3: 网关层（Gateway）

```
Express 服务器 (port 3000)
  │
  ├── 静态文件服务 → 聊天前端 (public/)
  ├── 静态文件服务 → 管理面板 (admin-ui/dist/ 或 public/admin.html)
  │
  ├── REST API 路由
  │   ├── POST /api/chat              同步聊天
  │   ├── POST /api/chat/stream       SSE 流式聊天
  │   ├── GET/POST/DELETE /api/rooms  房间管理
  │   ├── GET /api/agents              Agent 信息
  │   ├── GET/POST /api/knowledge/*   知识库
  │   ├── GET/PUT/POST/DELETE /api/memory/* 记忆/计划
  │   ├── GET/PUT/POST/DELETE /api/admin/* 管理操作
  │   └── GET/DELETE /api/admin/audit-log 审计日志
  │
  ├── MCP 状态 API
  │   └── GET /api/admin/mcp-servers  MCP 连接状态
  │
  ├── SSE 端点
  │   ├── GET /api/events             实时事件推送
  │   └── GET /api/events/missed      断线补发
  │
  ├── 认证中间件
  │   ├── 优先级 1: link.config.js 的 admin.username/password
  │   ├── 优先级 2: 环境变量 ADMIN_USERNAME / ADMIN_PASSWORD
  │   └── 优先级 3: 自动生成一次性密码（启动时打印）
  │
  └── 后台调度器
      └── setInterval 每 30s tick → 检查定时任务
```

### 层 4: 运行时层（Runtime）

```
┌──────────────────────────────────────────────────────────┐
│                  运行时层（Runtime Layer）                  │
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────────┐    │
│  │  @link/registry      │  │  @link/memory            │    │
│  │                      │  │                         │    │
│  │  ToolRegistry        │  │  MemoryStorage           │    │
│  │  ├─ register()       │  │  ├─ 日摘要 .md          │    │
│  │  ├─ execute()        │  │  ├─ 周摘要 .md          │    │
│  │  ├─ getAllDefinitions│  │  ├─ 里程碑 .md          │    │
│  │  └─ list()           │  │  └─ 归档 .md            │    │
│  │                      │  │                         │    │
│  │  SkillRegistry       │  │  Pipeline                │    │
│  │  ├─ 注册/执行        │  │  ├─ generateDailySummary│    │
│  │  ├─ isAllowed()      │  │  ├─ generateWeeklyDigest│    │
│  │  └─ {{ref}} 传参    │  │  └─ archive              │    │
│  │                      │  │                         │    │
│  │  MCPBridge           │  │  Context Builder        │    │
│  │  ├─ connectServer()  │  │  └─ 摘要+身份+计划→LLM │    │
│  │  ├─ 发现/注册工具   │  └─────────────────────────┘    │
│  │  └─ 断线重连        │                                │
│  │                      │                                │
│  │  执行器:             │                                │
│  │  ├─ command.js       │                                │
│  │  ├─ http.js          │                                │
│  │  └─ ssh.js           │                                │
│  └─────────────────────┘                                │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  @link/llm                                       │    │
│  │                                                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │    │
│  │  │ index.js │  │ format.js│  │ providers/     │ │    │
│  │  │ call()   │  │ buildBody│  │ openclaw.js    │ │    │
│  │  │ stream() │  │ parseResp│  │ openai-compat  │ │    │
│  │  │ health() │  │ safeJSON │  │(MiniMax/DS/Qwen)│ │    │
│  │  └──────────┘  └──────────┘  └────────────────┘ │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────┐         │
│  │  @link/knowledge                             │         │
│  │  ├─ storage.js (gray-matter 笔记)            │         │
│  │  ├─ indexer.js (knowledge_index.json)        │         │
│  │  └─ search.js (标题×10 / 标签×5 / 描述×3)   │         │
│  └─────────────────────────────────────────────┘         │
│                                                          │
│  ┌─────────────────────────────────────────────┐         │
│  │  @link/gateway/lib                           │         │
│  │  ├─ tool-runner.js (权限过滤+路径安全+超时) │         │
│  │  ├─ builtin-tools.js (7个内置工具)          │         │
│  │  └─ audit.js (工具调用日志记录)              │         │
│  └─────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

### 层 5: 前端层（Frontend）

```
┌──────────────────────────────────────────────────────────┐
│                     前端层（Frontend Layer）                │
│                                                          │
│  💬 聊天界面（/）                    ⚙️ 管理面板（/admin）│
│  ────────────────────                ─────────────────── │
│  Vanilla JS SPA                       Vue 3 SPA           │
│  ~520 行                               11 个页面组件      │
│  SSE 打字机效果                         原子化 CSS          │
│  多房间切换                             模块化 JS           │
│  @提及路由                              import 语法         │
│  内置 store                             需构建（vite build）│
│  无构建步骤                                                │
│                                                          │
│  API 调用 → POST /api/chat/stream       API 调用 → /api/admin/*  │
│           + EventSource                              │
│                                                          │
│  共同依赖: marked.min.js（MD 渲染）                       │
└──────────────────────────────────────────────────────────┘
```

---

## 5. 核心数据流

### 5.1 用户聊天

```
用户输入
  │
  ▼
POST /api/chat/stream
  │
  ▼
handleAgents()  ─── 并行执行所有 Agent
  │
  ├── buildContext(memoryStorage)  ← 每次请求动态构建记忆上下文
  │     ├── 读取最近 7 天日摘要
  │     ├── 读取最近 2 周周摘要
  │     └── 读取 core_identity / period / weekly.md 等计划文件
  │
  ├── buildAgentPrompt() → 构建用户消息（含 SOUL.md / AGENTS.md）
  │
  ├── messages.unshift({ role: 'system', content: ctxSummary })  ← 上下文注入
  │
  ├── [Agent 1] callWithTools(agentId, messages, llmCall, toolRegistry, agentConfig, 0, audit)
  │     ├── _filterToolsByPermissions() → 白名单过滤
  │     ├── buildToolInstruction() → 注入工具指令（TOOLS.md 或兜底）
  │     ├── llmCall() → LLM API（180s 超时）
  │     ├── 有 tool_calls?
  │     │    ├── _isToolAllowed() → 权限检查
  │     │    ├── _checkPathSafety() → 路径安全检查
  │     │    ├── 串行执行每个工具（60s 超时）
  │     │    ├── 结果截断（>10000 字符）
  │     │    ├── audit.toolCall() / audit.permissionDenied() / audit.pathViolation()
  │     │    └── 再调 LLM（最多 5 轮递归）
  │     └── 无 tool_calls → 返回文本
  │
  ├── [Agent N] callWithTools()  ← 并行
  │
  ├── SSE 推回前端
  └── appendBatch() → rooms.json 持久化
```

### 5.2 定时任务

```
scheduler._tick()  （每 30 秒）
  │
  ├── _loadSchedules() → 读取 data/schedules-config.json
  │
  ├── [用户任务] _execute()
  │     ├── buildContext() → 构建记忆上下文（与聊天流程一致）
  │     ├── 加载 Agent 的 SOUL.md / AGENTS.md
  │     ├── 构建带 system prompt 的 messages
  │     ├── executeWithTools(agentId, messages) → LLM 调用（120s 超时）
  │     ├── showInChat? → SSE 广播到房间
  │     └── 不写房间历史
  │
  └── [系统任务] _executeSystem()
        ├── daily_summary (23:50)
        │     └── pipeline.generateDailySummary()
        │
        ├── weekly_digest (周日 23:52)
        │     └── pipeline.generateWeeklyDigest()
        │
        └── archive (周日 23:59)
              └── pipeline.archive()
```

### 5.3 记忆上下文注入

```
chat.js handleAgents()
  │
  ├── buildContext(memoryStorage)  ← 每次请求动态构建
  │     │
  │     ├── 读取最近 7 天日摘要
  │     ├── 读取最近 2 周周摘要
  │     ├── 读取 data/user-md-content.md（用户身份）
  │     ├── 读取 data/core_identity.md（核心身份）
  │     ├── 读取 data/period.md（阶段计划）
  │     └── 读取 data/weekly.md（本周计划）
  │
  ├── buildAgentPrompt() → 构建用户消息
  │
  └── messages.unshift({ role: 'system', content: ctxSummary })  ← 注入
        →
        callWithTools(agentId, messages, ...)
```

**注入位置**：chat.js 的 `handleAgents()` 中，先构建 `ctxSummary`，再通过 `messages.unshift()` 注入到头部作为 system prompt。**不是在 tool-runner 中注入**，而是在调用 `callWithTools` 之前就完成。

**scheduler 用户任务同样注入上下文**：用户定时任务在 `_execute()` 中也通过 `buildContext()` 构建上下文并注入，与聊天流程完全一致。

---

## 6. 工具调用链路

```
┌────────────────────────────────────────────────────────────────────┐
│                        工具调用完整链路                             │
│                                                                    │
│  start                                                             │
│    │                                                               │
│    ▼                                                               │
│  _filterToolsByPermissions(allDefinitions, allowedTools)           │
│    │   ← 白名单过滤：只保留 agent.tools 中允许的工具                │
│    │   ← 没配 tools = 空数组 = 没有任何工具可用                     │
│    │                                                               │
│    ▼                                                               │
│  buildToolInstruction(tools) → 注入 system message                 │
│    │   ← 优先使用 agents/{id}/TOOLS.md                             │
│    │   ← 无 TOOLS.md 但有工具 → 注入兜底格式指令                    │
│    │                                                               │
│    ▼                                                               │
│  llmCall(agentId, messages, tools)        ← 180s 超时              │
│    │                                                               │
│    ├── buildBody({ model, messages, tools, maxTokens })             │
│    ├── httpRequest(url, body, opts)                                │
│    │     └── 指数退避重试（500ms → 1000ms → 2000ms）               │
│    └── parseResponse(data) → { content, tool_calls }               │
│                                                                    │
│  ┌── 有 tool_calls? ──┐                                            │
│  │                    │                                            │
│  否                  是                                            │
│  │                    │                                            │
│  ▼                    ▼                                            │
│  返回文本             遍历每个 tool_call                             │
│                         │                                          │
│                         ├── _isToolAllowed() → 权限检查             │
│                         │   ├── 无权 → 返回错误消息 + audit记录     │
│                         │   └── 有权 → 继续执行                     │
│                         │                                          │
│                         ├── _checkPathSafety() → 路径安全           │
│                         │   ├── 黑名单（/etc /sys /proc 等）→ 拒绝  │
│                         │   ├── 相对路径 → 拒绝（必须绝对路径）     │
│                         │   └── workspace 外 → 拒绝                 │
│                         │                                          │
│                         ├── toolRegistry.execute(name, args)       │
│                         │   ├── builtin → read_file / write_file 等│
│                         │   ├── YAML   → command / http / ssh      │
│                         │   └── MCP    → MCPBridge._callTool()    │
│                         │                                          │
│                         └── audit.toolCall() → 记录到 audit.log    │
│                                                                    │
│  → 再调 LLM（180s 超时）                                           │
│    ├── 还有 tool_calls? → 递归（最多 5 轮）                         │
│    └── 无 → 返回最终文本                                            │
└────────────────────────────────────────────────────────────────────┘
```

### 路径安全策略

```
_checkPathSafety(resolvedPath)
  │
  ├── 相对路径（无 / 或盘符）→ 拒绝："请使用绝对路径"
  ├── 系统敏感路径（/etc /sys /proc /C:\Windows 等）→ 拒绝
  └── workspace 外路径 → 拒绝
```

### 执行器安全

| 执行器 | 安全措施 |
|--------|---------|
| command.js | 所有 `{{param}}` 用 shell 单引号包裹，防止命令注入 |
| ssh.js | 改用 `spawn` + 参数数组，`shell: false` |
| http.js | DNS 解析后比对内网 IP 黑名单 |

### 内置工具（7 个）

| 工具名 | 功能 |
|--------|------|
| `read_file` | 读取文件（最多 5000 字符截断） |
| `write_file` | 写入文件（覆盖） |
| `append_file` | 追加到文件尾部 |
| `list_dir` | 列出目录内容 |
| `search_content` | 在文件中搜索关键词 |
| `get_date` | 获取当前日期时间 |
| `web_search` | DuckDuckGo 零点击搜索 |
| `fetch_url` | 抓取网页内容（最多 3000 字符） |

---

## 7. 记忆系统管道

```
┌────────────────────────────────────────────────────────────┐
│                    四层记忆压缩                              │
│                                                            │
│  第一层: 原始消息                                           │
│  ┌─────────────────────────────────────────────────┐      │
│  │ rooms.json                                       │      │
│  │ 每个房间最多保留 500 条消息                       │      │
│  │ 超出时截断头部，生成摘要                          │      │
│  └─────────────────────────────────────────────────┘      │
│           │  (每天 23:50, ≥3 条消息)                      │
│           ▼                                               │
│                                                            │
│  第二层: 日摘要                                            │
│  ┌─────────────────────────────────────────────────┐      │
│  │ data/daily-summary/2026-07-03.md                 │      │
│  │ LLM 按"技术/情绪/方向"三维度生成                  │      │
│  │ 保留 14 天                                        │      │
│  └─────────────────────────────────────────────────┘      │
│           │  (每周日 23:52，汇总 7 天)                    │
│           ▼                                               │
│                                                            │
│  第三层: 周摘要                                            │
│  ┌─────────────────────────────────────────────────┐      │
│  │ data/digest/2026-W27.md                         │      │
│  │ LLM 包含"本周节奏/关键决策/下周预告"             │      │
│  │ 保留 52 周                                        │      │
│  └─────────────────────────────────────────────────┘      │
│           │  (每周日 23:59)                               │
│           ▼                                               │
│                                                            │
│  第四层: 归档                                              │
│  ┌─────────────────────────────────────────────────┐      │
│  │ data/archive.md                                  │      │
│  │ 永远保留                                          │      │
│  └─────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────┘
```

---

## 8. 安全防护矩阵

| 攻击面 | 防护措施 | 状态 |
|--------|---------|------|
| **命令注入** | command.js: 单引号转义；ssh.js: spawn + 参数数组 | ✅ |
| **SSRF** | http.js: DNS 解析 + IP 前缀黑名单 | ✅ |
| **路径遍历** | 校验绝对路径要求 + `isAgentDir()` 检查 | ✅ |
| **路径黑名单** | `/etc` `/sys` `/proc` `C:\Windows` 等阻断 | ✅ |
| **相对路径注入** | tool-runner 拒绝非绝对路径 | ✅ |
| **XSS** | 前端 `h()` 转义；Vue 自动转义；`textContent` 优先 | ✅ |
| **API 认证** | Basic Auth（config → 环境变量 → 随机密码） | ✅ |
| **工具权限** | 白名单模式，没配置 = 没权限，运行时强制检查 | ✅ |
| **API Key 泄漏** | 支持 `LLM_API_KEY` 环境变量覆盖 | ✅ |
| **审计日志** | 所有工具调用/权限拒绝/路径违规记录到 `data/audit.log` | ✅ |

---

## 9. Agent 权限管控

Agent 的权限管理基于**白名单模式**，在 `agents-config.json` 中配置：

```json
{
  "id": "coach",
  "name": "教练",
  "tools": ["read_file", "write_file", "search_knowledge"],
  "skills": ["knowledge_search"]
}
```

### 工具权限

| 配置 | 行为 |
|------|------|
| `tools: ["read_file", "write_file"]` | 只允许使用这 2 个工具 |
| `tools: []` | **没有任何工具权限** |
| 不配 `tools` 字段 | **没有任何工具权限**（新系统默认无权限）|

### Skill 权限

| 方法 | 说明 |
|------|------|
| `skillRegistry.isAllowed(name, allowedSkills)` | 检查 Agent 是否有权执行指定 Skill |
| 未配置 `skills` | 允许所有 Skill（向后兼容）|

### 权限拒绝链路

```
Agent 调用了未授权的工具
  │
  ▼
_isToolAllowed() → false
  │
  ▼
返回 LLM："错误：你没有使用工具 xxx 的权限"
  │
  ▼
audit.permissionDenied(agentId, toolName, args) → data/audit.log
```

---

## 10. 审计日志

审计日志记录在 `data/audit.log`，每行一个 JSON 对象。

### 日志类型

| 类型 | 触发条件 | 记录内容 |
|------|---------|---------|
| `tool_call` | 工具执行成功/失败 | agent, tool, args, ok, result |
| `permission_denied` | Agent 调用未授权工具 | agent, tool, args |
| `path_violation` | 尝试访问禁止的路径 | agent, tool, path |

### 日志格式

```json
{"type":"tool_call","agent":"coach","tool":"write_file","args":{"path":"test.md"},"ok":true,"result":"ok","time":"2026-07-04T19:00:00.000Z"}
{"type":"permission_denied","agent":"friend","tool":"write_file","args":{},"time":"2026-07-04T19:00:01.000Z"}
{"type":"path_violation","agent":"coach","tool":"read_file","path":"/etc/passwd","time":"2026-07-04T19:00:02.000Z"}
```

### API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/audit-log` | 获取最近 200 条记录（倒序） |
| DELETE | `/api/admin/audit-log` | 清空审计日志 |

---

## 11. MCP Bridge

MCP (Model Context Protocol) 让 LINK 连接标准 MCP Server，自动发现并注册工具。

### 架构

```
LINK ToolRegistry
      │
      ▼
MCPBridge.connectServer(config)
      │
      ├── Client() → StdioClientTransport(config.command, config.args)
      ├── client.listTools() → 发现工具
      │
      └── 注册到 ToolRegistry（工具名格式: {serverName}/{toolName}）
            │
            ▼
      LLM → callWithTools → toolRegistry.execute("filesystem/read_file", args)
                                  │
                                  ▼
                            MCPBridge._callTool(serverName, toolName, args)
                                  │
                                  ▼
                            MCP Server
```

### 配置方式

**link.config.js：**
```js
mcpServers: [
  {
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  },
]
```

**管理面板 → 🤝 MCP 页面**（保存到 `data/mcp-config.json`）

### 特性

| 特性 | 说明 |
|------|------|
| 后台连接 | 不阻塞服务器启动 |
| 自动发现 | 连接后自动 `listTools()`，注册到 ToolRegistry |
| 断线重连 | 断开后 5s 自动重连 |
| 优雅关闭 | 服务器停止时自动 `disconnectAll()` |

---

## 12. Skill 系统

Skill（原"工作流"）是多步骤工具编排。用户可以写 YAML 定义 Skill，或下载社区包。

### 内置 Skill

| 名称 | 描述 | 步骤 |
|------|------|------|
| `daily_news` | 知识日报 | search_knowledge → write_file |
| `knowledge_search` | 知识搜索 | search_knowledge → write_file |
| `file_organizer` | 文件整理 | list_dir → write_file |

### Skill YAML 格式

```yaml
name: daily_news
description: 知识日报 — 搜索知识库并保存为笔记
steps:
  - tool: search_knowledge
    name: search
    params:
      query: "{{topic}}"
  - tool: write_file
    params:
      path: "./daily-{{date}}.md"
      content: "# 日报\n\n{{steps.search.result}}"
```

### 社区包

`@link/skill-*` 包自动被 `package-scanner.js` 扫描加载，放入 `node_modules/@link/skill-*` 即可自动注册。

---

## 13. 当前不足与改进方案

### 13.1 rooms.json 长期运行膨胀

**问题：** `rooms.json` 文件包含所有历史消息，长时间运行后文件可能达到上百 MB。【可选择手动删除早期聊天记录，类似清空微信聊天记录】

| 优先级 | 建议 | 工作量 |
|--------|------|--------|
| P1 | _save() 时只保存截断后的历史 | 小 |
| P2 | 为历史文件加定期清理/压缩 | 中 |

### 13.2 前端聊天界面脆弱

**问题：** `app.js`（~520 行）是手写的 Vanilla JS SPA，SSE 流处理逻辑不易维护。

| 优先级 | 建议 | 工作量 |
|--------|------|--------|
| P1 | 用 Vue 3 重写聊天前端（统一技术栈） | 中 |
| P2 | 添加消息重试/断线重连心跳 | 小 |

### 13.3 无 TypeScript

| 优先级 | 建议 | 工作量 |
|--------|------|--------|
| P2 | 核心接口加 JSDoc 类型注释 | 中 |
| P3 | 逐步迁移到 TypeScript | 大 |


### 13.4 改进路线图

```
短期（1-2 天）
  ├── ✅ 工具执行超时
  ├── ✅ 记忆上下文注入
  ├── ✅ 路径黑名单 + 安全校验
  ├── ✅ 白名单权限管控
  ├── ✅ MCP 协议集成
  ├── ✅ 外部知识库支持
  ├── ✅ 指数退避重试 + 中间件管道
  └── ✅ vitest 测试框架已引入并使用

中期（1-2 周）
  |—— ⬜ 启动终端界面不够美观而且偶尔有bug
  ├── ⬜ 聊天前端 Vue 3 迁移
  └── ⬜ 工具调用单元测试覆盖


长期（1 个月+）
  ├── ⬜ 端到端测试
  └── ⬜ 渐进式 TypeScript 迁移
```

---

> 本文档随项目同步更新。每次架构变更后请更新对应的模块描述和数据流图。
