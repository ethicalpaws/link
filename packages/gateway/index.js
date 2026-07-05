/**
 * LINK Gateway · 服务器入口
 */

const express = require('express');
const path = require('path');
const { SSEBus } = require('./lib/sse-bus');
const { RoomManager } = require('./lib/room-manager');
const { createRoomRoutes } = require('./routes/rooms');
const { createChatRoute } = require('./routes/chat');
const { createAgentRoutes } = require('./routes/agents');
const { createMemoryRoutes } = require('./routes/memory');
const { createAdminRoutes } = require('./routes/admin');
const { createKnowledgeRoutes } = require('./routes/knowledge');
const { registerBuiltinTools } = require('./lib/builtin-tools');
const { PushScheduler } = require('./lib/scheduler');
const { callWithTools } = require('./lib/tool-runner');
const audit = require('./lib/audit');

function createServer(config) {
  const {
    port = 3000, agents = [], agentMap = {}, dataDir,
    maxHistoryPerRoom = 500, defaultActiveAgents = [],
    llmCall,
    staticDir, memoryStorage, toolRegistry, skillRegistry,
    knowledgeDir,
    toolsDir, workspaceDir, adminAuth, mcpBridge,
  } = config;

  const app = express();
  const sseBus = new SSEBus();
  const roomManager = new RoomManager({ dataDir, maxHistoryPerRoom, defaultActiveAgents });
  const schedulesFile = dataDir ? path.join(dataDir, 'schedules-config.json') : null;

  // scheduler 使用的工具执行函数（包装成 llmCall 兼容形式）
  const executeWithTools = toolRegistry
    ? function(agentId, messages) { return callWithTools(agentId, messages, llmCall, toolRegistry); }
    : null;

  const scheduler = new PushScheduler({ configFile: schedulesFile, sseBus, roomManager, executeWithTools, memoryStorage, llmCall, agentMap });
  if (dataDir) audit.init(dataDir);

  if (toolRegistry) {
    registerBuiltinTools(toolRegistry);
    console.log('   🔧 内置工具: 已注册 (' + toolRegistry.size + ' 个)');
    if (toolsDir) { const { YamlLoader } = require('@link/registry'); new YamlLoader(toolRegistry).loadFromDir(toolsDir); }
  }

  app.use(express.json({ limit: '10mb' }));
  const publicDir = staticDir || path.join(__dirname, 'public');
  app.use(express.static(publicDir));

  // 服务 admin-ui 静态资源（拆分后的 CSS/JS 文件）
  const adminUiDir = path.join(__dirname, '..', 'admin-ui', 'public');
  app.use('/admin', express.static(adminUiDir));

	const crypto = require('crypto');

  /** 生成 Basic Auth 中间件 */
  function _makeBasicAuth(username, password) {
    return (req, res, next) => {
      const h = req.headers.authorization;
      if (!h || !h.startsWith('Basic ')) { res.set('WWW-Authenticate', 'Basic realm="LINK Admin"'); return res.status(401).json({ error: '需要认证' }); }
      const [u, pwd] = Buffer.from(h.slice(6), 'base64').toString().split(':');
      if (u === username && pwd === password) return next();
      res.set('WWW-Authenticate', 'Basic realm="LINK Admin"'); res.status(401).json({ error: '用户名或密码错误' });
    };
  }

  if (adminAuth?.username && adminAuth?.password) {
    // 优先级 1: link.config.js 中配置的用户名密码
    const basicAuth = _makeBasicAuth(adminAuth.username, adminAuth.password);
    app.use('/admin', basicAuth); app.use('/api/admin', basicAuth);
    console.log('   🔒 管理面板: 已启用密码保护');
  } else if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    // 优先级 2: 环境变量 ADMIN_USERNAME / ADMIN_PASSWORD
    const basicAuth = _makeBasicAuth(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
    app.use('/admin', basicAuth); app.use('/api/admin', basicAuth);
    console.log('   🔒 管理面板: 已启用密码保护（$ADMIN_USERNAME/$ADMIN_PASSWORD）');
  } else {
    // 优先级 3: 自动生成一次性密码
    const autoUser = 'admin';
    const autoPass = crypto.randomBytes(4).toString('hex');
    const basicAuth = _makeBasicAuth(autoUser, autoPass);
    app.use('/admin', basicAuth); app.use('/api/admin', basicAuth);
    console.log('   🔒 管理面板: 已启用密码保护');
    console.log(`   ┌──────────────────────────────────────┐`);
    console.log(`   │  用户: admin                          │`);
    console.log(`   │  密码: ${autoPass.padEnd(33)}│`);
    console.log(`   └──────────────────────────────────────┘`);
  }

  app.use('/api/rooms',  createRoomRoutes(roomManager));
  app.use('/api/chat',   createChatRoute({ roomManager, agents, agentMap, llmCall, memoryStorage, toolRegistry, audit }));
  app.use('/api/agents', createAgentRoutes(agents));
  if (knowledgeDir) {
    let kbs = [];
    const extConfigFile = path.join(path.dirname(knowledgeDir), 'external-knowledge.json');
    let extDirs = [];
    if (require('fs').existsSync(extConfigFile)) {
      try { const ext = JSON.parse(require('fs').readFileSync(extConfigFile, 'utf-8')); extDirs = ext.dirs || []; } catch {}
    }
    const allDirs = [knowledgeDir, ...extDirs];
    app.use('/api/knowledge', createKnowledgeRoutes(allDirs));
    console.log('   📚 知识库: ' + knowledgeDir + (extDirs.length > 0 ? ' + ' + extDirs.length + ' 个外部目录' : ''));
    if (toolRegistry) {
      toolRegistry.register({
        name: 'search_knowledge',
        description: '搜索知识库中的笔记，返回匹配的笔记列表',
        parameters: { query: { type: 'string', description: '搜索关键词', required: true } },
        execute: async function(args) {
          try {
            if (kbs.length === 0) {
              const m = require('@link/knowledge');
              for (const dir of allDirs) kbs.push(m.createKnowledgeBase(dir));
            }
            const allResults = [];
            for (const kb of kbs) {
              const results = kb.search.search(args.query || '', { limit: 5 });
              allResults.push(...results.map(function(r){ return { title: r.title, path: r.path, tags: r.tags, summary: (r.summary||'').slice(0,100) }; }));
            }
            return JSON.stringify(allResults);
          } catch(e) { return '搜索失败: ' + e.message; }
        }
      });
    }
  }
  if (memoryStorage) { app.use('/api/memory', createMemoryRoutes(memoryStorage)); console.log('   记忆系统: 已连接'); }
  app.use('/api/admin', createAdminRoutes({ toolRegistry, skillRegistry, agents, memoryStorage, dataDir, toolsDir, workspaceDir, mcpBridge }));

  // MCP 状态 API
  if (mcpBridge) {
    app.get('/api/admin/mcp-servers', (req, res) => {
      try { res.json({ servers: mcpBridge.getStatus() || {} }); } catch(err) { res.status(500).json({ error: err.message }); }
    });
  }

  // 优先使用 Vue 构建产物（admin-ui/dist/），其次回退到旧版静态 admin.html
  const adminDist = path.join(__dirname, '..', 'admin-ui', 'dist');
  const adminDistHtml = path.join(adminDist, 'index.html');
  if (require('fs').existsSync(adminDistHtml)) {
    app.use('/admin', express.static(adminDist));
    app.get('/admin', (req, res) => res.sendFile(adminDistHtml));
    app.get('/admin/*', (req, res) => res.sendFile(adminDistHtml));
    console.log('   🎨 Admin UI (Vue): /admin');
  } else {
    const adminHtml = path.join(__dirname, '..', 'admin-ui', 'public', 'admin.html');
    if (require('fs').existsSync(adminHtml)) { app.get('/admin', (req, res) => res.sendFile(adminHtml)); console.log('   Admin UI: /admin (旧版)'); }
  }

  app.get('/api/events', (req, res) => {
    const roomId = req.query.roomId || null;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const keepAlive = setInterval(() => { try { res.write(':keepalive\n\n'); } catch (_) { clearInterval(keepAlive); } }, 30000);
    sseBus.add(res, roomId);
    req.on('close', () => { sseBus.remove(res); clearInterval(keepAlive); });
  });

  // 断线重连时补发遗漏事件
  app.get('/api/events/missed', (req, res) => {
    const since = parseInt(req.query.since) || 0;
    const roomId = req.query.roomId || null;
    res.json({ events: sseBus.getMissedEvents(since, roomId) });
  });

  const server = app.listen(port);
  server.on('listening', () => {
    console.log('\n🔗 LINK Gateway 运行中');
    console.log('   地址: http://localhost:' + port);
    console.log('   房间: ' + roomManager.list().length + ' 个已加载');
    scheduler.start();
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error('✗ 端口 ' + port + ' 已被占用');
    else console.error('✗ 启动失败: ' + err.message);
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log('\n  ↳ 收到 ' + signal + '，正在关闭...');
    scheduler.stop();
    server.close(() => { console.log('  ↳ ✓ 已关闭'); process.exit(0); });
    setTimeout(() => { console.error('  ↳ ✗ 强制退出'); process.exit(1); }, 5000);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { app, server, sseBus, roomManager, memoryStorage, scheduler };
}

module.exports = { createServer };
