/**
 * LINK Gateway · Room Auth Middleware
 *
 * 可选的房间级 Bearer Token 认证。
 * 不影响现有无 token 的客户端（向后兼容）。
 * Token 存储在 data/room-tokens.json，每房间一个 hex token。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKENS_FILE = 'room-tokens.json';

/**
 * 加载所有 room token，格式: { [roomId]: { token, name, createdAt } }
 */
function loadTokens(dataDir) {
  const file = path.join(dataDir, TOKENS_FILE);
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return {}; }
}

/**
 * 保存 room token（原子写入）
 */
function saveTokens(dataDir, tokens) {
  const file = path.join(dataDir, TOKENS_FILE);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tokens, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

/**
 * 为指定房间生成或更新 token
 * @returns {string} 生成的 token
 */
function upsertRoomToken(dataDir, roomId, roomName) {
  const tokens = loadTokens(dataDir);
  const existing = tokens[roomId];
  // 如果已有 token 且长度合理，直接返回（不重复生成）
  if (existing && existing.token && existing.token.length === 64) {
    return existing.token;
  }
  const token = crypto.randomBytes(32).toString('hex');
  tokens[roomId] = { token, name: roomName || roomId, createdAt: new Date().toISOString() };
  saveTokens(dataDir, tokens);
  return token;
}

/**
 * 删除房间 token
 */
function deleteRoomToken(dataDir, roomId) {
  const tokens = loadTokens(dataDir);
  if (!tokens[roomId]) return;
  delete tokens[roomId];
  saveTokens(dataDir, tokens);
}

/**
 * 验证 token 是否属于指定房间
 * @returns {boolean}
 */
function validateRoomToken(dataDir, roomId, token) {
  const tokens = loadTokens(dataDir);
  const entry = tokens[roomId];

  // 房间从未配置 token → 无 token 时允许（向后兼容），有 token 时拒绝
  if (!entry) return !token;

  // 房间已配置 token → 必须完全匹配
  return entry.token === token;
}

/**
 * 从 Authorization header 提取 Bearer token
 */
function extractToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

/**
 * 创建房间认证中间件
 * @param {string} dataDir
 * @param {string} paramName - room ID 参数名（如 'roomId' 或 'id'）
 */
function createRoomAuthMiddleware(dataDir, paramName) {
  return function roomAuthMiddleware(req, res, next) {
    // admin 路由已在 gateway 层做了 Basic Auth，这里不做重复校验
    const token = extractToken(req.headers.authorization);
    // 无 token → 放行（向后兼容）
    if (!token) return next();

    // 从不同位置获取 roomId
    const roomId = req.params[paramName] || req.body?.roomId || req.query?.roomId;
    if (roomId && !validateRoomToken(dataDir, roomId, token)) {
      return res.status(403).json({ error: '房间 token 无效或已失效' });
    }
    next();
  };
}

module.exports = { upsertRoomToken, deleteRoomToken, validateRoomToken, createRoomAuthMiddleware };
