/**
 * LINK LLM 模块 · 统一入口
 *
 * 职责：提供统一的 LLM 调用接口，屏蔽底层 provider 差异。
 *       其他模块只需要 import 这个文件，不关心底层是 OpenClaw 还是直连。
 *
 * 对外接口:
 *   llm.call(agentId, messages)        → Promise<string>
 *   llm.stream(agentId, messages)      → AsyncGenerator<string>
 *   llm.healthCheck()                  → Promise<{ ok, latency, error? }>
 *   llm.setProvider(config)            → void
 *
 * 使用示例:
 *   const { llm } = require('@link/llm');
 *   const reply = await llm.call('chronos', [{ role: 'user', content: '你好' }]);
 */

const { LLMConfig } = require('./config');
const { CircuitBreaker } = require('./health');
const openclaw = require('./providers/openclaw');

// ─── 内部状态 ───

const config = new LLMConfig();
const breaker = new CircuitBreaker();
let useFallback = false;     // 是否已切换到备用 provider

const openaiCompat = require('./providers/openai-compat');

// ─── provider 注册表 ───

const PROVIDERS = {
  openclaw,
};

/** 查找 provider，未显式注册的默认走 OpenAI 兼容适配器（覆盖 MiniMax/DeepSeek/OpenAI 等） */
function resolveProvider(name) {
  return PROVIDERS[name] || openaiCompat;
}

// ─── 对外接口 ───

/**
 * 同步调用：发消息，等完整回复
 * @param {string} agentId
 * @param {Array} messages - [{ role, content }]
 * @returns {Promise<string>}
 */
async function call(agentId, messages, tools) {
  const providerConfig = config.getActive(useFallback);
  if (!providerConfig) throw new Error('未配置 LLM provider');

  const provider = resolveProvider(providerConfig.provider);

  try {
    const result = await provider.call(agentId, messages, providerConfig, breaker, tools);
    if (typeof result === 'string') return { content: result, tool_calls: [] };
    return { content: result.content || '', tool_calls: result.tool_calls || [] };
  } catch (err) {
    // 主 provider 失败，尝试切换备用
    if (!useFallback && config.get().fallback) {
      console.warn(`  ↳ 主 provider 失败，切换到备用: ${err.message}`);
      useFallback = true;
      return call(agentId, messages, tools);
    }
    throw err;
  }
}

/**
 * 流式调用：逐 token 返回
 * @param {string} agentId
 * @param {Array} messages
 * @returns {AsyncGenerator<string>}
 */
async function* stream(agentId, messages) {
  const providerConfig = config.getActive(useFallback);
  if (!providerConfig) throw new Error('未配置 LLM provider');

  const provider = resolveProvider(providerConfig.provider);

  try {
    yield* provider.stream(agentId, messages, providerConfig, breaker);
  } catch (err) {
    if (!useFallback && config.get().fallback) {
      console.warn(`  ↳ 主 provider streaming 失败，切换到备用: ${err.message}`);
      useFallback = true;
      yield* stream(agentId, messages);
    }
    throw err;
  }
}

/**
 * 健康检查：检测当前 provider 是否可用
 * @returns {Promise<{ ok: boolean, latency: number, provider: string, breaker: object }>}
 */
async function healthCheck() {
  const providerConfig = config.getActive(false);
  if (!providerConfig) return { ok: false, latency: null, provider: 'none', breaker: breaker.status() };

  const provider = resolveProvider(providerConfig.provider);

  const result = await provider.healthCheck(providerConfig);
  return { ...result, provider: providerConfig.provider, breaker: breaker.status() };
}

/**
 * 运行时切换 provider 配置（不重启）
 * @param {object} newConfig - { primary: { provider, model, apiKey, baseUrl }, fallback?: {...} }
 */
function setProvider(newConfig) {
  config.set(newConfig);
  useFallback = false;     // 切换配置时重置
  breaker.reset();          // 重置断路器
  console.log(`  ↳ LLM provider 已更新: ${newConfig.primary?.provider || 'none'}`);
}

/**
 * 获取当前 provider 状态
 */
function getStatus() {
  return {
    active: config.getActive(useFallback)?.provider || 'none',
    useFallback,
    breaker: breaker.status(),
    config: config.get(),
  };
}

module.exports = {
  call,
  stream,
  healthCheck,
  setProvider,
  getStatus,
};
