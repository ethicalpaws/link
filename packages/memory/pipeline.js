/**
 * LINK Memory · 压缩管道
 *
 * 职责：日摘要生成 → 周摘要聚合 → 里程碑检测。
 * 被 Scheduler 调用，不关心触发时机。
 */

const DAILY_SUMMARIZER_PROMPT = `你是一个对话摘要生成器。请根据今天的群聊记录生成一份 3-5 句话的日摘要。

要求：
1. 客观——只记录事实，不添加情绪评价
2. 按"技术 / 情绪 / 方向"三个维度组织（如果当天有相关内容）
3. 每条摘要用方括号标注 2-3 个关键词标签

输出格式：
---
date: {日期}
tags: [关键词1, 关键词2]
---

## 技术进展
一句话描述。[关键词]

## 情绪状态
一句话描述。[关键词]

## 方向与计划
一句话描述。[关键词]`;

const WEEKLY_DIGEST_PROMPT = `你是一份周报生成器。根据下面 7 天的日摘要，生成一份本周总结。

要求：
1. 客观——只汇总事实
2. 包含：本周节奏、关键决策、下周预告
3. 3-5 段话

以下是本周的日摘要：
{summaries}`;


/**
 * 生成日摘要（Layer 1）
 *
 * @param {object} roomManager - 房间管理器实例
 * @param {string} roomId - 要摘要的房间
 * @param {Function} llmCall - (messages) => Promise<string>
 * @param {MemoryStorage} storage
 * @returns {Promise<string|null>} 生成的摘要内容，或 null（消息太少跳过）
 */
async function generateDailySummary(roomManager, roomId, llmCall, storage) {
  const room = roomManager.get(roomId);
  if (!room) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todayMessages = room.history.filter(m =>
    m.timestamp?.startsWith(today)
  );
  if (todayMessages.length < 3) return null;  // 没聊几句，跳过

  // 格式化消息
  const messageLog = todayMessages.map(m => {
    const sender = m.role === 'user' ? '用户' : (m.name || '助手');
    return `${sender}：${m.content}`;
  }).join('\n');

  const prompt = DAILY_SUMMARIZER_PROMPT + `\n\n今天的消息：\n${messageLog}`;

  try {
    const summary = await llmCall([
      { role: 'system', content: prompt },
    ]);

    const content = `# 日摘要 · ${today}\n\n${summary}`;
    storage.saveDailySummary(today, content);

    // 清理过期日摘要
    storage.cleanDailySummaries(14);

    return content;
  } catch (err) {
    console.error(`✗ 日摘要生成失败: ${err.message}`);
    return null;
  }
}

/**
 * 生成周摘要（Layer 2）
 *
 * @param {MemoryStorage} storage
 * @param {Function} llmCall
 * @returns {Promise<string|null>}
 */
async function generateWeeklyDigest(storage, llmCall) {
  const summaries = storage.getRecentDailySummaries(7);
  if (summaries.length === 0) return null;

  const summaryText = summaries.map(s => `【${s.date}】\n${s.content}`).join('\n\n');
  const prompt = WEEKLY_DIGEST_PROMPT.replace('{summaries}', summaryText);

  try {
    const digest = await llmCall([
      { role: 'system', content: prompt },
    ]);

    const weekKey = storage.ISOWeekKey;
    const content = `# ${weekKey} 周报\n\n${digest}`;
    storage.saveWeeklyDigest(weekKey, content);

    // 清理过期周摘要
    storage.cleanWeeklyDigests(52);

    return content;
  } catch (err) {
    console.error(`✗ 周摘要生成失败: ${err.message}`);
    return null;
  }
}

/**
 * 归档（Layer 3）
 *
 * @param {MemoryStorage} storage
 * @param {string} digestContent - 周摘要内容
 */
function archive(storage, digestContent) {
  if (!digestContent) return;
  storage.appendArchive(digestContent);
}

module.exports = {
  generateDailySummary,
  generateWeeklyDigest,
  archive,
  DAILY_SUMMARIZER_PROMPT,
};
