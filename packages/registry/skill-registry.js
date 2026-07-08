/**
 * LINK Registry · 工作流注册表
 *
 * 职责：管理多步骤工作流（Skill）的注册和执行。
 * Skill 是多个 Tool 的编排组合，支持顺序执行和跨步骤数据传递。
 *
 * YAML 示例:
 *   name: daily_digest
 *   description: 每日摘要生成
 *   steps:
 *     - tool: fetch_rss
 *       params:
 *         feedUrl: "https://example.com/rss"
 *     - tool: summarize
 *       params:
 *         text: "{{steps.fetch_rss.result}}"
 */

class SkillRegistry {
  constructor(toolRegistry) {
    this._skills = new Map();
    this._toolRegistry = toolRegistry;
  }

  /** 注册一个工作流 */
  register(skill) {
    if (!skill.name) throw new Error('Skill 必须包含 name');
    this._skills.set(skill.name, skill);
  }

  /** 根据名称查找 */
  get(name) {
    return this._skills.get(name) || null;
  }

  /** 列出所有已注册 */
  list() {
    return Array.from(this._skills.keys());
  }

  /**
   * 执行一个工作流（顺序执行，自动传递数据）
   * @param {string} name - Skill 名称
   * @param {object} triggerArgs - 触发参数
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>} { results: {}, finalOutput: string }
   */
  async execute(name, triggerArgs = {}, signal) {
    const skill = this._skills.get(name);
    if (!skill) throw new Error(`Skill "${name}" 未注册`);

    const context = { ...triggerArgs };
    const results = {};

    let stepIdx = 0;
    for (const step of skill.steps) {
      if (signal?.aborted) throw new Error('Skill 执行被取消');

      // 解析参数（支持引用上一步结果）
      const resolvedParams = {};
      if (step.params) {
        for (const [k, v] of Object.entries(step.params)) {
          resolvedParams[k] = _resolveRef(v, results, context);
        }
      }

      // 执行工具
      const toolResult = await this._toolRegistry.execute(step.tool, resolvedParams, signal);

      // 保存结果供后续步骤引用
      const stepKey = step.name || `step_${stepIdx}`;
      results[stepKey] = { result: toolResult };
      stepIdx++;
    }

    return { results, finalOutput: Object.values(results).pop()?.result || '' };
  }

  /**
   * 检查 Agent 是否有权执行该 Skill
   * @param {string} name - Skill 名称
   * @param {string[]} [allowedSkills] - Agent 配置的 skills 权限列表
   */
  isAllowed(name, allowedSkills) {
    // 空列表 = 无权使用任何 skill（与 ToolRegistry 语义一致）
    if (!allowedSkills || allowedSkills.length === 0) return false;
    return allowedSkills.includes(name);
  }

  get size() { return this._skills.size; }
}

/** 解析 {{steps.xxx.result}} 引用 */
function _resolveRef(value, stepResults, context) {
  if (typeof value !== 'string') return value;

  return value.replace(/\{\{(\w+)(?:\.(\w+))?(?:\.(\w+))?\}\}/g, (match, ns, key, sub) => {
    if (ns === 'steps' && key) {
      const step = stepResults[key];
      if (!step) throw new Error(`步骤 "${key}" 不存在或尚未执行`);
      return sub ? String(step[sub] || '') : String(step.result || '');
    }
    if (context[ns] !== undefined) {
      return key ? String(context[ns][key] || '') : String(context[ns]);
    }
    return match;  // 不匹配则保持原样
  });
}

module.exports = { SkillRegistry };
