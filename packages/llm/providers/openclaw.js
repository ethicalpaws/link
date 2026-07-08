const { httpRequest } = require('../client');
const { streamRequest } = require('../stream');
const { buildBody, parseResponse } = require('../format');

async function call(agentId, messages, providerConfig, breaker, tools) {
  const { baseUrl, token, timeout, retries, retryBaseDelay, maxTokens } = providerConfig;
  const body = buildBody({ model: `openclaw/${agentId}`, messages, tools, maxTokens });

  const doCall = () => httpRequest(`${baseUrl}/v1/chat/completions`, body, { token, timeout, retries, retryBaseDelay });
  const data = breaker ? await breaker.call(doCall) : await doCall();
  return parseResponse(data);
}

async function* stream(agentId, messages, providerConfig) {
  const { baseUrl, token, timeout, maxTokens } = providerConfig;
  const body = buildBody({ model: `openclaw/${agentId}`, messages, maxTokens });
  yield* streamRequest(`${baseUrl}/v1/chat/completions`, body, { token, timeout });
}

async function healthCheck(providerConfig) {
  const { baseUrl, token, timeout } = providerConfig;
  const start = Date.now();
  try {
    const resp = await fetch(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeout || 10_000),
    });
    return { ok: resp.ok, latency: Date.now() - start };
  } catch (err) {
    return { ok: false, latency: Date.now() - start, error: err.message };
  }
}

module.exports = { call, stream, healthCheck };
