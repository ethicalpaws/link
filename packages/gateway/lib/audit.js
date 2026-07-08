/**
 * LINK · 审计日志
 *
 * 工具调用和权限拒绝等操作。
 * 底层委托给 logger，写入 data/logs/audit-YYYY-MM-DD.log
 */

const { logger } = require('./logger');

let _initialized = false;

function init(dataDir) {
  // 日志目录由 logger 统一管理，audit 只需标记已初始化
  _initialized = true;
}

function _ensureInit() {
  if (!_initialized) {
    // 降级：直接打印，不崩溃
    console.warn('[audit] not initialized via createServer, audit events will be lost');
  }
}

/** 记录工具调用 */
function toolCall(agentId, toolName, args, result, ok) {
  _ensureInit();
  const entry = ok
    ? { type: 'tool_call', agent: agentId, tool: toolName, args }
    : { type: 'tool_call_failed', agent: agentId, tool: toolName, args, error: String(result).slice(0, 200) };
  logger.info('audit', ok ? '工具调用成功' : '工具调用失败', entry);
}

/** 记录权限拒绝 */
function permissionDenied(agentId, toolName, args) {
  _ensureInit();
  logger.warn('audit', '权限拒绝', { type: 'permission_denied', agent: agentId, tool: toolName, args });
}

/** 记录路径违规 */
function pathViolation(agentId, toolName, attemptedPath) {
  _ensureInit();
  logger.error('audit', '路径安全违规', { type: 'path_violation', agent: agentId, tool: toolName, path: attemptedPath });
}

module.exports = { init, toolCall, permissionDenied, pathViolation };
