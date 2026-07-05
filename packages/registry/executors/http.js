/**
 * LINK Registry · HTTP 执行器
 *
 * 执行类型: http
 * 适用: 调 REST API、搜索、抓网页
 *
 * YAML 配置示例:
 *   execution:
 *     type: http
 *     method: GET
 *     url: "https://api.example.com/search?q={{query}}"
 *     headers:
 *       Authorization: "Bearer {{apiKey}}"
 *     timeout: 30
 */

const https = require('https');
const http = require('http');

async function execute(config, args, signal) {
  const url = _template(config.url, args);
  const method = (config.method || 'GET').toUpperCase();
  const headers = {};

  if (config.headers) {
    for (const [k, v] of Object.entries(config.headers)) {
      headers[k] = _template(String(v), args);
    }
  }

  const body = method !== 'GET' && config.body
    ? JSON.stringify(_deepTemplate(config.body, args))
    : undefined;

  if (body) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeout = (config.timeout || 30) * 1000;
  const timer = setTimeout(() => controller.abort(), timeout);

  const combinedSignal = signal
    ? _combineSignals(signal, controller.signal)
    : controller.signal;

  try {
    const isHttps = url.startsWith('https');
    const fetcher = isHttps ? https : http;

    const resp = await new Promise((resolve, reject) => {
      const options = new URL(url);
      const req = fetcher.request({
        hostname: options.hostname,
        port: options.port,
        path: options.pathname + options.search,
        method,
        headers,
        signal: combinedSignal,
      }, resolve);
      if (body) req.write(body);
      req.end();
      req.on('error', reject);
    });

    let data = '';
    resp.on('data', chunk => data += chunk);

    return await new Promise((resolve, reject) => {
      resp.on('end', () => {
        const maxLen = 5000;
        const result = data.length > maxLen
          ? data.slice(0, maxLen) + `\n...（已截断，总长度 ${data.length}）`
          : data;
        resolve(result);
      });
      resp.on('error', reject);
    });
  } finally {
    clearTimeout(timer);
  }
}

function _template(template, args) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (args[key] === undefined) throw new Error(`缺少参数: ${key}`);
    return String(args[key]);
  });
}

function _deepTemplate(obj, args) {
  if (typeof obj === 'string') return _template(obj, args);
  if (Array.isArray(obj)) return obj.map(v => _deepTemplate(v, args));
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) result[k] = _deepTemplate(v, args);
    return result;
  }
  return obj;
}

function _combineSignals(s1, s2) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  s1.addEventListener('abort', onAbort);
  s2.addEventListener('abort', onAbort);
  if (s1.aborted || s2.aborted) controller.abort();
  return controller.signal;
}

module.exports = { type: 'http', execute };
