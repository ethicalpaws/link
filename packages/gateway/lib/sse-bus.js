/**
 * LINK Gateway · SSE 事件总线
 *
 * 职责：管理 SSE 客户端连接，支持按房间订阅广播。
 * 内置环形缓冲区，断线重连时自动补发遗漏事件。
 */

const MAX_BUFFER = 100;        // 最多保留 100 条历史事件
const BUFFER_TTL_MS = 300_000; // 5 分钟内的事件才补发

class SSEBus {
  constructor() {
    this.clients = new Map();
    this.global = new Set();
    this._buffer = [];          // 环形缓冲区 [{ event, roomId, timestamp }]
  }

  /** 添加 SSE 客户端连接 */
  add(res, roomId = null) {
    if (roomId) {
      if (!this.clients.has(roomId)) this.clients.set(roomId, new Set());
      this.clients.get(roomId).add(res);
    } else {
      this.global.add(res);
    }
  }

  /** 移除 SSE 客户端连接 */
  remove(res) {
    for (const [roomId, set] of this.clients) {
      set.delete(res);
      if (set.size === 0) this.clients.delete(roomId);
    }
    this.global.delete(res);
  }

  /** 当前连接数 */
  get size() {
    let count = this.global.size;
    for (const set of this.clients.values()) count += set.size;
    return count;
  }

  /** 广播事件并存入缓冲区 */
  broadcast(event, roomId = null) {
    // 存入缓冲区
    const entry = { event: JSON.parse(JSON.stringify(event)), roomId: roomId, timestamp: Date.now() };
    this._buffer.push(entry);
    if (this._buffer.length > MAX_BUFFER) this._buffer.shift();

    // 广播到客户端
    const data = 'data: ' + JSON.stringify(event) + '\n\n';
    const targets = new Set();
    if (roomId && this.clients.has(roomId)) {
      for (const c of this.clients.get(roomId)) targets.add(c);
    }
    for (const c of this.global) targets.add(c);

    for (const c of targets) {
      try { c.write(data); } catch (_) { this.remove(c); }
    }
  }

  /**
   * 获取指定时间之后的遗漏事件
   * @param {number} since - 时间戳（毫秒）
   * @param {string|null} roomId - 房间 ID
   * @returns {Array} 遗漏事件列表
   */
  getMissedEvents(since, roomId) {
    if (!since) return [];
    const cutoff = Date.now() - BUFFER_TTL_MS;
    const time = Math.max(since, cutoff);
    return this._buffer.filter(function(e) {
      if (e.timestamp < time) return false;
      if (roomId && e.roomId && e.roomId !== roomId) return false;
      return true;
    });
  }

  /** 清空缓冲区 */
  clearBuffer() { this._buffer = []; }
}

module.exports = { SSEBus };
