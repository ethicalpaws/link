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

/** 定时任务超时时间：用户任务 120s，系统任务 60s */
const USER_TASK_TIMEOUT = 120_000;
const SYSTEM_TASK_TIMEOUT = 60_000;

class PushScheduler {
  constructor({ configFile, sseBus, roomManager, executeWithTools, memoryStorage, llmCall, agentMap }) {
    this.configFile = configFile;
    this.sseBus = sseBus;
    this.roomManager = roomManager;
    this.executeWithTools = executeWithTools;
    this.memoryStorage = memoryStorage;
    this.llmCall = llmCall;
    this.agentMap = agentMap || {};
    this._timer = null;
    this._lastFired = new Map();
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), 30_000);
    console.log('  ⏰ 调度引擎: 已启动');
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
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

    for (const job of this._loadSchedules()) {
      if (job.hour !== h || job.minute !== m) continue;
      if (job.dayOfWeek !== undefined && job.dayOfWeek !== dow) continue;
      if (job.dayOfMonth !== undefined && job.dayOfMonth !== dom) continue;
      const key = 'user-' + job.agent + '-' + job.hour + ':' + job.minute;
      if (this._wasFiredRecently(key)) continue;
      this._lastFired.set(key, Date.now());
      this._execute(job);
    }

    for (const job of SYSTEM_JOBS) {
      if (job.hour !== h || job.minute !== m) continue;
      if (job.dayOfWeek !== undefined && job.dayOfWeek !== dow) continue;
      const key = 'sys-' + job.type;
      if (this._wasFiredRecently(key)) continue;
      this._lastFired.set(key, Date.now());
      this._executeSystem(job);
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

  async _execute(job) {
    if (!job.agent || !job.prompt) return;

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

      if (job.showInChat && job.roomId && content) {
        this.sseBus.broadcast({
          type: 'proactive', agent: job.agent, content: content, desc: job.desc, roomId: job.roomId,
        }, job.roomId);
      }
    } catch (err) {
      console.error('  ⏰ 推送失败 [' + job.desc + ']: ' + err.message);
    }
  }

  async _executeSystem(job) {
    try {
      const rooms = this.roomManager.list();
      if (rooms.length === 0) return;

      if (job.type === 'daily_summary' && this.memoryStorage && this.llmCall) {
        const { pipeline } = require('@link/memory');
        const llmWrap = (messages) => this.llmCall(null, messages).then(r => (r && r.content) || r || '');
        await this._withTimeout(
          pipeline.generateDailySummary(this.roomManager, rooms[0].id, llmWrap, this.memoryStorage),
          SYSTEM_TASK_TIMEOUT,
        );
        console.log('  📅 日摘要已生成');
      }

      if (job.type === 'weekly_digest' && this.memoryStorage && this.llmCall) {
        const { pipeline } = require('@link/memory');
        const llmWrap = (messages) => this.llmCall(null, messages).then(r => (r && r.content) || r || '');
        await this._withTimeout(
          pipeline.generateWeeklyDigest(this.memoryStorage, llmWrap),
          SYSTEM_TASK_TIMEOUT,
        );
        console.log('  📊 周摘要已聚合');
      }

      if (job.type === 'archive' && this.memoryStorage) {
        const { pipeline } = require('@link/memory');
        const weekKey = this.memoryStorage.ISOWeekKey;
        const content = this.memoryStorage.getWeeklyDigest(weekKey);
        if (content) { pipeline.archive(this.memoryStorage, content); console.log('  📚 已归档'); }
      }
    } catch (err) {
      console.error('  ⏰ 系统任务失败 [' + job.desc + ']: ' + err.message);
    }
  }
}

module.exports = { PushScheduler };
