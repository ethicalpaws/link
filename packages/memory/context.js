/**
 * LINK Memory · 上下文构建器
 *
 * 职责：为 LLM 对话构建"记忆上下文"，注入到 system prompt 中。
 * 被 Gateway 的 chat-service 调用。
 *
 * 自动读取的内容（通过 storage.dataDir）:
 *   - 最近 7 天的日摘要
 *   - 最近 2 周的周摘要
 *   - data/user-md-content.md      ← 用户身份
 *   - data/period.md               ← 阶段计划（用户可选，通过 API 设置）
 *   - data/weekly-plan.md          ← 周计划（用户可选，通过 API 设置）
 *   - data/core_identity.md        ← 核心身份（用户可选，手动创建）
 *
 * 不存在的文件自动跳过，不影响上下文构建。
 */

const fs = require('fs');
const path = require('path');

/**
 * 获取最近 N 周的 ISO 周编号（周一为每周第一天）
 * @param {number} weeks - 回溯几周
 * @returns {string[]} 周编号数组，如 ["2026-W26", "2026-W27"]
 */
function getRecentWeekKeys(weeks = 2) {
  const keys = [];
  const now = new Date();
  for (let i = 1; i <= weeks; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const year = d.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const weekNum = Math.ceil(((d - jan1) / 86400000 + 1) / 7);
    keys.push(`${year}-W${String(weekNum).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * 构建 LLM 上下文
 *
 * @param {object} storage - MemoryStorage 实例
 * @param {object} [options]
 * @param {number} [options.dailyDays=7] - 读取最近几天日摘要
 * @returns {string} 格式化的上下文文本，空字符串表示无上下文
 */
function buildContext(storage, options = {}) {
  const { dailyDays = 7 } = options;
  const parts = [];
  const dataDir = storage?.dataDir;

  // 1. 日摘要
  const summaries = storage.getRecentDailySummaries(dailyDays);
  if (summaries.length > 0) {
    const summaryText = summaries.map(s =>
      `📅 ${s.date}\n${s.content}`
    ).join('\n\n');
    parts.push(`【近期对话摘要】\n${summaryText}\n\n（用途：了解过去7天发生的事，是判断当前状态的参考）`);
  }

  // 2. 周摘要（最近 2 周）
  if (dataDir) {
    const weekKeys = getRecentWeekKeys(2);
    const weekParts = [];
    for (const wk of weekKeys) {
      const digest = storage.getWeeklyDigest(wk);
      if (digest) {
        weekParts.push(`📆 ${wk}\n${digest}`);
      }
    }
    if (weekParts.length > 0) {
      parts.push(`【周摘要】\n${weekParts.join('\n\n')}\n\n（用途：了解过去几周的大致脉络，是中期方向的参考）`);
    }
  }

  // 3. 用户身份
  if (dataDir) {
    const userMdFile = path.join(dataDir, 'user-md-content.md');
    try {
      const content = fs.readFileSync(userMdFile, 'utf-8').trim();
      if (content) parts.push(`【用户身份】\n${content}\n\n（用途：了解临风是谁，是判断回应方式的基础）`);
    } catch (_) { /* 文件不存在则跳过 */ }
  }

  // 4. 核心身份（判断偏离的基准线）
  if (dataDir) {
    const identityFile = path.join(dataDir, 'core_identity.md');
    try {
      const content = fs.readFileSync(identityFile, 'utf-8').trim();
      if (content) parts.push(`【核心身份】\n${content}\n\n（用途：这是临风最核心的目标，是判断是否偏离的基准线——优先级最高）`);
    } catch (_) { /* 文件不存在则跳过 */ }
  }

  // 5. 阶段计划（当前阶段大方向）
  if (dataDir) {
    const periodFile = path.join(dataDir, 'period.md');
    try {
      const content = fs.readFileSync(periodFile, 'utf-8').trim();
      if (content) parts.push(`【阶段计划】\n${content}\n\n（用途：这是当前阶段（几个月）的大方向，用于判断是否偏离长期目标）`);
    } catch (_) { /* 未设置则跳过 */ }
  }

  // 6. 周计划（本周具体任务）
  if (dataDir) {
    const weeklyFile = path.join(dataDir, 'weekly.md');
    try {
      const content = fs.readFileSync(weeklyFile, 'utf-8').trim();
      if (content) parts.push(`【本周计划】\n${content}\n\n（用途：这是本周的具体任务，是判断当前行动是否合理的直接依据）`);
    } catch (_) { /* 未设置则跳过 */ }
  }

  return parts.join('\n\n');
}

module.exports = { buildContext };
