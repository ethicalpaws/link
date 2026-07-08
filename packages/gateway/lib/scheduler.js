/**
 * LINK Gateway · 定时调度引擎
 *
 * 运行两类任务：
 *   1. 用户配置的任务（从 data/schedules-config.json 读取）
 *   2. 系统任务（日摘要 23:50、周摘要 周日 23:52、归档 周日 23:59）
 * 每 30 秒检查一次。
 */

const fs = require('fs');
const path = require('path');
const { buildContext } = require('@link/memory');
const { loadAgentFiles } = require('./tool-runner');
const { buildAgentPrompt } = require('./chat-service');

const SYSTEM_JOBS = [
  { hour: 23, minute: 50, type: 'daily_summary', desc: '日摘要生成', silent: true },
  { hour: 23, minute: 52, type: 'weekly_digest', desc: '周摘要聚合', silent: true, dayOfWeek: 0 },
  { hour: 23, minute: 59, type: 'archive', desc: '归档', silent: true, dayOfWeek: 0 },
];

/** 心跳触发时间：每小时的第 40 分钟 */
const HEARTBEAT_MINUTE = 40;

/** 心跳文件轮转阈值：超过此大小（字节）则轮转 */
const HEARTBEAT_MAX_SIZE = 1024 * 1024; // 1 MB

/** 心跳文件轮转阈值：超过此行数则轮转 */
const HEARTBEAT_MAX_LINES = 1000;

/** 定时任务超时时间：用户任务 5min，系统任务 2min */
const USER_TASK_TIMEOUT = 300_000;    // chronos 推送含 web_search，需要搜索+写入
const SYSTEM_TASK_TIMEOUT = 120_000;

