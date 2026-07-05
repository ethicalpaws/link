# CHANGELOG

## 0.1.0 (2026-07-03)

### 新增
- 🎯 模块化架构：7 个独立包（llm、memory、gateway、registry、knowledge、admin-ui、create-link-app）
- 🧠 LLM 适配器：支持 OpenClaw / OpenAI 兼容格式（MiniMax、DeepSeek 等），断路器 + 健康检查
- 🤖 Agent Runtime：tool_call 循环引擎，支持串行/并行工具执行
- 📅 四层记忆压缩：日摘要 → 周摘要 → 归档 → 里程碑，自动上下文恢复
- 💬 Web 群聊界面：SSE 流式响应、多房间、@路由、打字机效果
- 🔧 工具插槽系统：ToolRegistry + YAML 配置 + 社区包扫描
- ⚙️ 管理面板：浏览器配置战友、工具、模型、计划、身份
- 📦 CLI 脚手架：npm create link-app 一键生成项目骨架
- 🗂️ 战友目录：SOUL.md / AGENTS.md / TOOLS.md / USER.md 四文件身份定义
- 🔒 管理面板 Basic Auth 认证

### 修复
- 流式调用不支持时自动降级为非流式
- 端口冲突友好提示，不再抛堆栈
- Ctrl+C 优雅关闭
- streaming 模式下历史对话丢失导致失忆
- Agent 不知道自己名字和 ID
- 前端显示 `<think>` 思考标签过滤
- 未 @ 时所有 AutoReply Agent 回应（不再受"在场"勾选影响）
- _example.yaml 模板不被当成工具加载
