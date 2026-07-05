/**
 * LINK Memory · 记忆系统
 *
 * 职责：对话压缩（四层）、上下文恢复、里程碑检测。
 *
 * 使用方式:
 *   const { MemoryStorage, pipeline, buildContext } = require('@link/memory');
 *   const storage = new MemoryStorage('./data');
 *
 *   // Scheduler 触发日摘要
 *   await pipeline.generateDailySummary(roomManager, roomId, llmCall, storage);
 *
 *   // Gateway 构建上下文
 *   const ctx = buildContext(storage, { identityFile: './data/core_identity.md' });
 */

const { MemoryStorage } = require('./storage');
const pipeline = require('./pipeline');
const { buildContext } = require('./context');

module.exports = {
  MemoryStorage,
  pipeline,
  buildContext,
};
