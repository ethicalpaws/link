/**
 * LINK · 系统配置文件
 *
 * 修改此文件后重启生效：npm start
 * 你也可以在 http://localhost:3000/admin 浏览器中配置
 */

module.exports = {
  port: 3000,

  // ─── AI 战友 ──────────────────────────────
  agents: [
    {
      id: 'coach',
      name: '教练',
      emoji: '🎯',
      color: '#85c1e9',
      prompt: '你是我的成长教练。帮我拆解目标、跟踪进度、保持动力。',
      autoReply: true,
    },
    {
      id: 'friend',
      name: '朋友',
      emoji: '🌻',
      color: '#c39bd3',
      prompt: '你是一个温暖的朋友。陪我聊天，听我倾诉。',
      autoReply: false,
    },
  ],

  // ─── 管理面板认证 ────────────────────────
  // 安全提示：默认自动生成随机密码，启动时打印在控制台。
  // 也可以设置环境变量 ADMIN_USERNAME / ADMIN_PASSWORD，或取消注释下方配置：
  // admin: {
  //   username: 'admin',
  //   password: 'your-password',
  // },

  // ─── LLM 模型 ─────────────────────────────
  llm: {
    primary: {
      provider: 'openclaw',
      baseUrl: process.env.OPENCLAW_URL || 'http://localhost:10675',
      token: process.env.OPENCLAW_TOKEN || '',
    },
  },

  // ─── 记忆系统 ─────────────────────────────
  memory: {
    dailySummaryDays: 7,
    maxHistoryPerRoom: 500,
  },

  // ─── MCP Server（可选）────────────────────
  // 系统启动时自动连接 MCP Server，暴露的工具自动注册为 LINK 工具
  // 每个工具名格式: {serverName}/{toolName}
  // mcpServers: [
  //   {
  //     name: 'filesystem',
  //     command: 'npx',
  //     args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  //   },
  // ],
};
