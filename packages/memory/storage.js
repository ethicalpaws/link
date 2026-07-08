/**
 * LINK Memory · 存储层
 *
 * 职责：日摘要、周摘要、里程碑等文件的读写和生命周期管理。
 * 当前实现基于文件系统，接口已抽象为类，方便日后替换后端。
 */

const fs = require('fs');
const path = require('path');

class MemoryStorage {
  /**
   * @param {string} dataDir - 数据目录，如 my-system/data/
   * @param {object} [options]
   * @param {string} [options.identityFile] - 核心身份文件名，相对于 dataDir，默认 'core_identity.md'
   */
  constructor(dataDir, options = {}) {
    this.dataDir = dataDir;
    this.dailyDir = path.join(dataDir, 'daily-summary');
    this.digestDir = path.join(dataDir, 'digest');
    this.archiveFile = path.join(dataDir, 'archive.md');
    this.milestonesFile = path.join(dataDir, 'milestones.md');
    this.identityFile = options.identityFile !== undefined ? options.identityFile : 'core_identity.md';
    this._ensureDirs();
  }

  // ─── 日摘要 ───

  /** 写入日摘要 */
  saveDailySummary(date, content) {
    const file = path.join(this.dailyDir, `${date}.md`);
    fs.writeFileSync(file, content, 'utf-8');
  }

  /** 读取单日摘要 */
  getDailySummary(date) {
    const file = path.join(this.dailyDir, `${date}.md`);
    try { return fs.readFileSync(file, 'utf-8'); } catch { return null; }
  }

  /** 获取最近 N 天的日摘要列表（从旧到新） */
  getRecentDailySummaries(days = 7) {
    const results = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const content = this.getDailySummary(dateStr);
      if (content) results.push({ date: dateStr, content });
    }
    return results;
  }

  /** 清理超过 N 天的日摘要 */
  cleanDailySummaries(retentionDays = 14) {
    if (!fs.existsSync(this.dailyDir)) return;
    const files = fs.readdirSync(this.dailyDir);
    const cutoff = Date.now() - retentionDays * 86400000;
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const dateStr = file.slice(0, -3);
      const ts = new Date(dateStr).getTime();
      if (!isNaN(ts) && ts < cutoff) {
        fs.unlinkSync(path.join(this.dailyDir, file));
      }
    }
  }

  // ─── 周摘要 ───

  /** 写入周摘要（用 ISO 周编号） */
  saveWeeklyDigest(weekKey, content) {
    const file = path.join(this.digestDir, `${weekKey}.md`);
    fs.writeFileSync(file, content, 'utf-8');
  }

  /** 读取周摘要 */
  getWeeklyDigest(weekKey) {
    const file = path.join(this.digestDir, `${weekKey}.md`);
    try { return fs.readFileSync(file, 'utf-8'); } catch { return null; }
  }

  /** 清理超过 N 周的周摘要 */
  cleanWeeklyDigests(retentionWeeks = 52) {
    if (!fs.existsSync(this.digestDir)) return;
    const files = fs.readdirSync(this.digestDir);
    const sorted = files.filter(f => f.endsWith('.md')).sort();
    while (sorted.length > retentionWeeks) {
      const old = sorted.shift();
      fs.unlinkSync(path.join(this.digestDir, old));
    }
  }

  // ─── 归档 ───

  /** 追加一条归档记录 */
  appendArchive(content) {
    fs.appendFileSync(this.archiveFile, `\n---\n${content}\n`, 'utf-8');
  }

  // ─── 里程碑 ───

  /** 追加一条里程碑记录 */
  appendMilestone(entry) {
    fs.appendFileSync(this.milestonesFile, `\n- ${entry.date} · ${entry.title}\n  ${entry.description}\n`, 'utf-8');
  }

  /** 读取所有里程碑 */
  getMilestones() {
    try { return fs.readFileSync(this.milestonesFile, 'utf-8'); } catch { return ''; }
  }

  // ─── 辅助 ───

  /**
   * 获取指定日期的 ISO 8601 周编号（周一为每周第一天）
   * 例如: 2026-W01
   */
  get ISOWeekKey() {
    const now = new Date();
    return this._getISOWeekKey(now);
  }

  /**
   * 计算 ISO 8601 周编号
   * 算法: 定位到当前周的周四 → 周四所在的年就是 ISO 年 → 计算周数
   */
  _getISOWeekKey(date) {
    const d = new Date(date);
    // 将周日 (0) 转成 7，让周一=1..周日=7
    const dayNum = d.getDay() || 7;
    // 移动到同周的周四 (day 4)
    d.setDate(d.getDate() + 4 - dayNum);
    const year = d.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const weekNum = Math.ceil(((d - jan1) / 86400000 + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
  }

  _ensureDirs() {
    [this.dailyDir, this.digestDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }
}

module.exports = { MemoryStorage };
