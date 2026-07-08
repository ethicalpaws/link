/**
 * LINK LLM 模块 · SSE Token 流解析
 *
 * 职责：将 LLM provider 返回的 SSE 流解析为逐 token 的 AsyncGenerator。
 *
 * 支持的格式：
 *   OpenAI 兼容: data: {"choices":[{"delta":{"content":"token"}}]}
 *   标准 SSE:    data: {"text": "token"}
 *
 * 终止信号: data: [DONE]
 */

const { combineSignals } = require('./signal');

/**
 * 将 fetch Response 的 body 转换为 token 流
 * @param {Response} resp - fetch 返回的响应（stream: true）
 * @returns {AsyncGenerator<string>}
 */
async function* parseSSEStream(resp) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;

      try {
        const parsed = JSON.parse(payload);
        // OpenAI 兼容格式
        const token = parsed.choices?.[0]?.delta?.content
                   || parsed.choices?.[0]?.text
                   || parsed.text
                   || '';
        if (token) yield token;
      } catch {
        // 某些 provider 可能返回非标准 JSON，忽略这一行
      }
    }
  }
}

/**
 * 发起流式请求并返回 token 流
 * @param {string} url
 * @param {object} body
 * @param {object} options
 * @param {AbortSignal} [signal]
 * @returns {AsyncGenerator<string>}
 */
async function* streamRequest(url, body, options, signal) {
  const { token, timeout = 60_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const combinedSignal = signal
    ? combineSignals(signal, controller.signal)
    : controller.signal;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: token ? `Bearer ${token}` : undefined,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: combinedSignal,
    });

    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Provider ${resp.status}: ${text.slice(0, 200)}`);
    }

    yield* parseSSEStream(resp);

  } finally {
    clearTimeout(timer);
  }
}

module.exports = { parseSSEStream, streamRequest };
