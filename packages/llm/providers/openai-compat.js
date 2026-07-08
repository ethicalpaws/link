const { httpRequest } = require('../client');
const { streamRequest } = require('../stream');
const { buildBody, parseResponse } = require('../format');

function resolveChatUrl(baseUrl) {
  const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (url.includes('/chat')) return url;
  return `${url}/v1/chat/completions`;
}

async function call(agentId, messages, providerConfig, breaker, tools) {
  const { baseUrl, model, apiKey, timeout, retries, retryBaseDelay, maxTokens } = providerConfig;
  const body = buildBody({ model: model || 'default', messages, tools, maxTokens });

  const doCall = () => httpRequest(resolveChatUrl(baseUrl), body, { token: apiKey, timeout, retries, retryBaseDelay });
  const data = breaker ? await breaker.call(doCall) : await doCall();
  return parseResponse(data);
}

async function* stream(agentId, messages, providerConfig) {
  const { baseUrl, model, apiKey, timeout, maxTokens } = providerConfig;
  const body = buildBody({ model: model || 'default', messages, maxTokens });

  const gen = streamRequest(resolveChatUrl(baseUrl), body, { token: apiKey, timeout });
  yield* gen;
}

async function healthCheck(providerConfig) {
  const { baseUrl, apiKey, timeout } = providerConfig;
  const start = Date.now();
  try {
    const resp = await fetch(`${baseUrl || 'https://api.openai.com/v1'}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeout || 10_000),
    });
    return { ok: resp.ok, latency: Date.now() - start };
  } catch (err) {
    return { ok: false, latency: Date.now() - start, error: err.message };
  }
}

module.exports = { call, stream, healthCheck };
