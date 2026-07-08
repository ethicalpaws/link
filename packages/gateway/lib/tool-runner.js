/**
 * LINK Gateway · 工具执行引擎
 *
 * 架构：
 *   - 中间件管道：验证 → 安全 → 执行 → 审计
 *   - 指数退避重试：网络错误 1s → 2s → 4s
 *   - 结构化错误分类
 */

const fs = require('fs');
const path = require('path');

// ─── 常量 ───

const TOOL_EXEC_TIMEOUT = 60_000;
const LLM_CALL_TIMEOUT = 180_000;
const MAX_TOOL_DEPTH = 5;
const MAX_RESULT_LENGTH = 10_000;

const BLOCKED_PATHS = [
  '/etc', '/sys', '/proc', '/dev', '/boot', '/root', '/var/log',
  '/var/lib', '/usr/share', '/usr/lib', '/bin', '/sbin', '/lib',
  'C:\\Windows', 'C:\\Program Files', 'C:\\ProgramData',
  'C:\\Program Files (x86)', 'C:\\System32', 'C:\\Users\\All Users',
];

const PATH_PARAM_KEYS = ['path', 'file', 'dir', 'directory', 'source', 'target', 'destination'];

// ─── 结构化错误 ───

class ToolError extends Error {
  constructor(message, { type = 'unknown', retryable = false, toolName = null } = {}) {
    super(message);
    this.name = 'ToolError';
    this.type = type;
    this.retryable = retryable;
    this.toolName = toolName;
  }
}

// ─── 工具函数 ───

function slash(p) { return p ? p.replace(/\\/g, '/') : p; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 带超时的 Promise 竞速 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new ToolError(`${label || '操作'}超时`, { type: 'timeout', retryable: true })), ms);
    }),
  ]);
}

/** 指数退避重试：1s → 2s → 4s */
async function withRetry(fn) {
  const delays = [1000, 2000, 4000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (!err.retryable) throw err;
      if (attempt < delays.length) await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}

// ─── 读取 agent 的 TOOLS.md ───

function loadAgentFiles(agentId, agentMap) {
  const agent = agentMap?.[agentId];
  const agentDir = agent?.agentDir || path.join(__dirname, '..', '..', 'agents', agentId);
  const result = { agentsMd: '', soulMd: '' };

  for (const [file, key] of [['AGENTS.md', 'agentsMd'], ['SOUL.md', 'soulMd']]) {
    const filePath = path.join(agentDir, file);
    try {
      if (fs.existsSync(filePath)) {
        result[key] = fs.readFileSync(filePath, 'utf-8').trim();
      }
    } catch (_) {}
  }
  return result;
}

function loadToolsMd(agentId, agentConfig) {
  if (!agentId) return '';
  const agentDir = agentConfig?.agentDir || path.join(__dirname, '..', '..', 'agents', agentId);
  const filePath = path.join(agentDir, 'TOOLS.md');
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim();
    }
  } catch (_) {}
  return '';
}

// ─── 安全检查 ───

function _isPathBlocked(rawPath) {
  const p = slash(rawPath).toLowerCase();
  for (const bp of BLOCKED_PATHS) {
    const norm = slash(bp).toLowerCase();
    if (p === norm || p.startsWith(norm + '/')) return true;
  }
  return false;
}

function _checkPathSafety(resolvedPath) {
  if (!resolvedPath) return null;
  const p = slash(resolvedPath);

  // 相对路径：禁止，必须用绝对路径
  if (!p.startsWith('/') && !p.match(/^[A-Za-z]:/)) {
    return `禁止使用相对路径，请使用绝对路径，例如 E:/BRIDGE/workspace/... 或 /home/user/...`;
  }

  // 系统敏感路径：禁止
  if (_isPathBlocked(p)) return `禁止访问系统敏感路径: ${resolvedPath}`;

  return null;
}

function _isPathParam(name) {
  return PATH_PARAM_KEYS.includes(name.toLowerCase());
}

// ─── 权限检查 ───

function _filterToolsByPermissions(defs, allowed) {
  if (!allowed || allowed.length === 0) return [];
  return defs.filter(d => allowed.includes(d.function.name));
}

function _isToolAllowed(name, allowed) {
  if (!allowed || allowed.length === 0) return false;
  return allowed.includes(name);
}

// ─── 工具指令 ───

function buildToolInstruction(tools, agentId, agentConfig) {
  const toolsMd = loadToolsMd(agentId, agentConfig);

  // 有 TOOLS.md → 优先用
  if (toolsMd) return toolsMd;

  // 无可用工具 → 返回空，不注入
  if (!tools || tools.length === 0) return '';

  // 有工具但无 TOOLS.md → 兜底默认格式
  return `你有以下工具可用：${tools.map(t => t.name).join('、')}。

你必须执行的操作规则：
1. 用户要求操作时，直接调用工具执行。
2. 你有这些工具的完全使用权。
3. 必须通过 tool_calls 执行。
4. 调用失败时告诉用户原因，不能伪造结果。`;
}

