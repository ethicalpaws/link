/**
 * LINK Gateway · 房间管理器
 *
 * 职责：房间 CRUD + 消息持久化 + 自动截断归档。
 * 配置均来自外部注入，不包含 LINK 实例的特定逻辑。
 */

const fs = require('fs');
const path = require('path');

class RoomManager {
  constructor({ dataDir, maxHistoryPerRoom, defaultActiveAgents }) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data');
    this.roomsFile = path.join(this.dataDir, 'rooms.json');
    this.maxHistoryPerRoom = maxHistoryPerRoom || 500;
    this.defaultActiveAgents = defaultActiveAgents || [];

    this.rooms = new Map();
    this._ensureDataDir();
    this._load();
    if (this.rooms.size === 0) this.create('默认群聊');
  }

  create(name) {
    const id = this._genId();
    const now = new Date().toISOString();
    const room = {
      id, name: name || '新群聊',
      history: [],
      activeAgents: [...this.defaultActiveAgents],
      summary: null,
      createdAt: now, updatedAt: now,
    };
    this.rooms.set(id, room);
    this._save();
    return this._sanitize(room);
  }

  get(id) {
    const room = this.rooms.get(id);
    return room ? this._sanitize(room, true) : null;
  }

  getMeta(id) {
    const room = this.rooms.get(id);
    return room ? this._sanitize(room, false) : null;
  }

  list() {
    return Array.from(this.rooms.values())
      .map(r => this._sanitize(r, false))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  delete(id) {
    if (this.rooms.size <= 1) return false;
    const ok = this.rooms.delete(id);
    if (ok) this._save();
    return ok;
  }

  appendHistory(id, entry) {
    const room = this.rooms.get(id);
    if (!room) return false;
    room.history.push(entry);
    room.updatedAt = new Date().toISOString();
    this._truncateIfNeeded(room);
    this._save();
    return true;
  }

  appendBatch(id, entries) {
    const room = this.rooms.get(id);
    if (!room) return false;
    room.history.push(...entries);
    this._truncateIfNeeded(room);
    room.updatedAt = new Date().toISOString();
    this._save();
    return true;
  }

  updateActiveAgents(id, agentIds) {
    const room = this.rooms.get(id);
    if (!room) return false;
    room.activeAgents = agentIds;
    this._save();
    return true;
  }

  _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  _sanitize(room, includeHistory = false) {
    const base = {
      id: room.id, name: room.name, summary: room.summary,
      activeAgents: room.activeAgents,
      createdAt: room.createdAt, updatedAt: room.updatedAt,
      messageCount: room.history.length,
    };
    if (includeHistory) {
      base.history = room.history;
      if (room.history.length > 0) {
        const last = room.history[room.history.length - 1];
        base.lastMessage = {
          role: last.role, name: last.name || null,
          content: (last.content || '').slice(0, 80) + ((last.content || '').length > 80 ? '…' : ''),
        };
      }
    }
    return base;
  }

  _save() {
    try {
      if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
      const plain = {};
      for (const [id, room] of this.rooms) plain[id] = room;
      const tmp = this.roomsFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(plain, null, 2), 'utf-8');
      fs.renameSync(tmp, this.roomsFile);
    } catch (err) {
      console.error('✗ 保存房间失败:', err.message);
    }
  }

  _truncateIfNeeded(room) {
    if (room.history.length <= this.maxHistoryPerRoom) return;
    const excess = room.history.length - this.maxHistoryPerRoom;
    const dropped = room.history.splice(0, excess);
    const userCount = dropped.filter(m => m.role === 'user').length;
    const agentCounts = {};
    dropped.filter(m => m.role === 'assistant').forEach(m => {
      agentCounts[m.name] = (agentCounts[m.name] || 0) + 1;
    });
    const agentSummary = Object.entries(agentCounts)
      .map(([name, c]) => `${name} ${c}条`).join(' ');
    room.summary = `📜 ${dropped.length} 条已归档（用户 ${userCount} 条，${agentSummary}）`;
  }

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  _load() {
    try {
      if (!fs.existsSync(this.roomsFile)) return;
      const raw = JSON.parse(fs.readFileSync(this.roomsFile, 'utf-8'));
      for (const [id, room] of Object.entries(raw)) {
        if (!room.history) room.history = [];
        if (!room.activeAgents) room.activeAgents = [...this.defaultActiveAgents];
        this.rooms.set(id, room);
      }
    } catch (err) {
      console.error('✗ 加载房间失败:', err.message);
    }
  }
}

module.exports = { RoomManager };
