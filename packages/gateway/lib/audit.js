/**
 * LINK · 审计日志
 *
 * 记录工具调用和权限拒绝等操作到 data/audit.log
 */

const fs = require('fs');
const path = require('path');

let _logFile = null;

function init(dataDir) {
  _logFile = path.join(dataDir, 'audit.log');
  try { fs.appendFileSync(_logFile, ''); } catch {}
}

function _write(entry) {
  if (!_logFile) return;
  try {
    const line = JSON.stringify({ ...entry, time: new Date().toISOString() }) + '\n';
    fs.appendFileSync(_logFile, line, 'utf-8');
  } catch {}
}

/** 记录工具调用 */
function toolCall(agentId, toolName, args, result, ok) {
  _write({ type: 'tool_call', agent: agentId, tool: toolName, args, ok, result: ok ? 'ok' : result });
}

/** 记录权限拒绝 */
function permissionDenied(agentId, toolName, args) {
  _write({ type: 'permission_denied', agent: agentId, tool: toolName, args });
}

/** 记录路径违规 */
function pathViolation(agentId, toolName, attemptedPath) {
  _write({ type: 'path_violation', agent: agentId, tool: toolName, path: attemptedPath });
}

module.exports = { init, toolCall, permissionDenied, pathViolation };
