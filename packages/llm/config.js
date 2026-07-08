/**
 * LINK LLM 模块 · Provider 配置
 *
 * 职责：管理 LLM provider 的配置，支持运行时切换。
 * 设计原则：配置即数据，不包含任何业务逻辑。
 */

const PROVIDER_CONFIG = Symbol('providerConfig');

class LLMConfig {
  constructor() {
    this[PROVIDER_CONFIG] = this._defaults();
  }

  _defaults() {
    return {
      primary: null,       // { provider, model, apiKey, baseUrl, ... }
      fallback: null,      // 同上，主 provider 不可用时自动切换
      timeout: 60_000,
      retries: 2,
      retryBaseDelay: 500,
      maxTokens: 8192,
    };
  }

  /** 更新配置（运行时调用，不重启） */
  set(config) {
    if (!config) return;
    if (config.primary) this[PROVIDER_CONFIG].primary = config.primary;
    if (config.fallback) this[PROVIDER_CONFIG].fallback = config.fallback;
    if (config.timeout) this[PROVIDER_CONFIG].timeout = config.timeout;
    if (config.retries !== undefined) this[PROVIDER_CONFIG].retries = config.retries;
    if (config.retryBaseDelay) this[PROVIDER_CONFIG].retryBaseDelay = config.retryBaseDelay;
    if (config.maxTokens) this[PROVIDER_CONFIG].maxTokens = config.maxTokens;
  }

  /** 获取当前完整配置 */
  get() {
    return { ...this[PROVIDER_CONFIG] };
  }

  /** 获取当前生效的 provider（如果 primary 不可用，返回 fallback） */
  getActive(useFallback = false) {
    return useFallback
      ? this[PROVIDER_CONFIG].fallback || this[PROVIDER_CONFIG].primary
      : this[PROVIDER_CONFIG].primary || this[PROVIDER_CONFIG].fallback;
  }
}

module.exports = { LLMConfig };
