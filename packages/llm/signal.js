/**
 * LINK LLM 模块 · AbortSignal 工具
 *
 * 职责：合并多个 AbortSignal，供 HTTP 客户端和流解析共用。
 */

/**
 * 合并两个 AbortSignal
 * 任一 signal 触发 abort 时，合并后的 signal 也触发 abort。
 */
function combineSignals(s1, s2) {
  if (!s1) return s2;
  if (!s2) return s1;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  s1.addEventListener('abort', onAbort);
  s2.addEventListener('abort', onAbort);
  if (s1.aborted || s2.aborted) controller.abort();
  return controller.signal;
}

module.exports = { combineSignals };
