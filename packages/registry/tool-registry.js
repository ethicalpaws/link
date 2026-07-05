/**
 * LINK Registry · 工具注册表
 *
 * 职责：管理所有已注册的 Tool。
 * Agent Runtime 在执行 tool_call 时通过这里查找工具有效执行方式。
 *
 * 注册来源：
 *   1. 内置工具（web_search, read_file, write_file）
 *   2. tools/*.yaml 配置
 *   3. 社区 @link/skill-* 包
 */

class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  /** 注册一个工具 */
  register(tool) {
    if (!tool.name) throw new Error('工具必须包含 name');
    this._tools.set(tool.name, tool);
  }

  /** 批量注册 */
  registerAll(tools) {
    for (const t of tools) this.register(t);
  }

  /** 根据名称查找工具 */
  get(name) {
    return this._tools.get(name) || null;
  }

  /** 获取所有工具定义（给 LLM 当 tools 参数用） */
  getAllDefinitions() {
    return Array.from(this._tools.values()).map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: _normalizeParams(t.parameters || {}),
      },
    }));
  }

  /** 执行一个工具（被 Agent Runtime 调用） */
  async execute(name, args, signal) {
    const tool = this._tools.get(name);
    if (!tool) throw new Error(`工具 "${name}" 未注册`);
    if (!tool.execute) throw new Error(`工具 "${name}" 没有 execute 方法`);
    return await tool.execute(args, signal);
  }

  /** 列出所有已注册工具名 */
  list() {
    return Array.from(this._tools.keys());
  }

  /** 卸载工具 */
  unregister(name) {
    return this._tools.delete(name);
  }

  /** 获取注册的工具数量 */
  get size() { return this._tools.size; }
}

/** 将简化参数格式转换为 LLM 可用的 JSON Schema */
function _normalizeParams(params) {
  if (!params || typeof params !== 'object') return {};
  // 已经是标准 JSON Schema（有 type: object + properties 字段）
  if (params.type === 'object' && params.properties) return params;

  // 简化格式 { field: { type, description, required } }
  const keys = Object.keys(params);
  if (keys.length > 0) {
    const first = params[keys[0]];
    if (first && typeof first === 'object' && (first.type || first.description)) {
      const properties = {};
      const required = [];
      for (const [key, val] of Object.entries(params)) {
        if (val && typeof val === 'object') {
          const prop = {};
          if (val.type) prop.type = val.type;
          if (val.description) prop.description = val.description;
          if (val.enum) prop.enum = val.enum;
          if (val.default !== undefined) prop.default = val.default;
          properties[key] = prop;
          if (val.required) required.push(key);
        }
      }
      return { type: 'object', properties, required: required.length > 0 ? required : undefined };
    }
  }

  return params;
}

module.exports = { ToolRegistry };