class PushScheduler {
  constructor({ configFile, sseBus, roomManager, executeWithTools, memoryStorage, llmCall, agentMap, logger, workspaceDir }) {
    this.configFile = configFile;
    this.sseBus = sseBus;
    this.roomManager = roomManager;
    this.executeWithTools = executeWithTools;
    this.memoryStorage = memoryStorage;
    this.llmCall = llmCall;
    this.agentMap = agentMap || {};
    this.logger = logger || null;
    this._timer = null;
    this._lastFired = new Map();
    this.workspaceDir = workspaceDir || null;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), 30_000);
    this.logger?.info('scheduler', '调度引擎已启动', { event: 'start' });
    console.log('  ⏰ 调度引擎: 已启动');
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.logger?.info('scheduler', '调度引擎已停止', { event: 'stop' });
  }

  _loadSchedules() {
    try {
      if (!this.configFile || !fs.existsSync(this.configFile)) return [];
      const data = JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
      return data.schedules || [];
    } catch { return []; }
  }

  _tick() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const dow = now.getDay();  // 0=周日, 6=周六
    const dom = now.getDate();  // 1-31

    this.logger?.debug('scheduler', 'tick 触发', { event: 'tick', h, m, dow, dom });

    for (const job of this._loadSchedules()) {
      if (job.hour !== h || job.minute !== m) continue;
      if (job.dayOfWeek !== undefined && job.dayOfWeek !== dow) continue;
      if (job.dayOfMonth !== undefined && job.dayOfMonth !== dom) continue;

      const key = 'user-' + job.agent + '-' + job.hour + ':' + job.minute;
      if (this._wasFiredRecently(key)) {
        this.logger?.debug('scheduler', '任务因短时重复被跳过', { event: 'job_skipped_recently_fired', key });
        continue;
      }
      this._lastFired.set(key, Date.now());
      this.logger?.info('scheduler', '用户任务命中，开始执行', { event: 'job_matched', agent: job.agent, desc: job.desc, hour: job.hour, minute: job.minute });
      this._execute(job);
    }

    for (const job of SYSTEM_JOBS) {
      if (job.hour !== h || job.minute !== m) continue;
      if (job.dayOfWeek !== undefined && job.dayOfWeek !== dow) continue;
      const key = 'sys-' + job.type;
      if (this._wasFiredRecently(key)) {
        this.logger?.debug('scheduler', '系统任务因短时重复被跳过', { event: 'sys_job_skipped_recently_fired', key });
        continue;
      }
      this._lastFired.set(key, Date.now());
      this.logger?.info('scheduler', '系统任务命中，开始执行', { event: 'sys_job_matched', type: job.type, desc: job.desc, hour: job.hour, minute: job.minute });
      this._executeSystem(job);
    }

    // 心跳：每小时的第 40 分钟触发
    if (m === HEARTBEAT_MINUTE) {
      const key = 'sys-heartbeat';
      if (!this._wasFiredRecently(key)) {
        this._lastFired.set(key, Date.now());
        this.logger?.info('scheduler', '心跳触发', { event: 'heartbeat_tick', hour: h });
        this._executeHeartbeats();
      }
    }
  }

  _wasFiredRecently(key) {
    const last = this._lastFired.get(key);
    return last && (Date.now() - last) < 60_000;
  }

  /**
   * 给异步操作加超时
   * timeoutMs 后触发 abort，主动拒绝
   */
  /**
   * 给异步操作加超时
   * timeoutMs 后触发 abort，主动拒绝
   */
  _withTimeout(promise, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('执行超时')));
      }),
    ]).finally(() => clearTimeout(timer));
  }

  _loadHeartbeatPrompts(agentId) {
    // 从 agents/{agentId}/HEARTBEAT.md 读取提示词列表
    const agent = this.agentMap?.[agentId];
    const agentDir = agent?.agentDir || path.join(__dirname, '..', '..', 'agents', agentId);
    const hbFile = path.join(agentDir, 'HEARTBEAT.md');
    try {
      if (!fs.existsSync(hbFile)) return [];
      const content = fs.readFileSync(hbFile, 'utf-8').trim();
      if (!content) return [];
      // 每行一个提示词，空行和#开头的行忽略
      return content.split('\n')
        .map(l => l.replace(/^#.*/, '').trim())
        .filter(l => l.length > 0);
    } catch { return []; }
  }

  _getHeartbeatPrompt(agentId) {
    const prompts = this._loadHeartbeatPrompts(agentId);
    if (prompts.length === 0) return null;
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  /**
   * 心跳文件轮转检查
   * 触发条件（满足任一）：文件大小 > 1MB 或行数 > 1000
   * 轮转方式：归档为 heartbeat-{date}-{n}.md.bak
   */
  _rotateHeartbeatIfNeeded(hbFile) {
    try {
      if (!fs.existsSync(hbFile)) return;
      const stat = fs.statSync(hbFile);
      if (stat.size < HEARTBEAT_MAX_SIZE) {
        // 快速路径：大小未超限，检查行数
        const content = fs.readFileSync(hbFile, 'utf-8');
        const lines = content.split('\n').length;
        if (lines <= HEARTBEAT_MAX_LINES) return;
      }
      // 需要轮转：读取旧内容写入归档文件，再创建新的空文件
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const hbDir = path.dirname(hbFile);
      const baseName = path.basename(hbFile, '.md');
      const bakFile = path.join(hbDir, `${baseName}-${timestamp}.bak.md`);
      const oldContent = fs.readFileSync(hbFile, 'utf-8');
      fs.writeFileSync(bakFile, oldContent, 'utf-8');  // 覆盖式写入，Windows 下不报错
      fs.writeFileSync(hbFile, '', 'utf-8');           // 清空原文件继续写入
      this.logger?.info('scheduler', '心跳文件已轮转', { from: hbFile, to: bakFile, size: stat.size });
      console.log('  💾 心跳文件已归档: ' + path.basename(bakFile));
    } catch (err) {
      this.logger?.warn('scheduler', '心跳文件轮转失败', { file: hbFile, error: err.message });
    }
  }

  async _executeHeartbeats() {
    const enabledAgents = Object.keys(this.agentMap).filter(id => this.agentMap[id].heartbeat);
    if (enabledAgents.length === 0) return;

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    for (const agentId of enabledAgents) {
      const prompt = this._getHeartbeatPrompt(agentId);
      if (!prompt) continue;

      const ctxSummary = this.memoryStorage ? buildContext(this.memoryStorage) : '';
      const { agentsMd, soulMd } = loadAgentFiles(agentId, this.agentMap);

      const headerParts = [];
      if (agentsMd) headerParts.push(`【角色设定】\n${agentsMd}`);
      if (soulMd) headerParts.push(`【灵魂】\n${soulMd}`);
      const roleHeader = headerParts.length > 0 ? headerParts.join('\n\n') + '\n\n' : '';

      const messages = [{
        role: 'user',
        content: roleHeader + prompt,
      }];

      if (ctxSummary) {
        messages.unshift({ role: 'system', content: ctxSummary });
      }

      try {
        const content = this.executeWithTools
          ? await this._withTimeout(this.executeWithTools(agentId, messages), USER_TASK_TIMEOUT)
          : '';

        if (content && this.workspaceDir) {
          // 追加写入 heartbeat/{date}.md
          const hbDir = path.join(this.workspaceDir, agentId, 'heartbeat');
          if (!fs.existsSync(hbDir)) fs.mkdirSync(hbDir, { recursive: true });
          const hbFile = path.join(hbDir, dateStr + '.md');
          this._rotateHeartbeatIfNeeded(hbFile);
          const timestamp = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
          const entry = `\n## ${timestamp} 心跳记录\n\n${content.trim()}\n`;
          fs.appendFileSync(hbFile, entry, 'utf-8');
          this.logger?.info('scheduler', '心跳记录已写入', { agent: agentId, file: hbFile });
        }
      } catch (err) {
        this.logger?.error('scheduler', '心跳执行失败', { agent: agentId, error: err.message });
        console.error('  💓 心跳失败 [' + agentId + ']: ' + err.message);
      }
    }
  }

  async _execute(job) {
    if (!job.agent || !job.prompt) return;

    const start = Date.now();
    this.logger?.debug('scheduler', '开始构建用户任务上下文', { agent: job.agent });

    // 构建完整的 agent 对话上下文（与 chat.js 流程一致）
    const ctxSummary = this.memoryStorage ? buildContext(this.memoryStorage) : '';
    const { agentsMd, soulMd } = loadAgentFiles(job.agent, this.agentMap);

    const headerParts = [];
    if (agentsMd) headerParts.push(`【角色设定】\n${agentsMd}`);
    if (soulMd) headerParts.push(`【灵魂】\n${soulMd}`);
    const roleHeader = headerParts.length > 0 ? headerParts.join('\n\n') + '\n\n' : '';

    const systemParts = [];
    if (ctxSummary) systemParts.push(ctxSummary);

    const messages = [{
      role: 'user',
      content: roleHeader + `【本周任务】\n${job.prompt}`,
    }];

    if (systemParts.length > 0) {
      messages.unshift({ role: 'system', content: systemParts.join('\n\n') });
    }

    try {
      const content = this.executeWithTools
        ? await this._withTimeout(
            this.executeWithTools(job.agent, messages),
            USER_TASK_TIMEOUT,
          )
        : '';

      const durationMs = Date.now() - start;
      this.logger?.info('scheduler', '用户任务执行成功', { event: 'job_done', agent: job.agent, durationMs, hasContent: !!content });

      if (job.showInChat && job.roomId && content) {
        this.sseBus.broadcast({
          type: 'proactive', agent: job.agent, content: content, desc: job.desc, roomId: job.roomId,
        }, job.roomId);
      }
    } catch (err) {
      const durationMs = Date.now() - start;
      this.logger?.error('scheduler', '用户任务执行失败', { event: 'job_error', agent: job.agent, durationMs, error: err.message });
      console.error('  ⏰ 推送失败 [' + job.desc + ']: ' + err.message);
    }
  }

  async _executeSystem(job) {
    const start = Date.now();
    try {
      const rooms = this.roomManager.list();
      if (rooms.length === 0) {
        this.logger?.debug('scheduler', '系统任务跳过：无房间', { event: 'sys_job_skipped_no_rooms', type: job.type });
        return;
      }

      if (job.type === 'daily_summary' && this.memoryStorage && this.llmCall) {
        const { pipeline } = require('@link/memory');
        const llmWrap = (messages) => this.llmCall(null, messages).then(r => (r && r.content) || r || '');
        await this._withTimeout(
          pipeline.generateDailySummary(this.roomManager, rooms[0].id, llmWrap, this.memoryStorage),
          SYSTEM_TASK_TIMEOUT,
        );
        const ms = Date.now() - start;
        this.logger?.info('scheduler', '日摘要生成完成', { event: 'sys_job_done', type: 'daily_summary', durationMs: ms });
        console.log('  📅 日摘要已生成');
      }

      if (job.type === 'weekly_digest' && this.memoryStorage && this.llmCall) {
        const { pipeline } = require('@link/memory');
        const llmWrap = (messages) => this.llmCall(null, messages).then(r => (r && r.content) || r || '');
        await this._withTimeout(
          pipeline.generateWeeklyDigest(this.memoryStorage, llmWrap),
          SYSTEM_TASK_TIMEOUT,
        );
        const ms = Date.now() - start;
        this.logger?.info('scheduler', '周摘要聚合完成', { event: 'sys_job_done', type: 'weekly_digest', durationMs: ms });
        console.log('  📊 周摘要已聚合');
      }

      if (job.type === 'archive' && this.memoryStorage) {
        const { pipeline } = require('@link/memory');
        const weekKey = this.memoryStorage.ISOWeekKey;
        const content = this.memoryStorage.getWeeklyDigest(weekKey);
        if (content) { pipeline.archive(this.memoryStorage, content); console.log('  📚 已归档'); }
        const ms = Date.now() - start;
        this.logger?.info('scheduler', '归档完成', { event: 'sys_job_done', type: 'archive', durationMs: ms });
      }
    } catch (err) {
      const ms = Date.now() - start;
      this.logger?.error('scheduler', '系统任务执行失败', { event: 'sys_job_error', type: job.type, durationMs: ms, error: err.message });
      console.error('  ⏰ 系统任务失败 [' + job.desc + ']: ' + err.message);
    }
  }
}

module.exports = { PushScheduler };
