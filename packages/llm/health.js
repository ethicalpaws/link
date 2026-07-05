/**
 * LINK LLM 模块 · 健康检查 + 断路器
 *
 * 职责：定期检查 LLM provider 可用性，故障时自动断开避免雪崩。
 *
 * 断路器状态：
 *   closed   → 正常，请求通过
 *   open     → 故障，请求直接失败（不发起真正的 HTTP 调用）
 *   half-open → 尝试恢复，放行一个探针请求
 *
 * 阈值：连续 3 次失败 → open
 * 恢复：30 秒后 → half-open
 */

const STATE_FILE = Symbol('circuitState');

class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 3;
    this.resetTimeout = options.resetTimeout || 30_000;
    this[STATE_FILE] = {
      failures: 0,
      state: 'closed',      // closed | open | half-open
      lastFailure: null,
      lastCheck: null,
    };
  }

  get state() { return this[STATE_FILE].state; }

  /**
   * 断路器代理调用
   * @param {Function} fn - 真正的请求函数
   * @returns {Promise<any>}
   */
  async call(fn) {
    if (this[STATE_FILE].state === 'open') {
      const elapsed = Date.now() - this[STATE_FILE].lastFailure;
      if (elapsed < this.resetTimeout) {
        throw new Error('LLM provider 当前不可用（断路器已断开）');
      }
      // 超过重置时间 → half-open，允许一次探针
      this[STATE_FILE].state = 'half-open';
    }

    try {
      const result = await fn();
      // 成功 → 重置
      this[STATE_FILE].failures = 0;
      if (this[STATE_FILE].state === 'half-open') {
        console.log('  ↳ ✓ LLM provider 已恢复');
      }
      this[STATE_FILE].state = 'closed';
      return result;
    } catch (err) {
      this[STATE_FILE].failures++;
      this[STATE_FILE].lastFailure = Date.now();

      if (this[STATE_FILE].failures >= this.threshold) {
        this[STATE_FILE].state = 'open';
        console.warn(`  ↳ ✗ LLM provider 已断开（连续 ${this.threshold} 次失败，${this.resetTimeout / 1000}s 后尝试恢复）`);
      }
      throw err;
    }
  }

  /** 健康检查：返回当前状态摘要 */
  status() {
    return {
      state: this[STATE_FILE].state,
      failures: this[STATE_FILE].failures,
      threshold: this.threshold,
      lastFailure: this[STATE_FILE].lastFailure
        ? new Date(this[STATE_FILE].lastFailure).toISOString()
        : null,
      healthy: this[STATE_FILE].state === 'closed',
    };
  }

  /** 手动重置 */
  reset() {
    this[STATE_FILE].failures = 0;
    this[STATE_FILE].state = 'closed';
    this[STATE_FILE].lastFailure = null;
  }
}

module.exports = { CircuitBreaker };
