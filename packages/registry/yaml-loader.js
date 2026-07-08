/**
 * LINK Registry · YAML 加载器
 *
 * 职责：扫描 tools/*.yaml → 注册 Tool
 *       扫描 skills/*.yaml → 注册 Skill
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class YamlLoader {
  /**
   * @param {ToolRegistry} toolRegistry
   * @param {object} [executors] - 自定义执行器集合（可选）
   */
  constructor(toolRegistry, executors = null) {
    this.registry = toolRegistry;
    this.executors = executors || _defaultExecutors();
    this._loadedTools = [];
    this._loadedSkills = [];
  }

  /** 从目录加载所有 *.yaml 工具文件 */
  loadFromDir(dirPath) {
    if (!fs.existsSync(dirPath)) return 0;
    const files = fs.readdirSync(dirPath).filter(f => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.startsWith('_'));
    let count = 0;
    for (const file of files) {
      try {
        const tool = this._parseFile(path.join(dirPath, file));
        this.registry.register(tool);
        this._loadedTools.push(tool.name);
        count++;
      } catch (err) {
        console.warn(`⚠ 加载工具失败 ${file}: ${err.message}`);
      }
    }
    if (count > 0) console.log(`  ✓ 已加载 ${count} 个 YAML 工具: ${this._loadedTools.join(', ')}`);
    return count;
  }

  /**
   * 从目录加载所有 *.yaml Skill 文件到 SkillRegistry
   * @param {string} dirPath
   * @param {SkillRegistry} skillRegistry
   * @returns {number} 加载的 Skill 数量
   */
  loadSkillsFromDir(dirPath, skillRegistry) {
    if (!fs.existsSync(dirPath)) return 0;
    const files = fs.readdirSync(dirPath).filter(f => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.startsWith('_'));
    let count = 0;
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        const config = yaml.load(raw);
        if (!config.name || !config.steps) throw new Error('缺少 name 或 steps');
        skillRegistry.register(config);
        this._loadedSkills.push(config.name);
        count++;
      } catch (err) {
        console.warn(`⚠ 加载 Skill 失败 ${file}: ${err.message}`);
      }
    }
    if (count > 0) console.log(`  ✓ 已加载 ${count} 个 Skill: ${this._loadedSkills.join(', ')}`);
    return count;
  }

  _parseFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const config = yaml.load(raw);
    if (!config.name) throw new Error('缺少 name');
    if (!config.execution?.type) throw new Error('缺少 execution.type');
    const executor = this.executors[config.execution.type];
    if (!executor) throw new Error(`不支持的执行类型: ${config.execution.type}`);
    return {
      name: config.name,
      description: config.description || '',
      parameters: config.parameters || {},
      execute: (args, signal) => executor.execute(config.execution, args, signal),
    };
  }

  get loaded() { return [...this._loadedTools]; }
  get loadedSkills() { return [...this._loadedSkills]; }
}

function _defaultExecutors() {
  const cmd = require('./executors/command');
  const http = require('./executors/http');
  const ssh = require('./executors/ssh');
  return { command: cmd, http: http, ssh: ssh };
}

module.exports = { YamlLoader };
