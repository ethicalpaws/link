/**
 * LINK Gateway · 管理面板后端 API
 */

const { Router } = require('express');
const fs = require('fs');
const path = require('path');

/** 只允许字母、数字、下划线、短横线 */
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function isSafeFileName(name) {
  return SAFE_NAME_RE.test(name);
}

/** 验证路径是真正的 agent 目录（包含 SOUL.md 或 AGENTS.md 才算） */
function isAgentDir(dirPath) {
  try {
    return fs.existsSync(path.join(dirPath, 'SOUL.md')) ||
           fs.existsSync(path.join(dirPath, 'AGENTS.md'));
  } catch { return false; }
}

function createAdminRoutes({ toolRegistry, skillRegistry, agents, memoryStorage, dataDir, toolsDir, workspaceDir }) {
  const router = Router();

  const skillsDir = toolsDir ? path.join(path.dirname(toolsDir), 'skills') : null;

  // ─── 系统状态 ───

  router.get('/status', (req, res) => {
    try {
      res.json({
        agents: agents?.length || 0,
        tools: toolRegistry?.size || 0,
        skills: skillRegistry?.size || 0,
        memory: memoryStorage ? { dataDir: memoryStorage.dataDir, hasIdentity: fs.existsSync(path.join(memoryStorage.dataDir, 'core_identity.md')) } : null,
        uptime: process.uptime(),
      });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── 工具列表 ───

  router.get('/tools', (req, res) => {
    try {
      if (!toolRegistry) return res.json({ tools: [] });
      const tools = toolRegistry.list().map(name => { const t = toolRegistry.get(name); return { name: t.name, description: t.description || '', parameters: t.parameters || {}, source: t._fromMcp ? 'mcp' : (t._fromYaml ? 'yaml' : 'builtin') }; });
      res.json({ count: tools.length, tools });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── 创建工具文件 ───

  router.post('/tools', (req, res) => {
    try {
      const { name, config } = req.body;
      if (!name || !config) return res.status(400).json({ error: '缺少 name 或 config' });
      if (!toolsDir) return res.status(500).json({ error: '未配置工具目录' });
      if (!isSafeFileName(name)) return res.status(400).json({ error: '工具名只能包含字母、数字、下划线和短横线' });
      if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });
      const tmp = path.join(toolsDir, name + '.yaml.tmp');
      fs.writeFileSync(tmp, config, 'utf-8');
      fs.renameSync(tmp, path.join(toolsDir, name + '.yaml'));
      res.json({ success: true, file: name + '.yaml' });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── 技能列表 ───

  router.get('/skills', (req, res) => {
    try {
      if (!skillRegistry) return res.json({ skills: [] });
      const list = skillRegistry.list();
      const skills = list.map(name => {
        const s = skillRegistry.get(name);
        return { name: s.name, description: s.description || '', steps: s.steps?.map(st => st.tool).join(' → ') || '', stepCount: s.steps?.length || 0 };
      });
      res.json({ count: skills.length, skills });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── 创建工作流文件 ───

  router.post('/skills', (req, res) => {
    try {
      const { name, config } = req.body;
      if (!name || !config) return res.status(400).json({ error: '缺少 name 或 config' });
      if (!skillsDir) return res.status(500).json({ error: '未配置工作流目录' });
      if (!isSafeFileName(name)) return res.status(400).json({ error: '工作流名只能包含字母、数字、下划线和短横线' });
      if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
      const tmp = path.join(skillsDir, name + '.yaml.tmp');
      fs.writeFileSync(tmp, config, 'utf-8');
      fs.renameSync(tmp, path.join(skillsDir, name + '.yaml'));
      res.json({ success: true, file: name + '.yaml' });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── Agent 配置（纯 JSON，不含文件内容） ───

  router.get('/agents-config', (req, res) => {
    try {
      const file = dataDir ? path.join(dataDir, 'agents-config.json') : null;
      let agentList = [];
      if (file && fs.existsSync(file)) { try { const config = JSON.parse(fs.readFileSync(file, 'utf-8')); agentList = config.agents || []; } catch { agentList = agents || []; } }
      else { agentList = agents || []; }
      res.json({ exists: true, agents: agentList });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── 读取单个 Agent 的目录文件（SOUL.md / AGENTS.md / TOOLS.md） ───
  // 文件内容不再混入 agents-config.json，JSON 永远干净

  router.get('/agents/:id/files', (req, res) => {
    try {
      const { id } = req.params;
      if (!isSafeFileName(id)) return res.status(400).json({ error: '无效的 agent ID' });
      const ad = path.join(path.resolve(dataDir, '..'), 'agents', id);
      const result = {};
      for (const [key, fname] of [['soul', 'SOUL.md'], ['agents', 'AGENTS.md'], ['toolsmd', 'TOOLS.md'], ['heartbeat', 'HEARTBEAT.md']]) {
        const f = path.join(ad, fname);
        result[key] = fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : '';
      }
      res.json(result);
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/agents-config', (req, res) => {
    try {
      const { agents: newAgents, writeFiles } = req.body;
      if (!newAgents || !Array.isArray(newAgents)) return res.status(400).json({ error: '无效配置' });
      if (!dataDir) return res.status(500).json({ error: '未配置 dataDir' });

      // 找出被删除的战友，清理目录和 workspace（失败不阻断保存）
      if (agents && agents.length > 0) {
        const newIds = (newAgents || []).map(a => a.id);
        for (const old of agents) {
          if (!newIds.includes(old.id) && isSafeFileName(old.id)) {
            const ad = path.join(path.resolve(dataDir, '..'), 'agents', old.id);
            const wd = path.join(workspaceDir || path.resolve(dataDir, '..', 'workspace'), old.id);
            for (const d of [ad, wd]) {
              try { if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* 忽略清理失败，不阻断主流程 */ }
            }
          }
        }
      }

      // 写战友目录文件（带路径白名单校验）
      if (writeFiles?.id) {
        if (!isSafeFileName(writeFiles.id)) return res.status(400).json({ error: '无效的战友 ID' });
        const agentDir = path.join(path.resolve(dataDir, '..'), 'agents', writeFiles.id);
        fs.mkdirSync(agentDir, { recursive: true });
        if (writeFiles.soul !== undefined) {
          const tmp = path.join(agentDir, 'SOUL.md.tmp');
          fs.writeFileSync(tmp, writeFiles.soul || '', 'utf-8');
          fs.renameSync(tmp, path.join(agentDir, 'SOUL.md'));
        }
        if (writeFiles.agents !== undefined) {
          const tmp = path.join(agentDir, 'AGENTS.md.tmp');
          fs.writeFileSync(tmp, writeFiles.agents || '', 'utf-8');
          fs.renameSync(tmp, path.join(agentDir, 'AGENTS.md'));
        }
        // toolsmd 只在明确传入时才写入，避免空值覆盖已有内容
        if ('toolsmd' in writeFiles) {
          const tmp = path.join(agentDir, 'TOOLS.md.tmp');
          fs.writeFileSync(tmp, writeFiles.toolsmd || '', 'utf-8');
          fs.renameSync(tmp, path.join(agentDir, 'TOOLS.md'));
        }
        if ('heartbeat' in writeFiles) {
          const tmp = path.join(agentDir, 'HEARTBEAT.md.tmp');
          fs.writeFileSync(tmp, writeFiles.heartbeat || '', 'utf-8');
          fs.renameSync(tmp, path.join(agentDir, 'HEARTBEAT.md'));
        }
      }

      // 最后写配置文件（原子写入）
      const configFile = path.join(dataDir, 'agents-config.json');
      const tmp = configFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ agents: newAgents }, null, 2), 'utf-8');
      fs.renameSync(tmp, configFile);
      res.json({ success: true, count: newAgents.length });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── LLM Provider ───

  router.get('/llm-config', (req, res) => {
    try {
      const file = dataDir ? path.join(dataDir, 'llm-config.json') : null;
      if (!file || !fs.existsSync(file)) return res.json({ exists: false, config: null });
      try { const config = JSON.parse(fs.readFileSync(file, 'utf-8')); res.json({ exists: true, config }); } catch { res.json({ exists: false, config: null }); }
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/llm-config', (req, res) => {
    try {
      const { provider, apiKey, model, baseUrl } = req.body;
      if (!provider) return res.status(400).json({ error: '请选择 provider' });
      if (!dataDir) return res.status(500).json({ error: '未配置 dataDir' });
      const file = path.join(dataDir, 'llm-config.json');
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ provider, apiKey: apiKey || '', model: model || '', baseUrl: baseUrl || '' }, null, 2), 'utf-8');
      fs.renameSync(tmp, file);
      res.json({ success: true, provider });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── 核心身份 (core_identity.md) ───

  router.get('/identity', (req, res) => {
    try {
      if (!dataDir) return res.json({ exists: false, content: '' });
      const file = path.join(dataDir, 'core_identity.md');
      try { if (!fs.existsSync(file)) return res.json({ exists: false, content: '' }); res.json({ exists: true, content: fs.readFileSync(file, 'utf-8') }); }
      catch { res.json({ exists: false, content: '' }); }
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/identity', (req, res) => {
    try {
      const { content } = req.body;
      if (!dataDir) return res.status(500).json({ error: '未配置 dataDir' });
      const file = path.join(dataDir, 'core_identity.md');
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, content || '', 'utf-8');
      fs.renameSync(tmp, file);
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/user-md', (req, res) => {
    try {
      if (!dataDir) return res.json({ content: '' });
      const file = path.join(dataDir, 'user-md-content.md');
      const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
      res.json({ content });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/user-md', (req, res) => {
    try {
      const { content } = req.body;
      if (!dataDir) return res.status(500).json({ error: '未配置 dataDir' });
      const file = path.join(dataDir, 'user-md-content.md');
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, content || '', 'utf-8');
      fs.renameSync(tmp, file);
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── 定时任务 ───

  const schedulesFile = dataDir ? path.join(dataDir, 'schedules-config.json') : null;
  function getDefaultSchedules() {
    const id = agents?.[0]?.id || '';
    return [
      { hour: 8, minute: 0, agent: id, prompt: '早安！今天有什么安排？', desc: '早安提醒' },
      { hour: 21, minute: 0, agent: id, prompt: '今天过得怎么样？来回顾一下吧。', desc: '晚间回顾' },
    ];
  }
  router.get('/schedules', (req, res) => {
    try {
      if (!schedulesFile || !fs.existsSync(schedulesFile)) return res.json({ schedules: getDefaultSchedules() });
      try { const d = JSON.parse(fs.readFileSync(schedulesFile, 'utf-8')); res.json({ schedules: d.schedules || [] }); }
      catch { res.json({ schedules: getDefaultSchedules() }); }
    } catch(err) { res.status(500).json({ error: err.message }); }
  });
  router.put('/schedules', (req, res) => {
    try {
      const { schedules } = req.body;
      if (!Array.isArray(schedules)) return res.status(400).json({ error: '无效配置' });
      if (!dataDir) return res.status(500).json({ error: '未配置 dataDir' });
      const file = path.join(dataDir, 'schedules-config.json');
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ schedules }, null, 2), 'utf-8');
      fs.renameSync(tmp, file);
      res.json({ success: true, count: schedules.length });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── MCP Server 配置 ───

  const mcpConfigFile = dataDir ? path.join(dataDir, 'mcp-config.json') : null;

  function _loadMcpConfig() {
    if (!mcpConfigFile || !fs.existsSync(mcpConfigFile)) return [];
    try { const d = JSON.parse(fs.readFileSync(mcpConfigFile, 'utf-8')); return d.servers || []; } catch { return []; }
  }

  router.get('/mcp-config', (req, res) => {
    try { res.json({ servers: _loadMcpConfig() }); } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/mcp-config', (req, res) => {
    try {
      const { servers } = req.body;
      if (!Array.isArray(servers)) return res.status(400).json({ error: '无效配置' });
      if (!dataDir) return res.status(500).json({ error: '未配置 dataDir' });
      const file = path.join(dataDir, 'mcp-config.json');
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ servers }, null, 2), 'utf-8');
      fs.renameSync(tmp, file);
      res.json({ success: true, count: servers.length });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });


  // ─── 审计日志 ───

  router.get('/audit-log', (req, res) => {
    try {
      if (!dataDir) return res.json({ entries: [] });
      const file = path.join(dataDir, 'audit.log');
      if (!fs.existsSync(file)) return res.json({ entries: [] });
      const content = fs.readFileSync(file, 'utf-8').trim();
      if (!content) return res.json({ entries: [] });
      const entries = content.split('\\n').reverse().slice(0, 200).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      res.json({ entries });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/audit-log', (req, res) => {
    try {
      if (!dataDir) return res.status(500).json({ error: '未配置 dataDir' });
      fs.writeFileSync(path.join(dataDir, 'audit.log'), '', 'utf-8');
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

module.exports = { createAdminRoutes };
