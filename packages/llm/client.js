/**
 * LINK LLM 模块 · HTTP 客户端
 *
 * 职责：封装 HTTP 请求，支持超时 + 指数退避重试。
 * 设计来源：当前 webchat/lib/openclaw.js 的 callOpenClaw() 逻辑。
 *
 * 重试策略：
 *   第 0 次失败 → 等待 retryBaseDelay ms → 重试
 *   第 1 次失败 → 等待 retryBaseDelay * 2 ms → 重试
 *   第 N 次失败 → 抛出友好错误
 */

const { combineSignals } = require('./signal');
const { LLMConfig } = require('./config');

/**
 * 发送 HTTP 请求到 LLM provider
 * @param {string} url - 完整请求 URL
 * @param {object} body - 请求体（会被 JSON.stringify）
 * @param {object} options - { token, timeout, retries, retryBaseDelay }
 * @param {AbortSignal} [signal] - 外部取消信号
 * @returns {Promise<object>} 解析后的 JSON 响应
 */
async function httpRequest(url, body, options, signal) {
  const {
    token,
    timeout = 60_000,
    retries = 2,
    retryBaseDelay = 500,
  } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      // 合并外部 signal 和内部超时 signal
      const combinedSignal = signal
        ? combineSignals(signal, controller.signal)
        : controller.signal;

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        if (resp.status >= 400 && resp.status < 500) {
          throw new Error(`Provider ${resp.status}: ${text.slice(0, 200)}`);
        }
        throw new Error(`Provider ${resp.status}: ${text.slice(0, 200)}`);
      }

      return await resp.json();

    } catch (err) {
      const isAbort = err.name === 'AbortError';
      const isLast = attempt >= retries;

      if (isLast) {
        const prefix = isAbort ? '⏱ 响应超时' : '✗ 调用失败';
        throw new Error(`${prefix}: ${err.message}`);
      }

      // 指数退避：500ms → 1000ms → 2000ms
      await new Promise(r => setTimeout(r, retryBaseDelay * (attempt + 1)));
    }
  }
}

module.exports = { httpRequest };
