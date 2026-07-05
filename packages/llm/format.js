/**
 * LINK LLM 模块 · OpenAI 兼容格式工具
 *
 * 职责：统一的请求体构建 + 响应解析（含 tool_calls），
 *       所有 provider 共用，避免各自重复实现。
 *
 * 标准 OpenAI API 格式:
 *   请求: { model, messages, tools?, max_tokens }
 *   响应: { choices: [{ message: { content, tool_calls? } }] }
 */

/**
 * 去除思考标签
 */
function stripThinking(text) {
  return text ? text.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : '';
}

/**
 * 安全解析 JSON，LLM 偶尔生成格式错误的 JSON 不会崩溃
 */
function safeJSONParse(raw, fallback) {
  if (typeof raw !== 'string') return raw || fallback || {};
  try {
    return JSON.parse(raw);
  } catch {
    // LLM 常见错误：尾逗号、单引号、换行符
    try {
      return JSON.parse(raw
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/\n/g, ' ')
        .replace(/\r/g, '')
      );
    } catch {
      return fallback || {};
    }
  }
}

/**
 * 构建请求体
 * @param {object} opts - { model, messages, tools, maxTokens }
 * @returns {object}
 */
function buildBody(opts) {
  if (!opts || !opts.messages) throw new Error('buildBody: messages 不能为空');
  const body = {
    model: opts.model || 'default',
    messages: opts.messages,
    max_tokens: opts.maxTokens || 8192,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
  }
  return body;
}

/**
 * 解析 OpenAI 兼容响应，提取 content + tool_calls
 * @param {object} data - HTTP 响应的 JSON
 * @returns {{ content: string, tool_calls: Array<{ id, name, args }> }}
 */
function parseResponse(data) {
  if (!data || !data.choices || !data.choices[0]) {
    return { content: '', tool_calls: [] };
  }

  const msg = data.choices[0].message || {};
  if (!msg) return { content: '', tool_calls: [] };

  const content = stripThinking(msg.content || '');

  if (msg.tool_calls && msg.tool_calls.length > 0) {
    try {
      return {
        content,
        tool_calls: msg.tool_calls.map(t => {
          const raw = t.function ? t.function.arguments : null;
          return {
            id: t.id || '',
            name: (t.function && t.function.name) || '',
            args: safeJSONParse(raw, {}),
          };
        }),
      };
    } catch (e) {
      // 极端情况：tool_calls 结构异常，放弃工具调用返回纯文本
      return { content: '(工具调用解析失败: ' + e.message + ')\n' + content, tool_calls: [] };
    }
  }

  return { content, tool_calls: [] };
}

module.exports = { buildBody, parseResponse, stripThinking, safeJSONParse };