// ─── 中间件管道：执行单个工具 ───

async function executeToolCall(call, { agentId, allowedTools, toolRegistry, audit }) {
  // 1. 权限
  if (!_isToolAllowed(call.name, allowedTools)) {
    if (audit) audit.permissionDenied(agentId, call.name, call.args);
    return `错误：你没有使用工具 "${call.name}" 的权限`;
  }

  // 2. 参数校验
  const resolvedArgs = {};
  if (call.args && typeof call.args === 'object') {
    for (const k in call.args) {
      if (call.args[k] === null || call.args[k] === undefined) {
        return `错误：工具 "${call.name}" 的参数 "${k}" 不能为空`;
      }
      resolvedArgs[k] = call.args[k];
    }
  }

  // 3. 路径安全（只允许绝对路径，禁止系统敏感路径）
  for (const pk in resolvedArgs) {
    if (_isPathParam(pk)) {
      const danger = _checkPathSafety(resolvedArgs[pk]);
      if (danger) {
        if (audit) audit.pathViolation(agentId, call.name, resolvedArgs[pk]);
        return danger;
      }
    }
  }

  // 4. 执行（重试 + 超时）
  const result = await withRetry(() =>
    withTimeout(toolRegistry.execute(call.name, resolvedArgs), TOOL_EXEC_TIMEOUT, `工具 ${call.name}`)
  );

  // 5. 结果处理
  let content = typeof result === 'string' ? result : JSON.stringify(result);
  if (content.length > MAX_RESULT_LENGTH) {
    content = content.slice(0, MAX_RESULT_LENGTH) + '\n...（结果过长，已截断）';
  }

  if (audit) audit.toolCall(agentId, call.name, call.args, content, true);
  return content;
}

// ─── 主循环 ───

async function callWithTools(agentId, messages, llmCall, toolRegistry, agentConfig, _depth, audit) {
  const depth = _depth || 0;
  if (depth > MAX_TOOL_DEPTH) return '错误: 工具调用次数过多，已自动终止';
  if (!messages || !Array.isArray(messages)) return '错误: 消息格式无效';

  const allowedTools = agentConfig?.tools?.length > 0 ? agentConfig.tools : [];
  const allDefs = toolRegistry?.size > 0 ? toolRegistry.getAllDefinitions() : null;
  const tools = allDefs ? _filterToolsByPermissions(allDefs, allowedTools) : [];

  // 注入工具指令：有工具时注入完整指令，无工具但有 TOOLS.md 时注入行为规范
  const toolInstr = buildToolInstruction(tools, agentId, agentConfig);
  if ((tools.length > 0 || loadToolsMd(agentId, agentConfig)) && !messages.some(m => m.role === 'system' && m._toolInjected)) {
    messages.unshift({ role: 'system', content: toolInstr, _toolInjected: true });
  }

  // 调 LLM
  const resp = await withTimeout(
    llmCall(agentId, messages, tools.length > 0 ? tools : null),
    LLM_CALL_TIMEOUT, 'LLM 调用',
  );

  if (!resp || !resp.tool_calls || resp.tool_calls.length === 0) {
    return resp ? (resp.content || '') : '';
  }

  const finalContent = resp.content || '';

  messages.push({
    role: 'assistant',
    content: finalContent,
    tool_calls: resp.tool_calls.map(t => ({
      id: t.id, type: 'function',
      function: { name: t.name, arguments: typeof t.arguments === 'string' ? t.arguments : JSON.stringify(t.arguments) },
    })),
  });

  // 中间件管道执行每个工具
  for (const call of resp.tool_calls) {
    try {
      const content = await executeToolCall(call, { agentId, allowedTools, toolRegistry, audit });
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    } catch (err) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: `工具执行失败: ${err.message}` });
      if (audit) audit.toolCall(agentId, call.name, call.args, err.message, false);
    }
  }

  // 最终 LLM 调用
  const finalResp = await withTimeout(
    llmCall(agentId, messages, tools.length > 0 ? tools : null),
    LLM_CALL_TIMEOUT, 'LLM 调用',
  );

  if (finalResp && finalResp.tool_calls && finalResp.tool_calls.length > 0) {
    const prefix = finalContent ? finalContent + '\n' : '';
    return prefix + await callWithTools(agentId, messages, llmCall, toolRegistry, agentConfig, depth + 1, audit);
  }

  const prefix = finalContent ? finalContent + '\n' : '';
  return (prefix + (finalResp ? (finalResp.content || '') : '')).trim();
}

module.exports = { callWithTools, loadAgentFiles, buildToolInstruction, _isPathBlocked, _checkPathSafety, ToolError };
