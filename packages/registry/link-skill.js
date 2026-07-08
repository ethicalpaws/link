/**
 * LINK SDK · LinkSkill 基类
 *
 * 社区开发者发布 Skill 包时继承此类。
 * LINK 启动时自动扫描 node_modules/@link/skill-*，加载并注册。
 *
 * 用法:
 *   const { LinkSkill } = require('@link/sdk');
 *   class MySkill extends LinkSkill { ... }
 *   module.exports = MySkill;
 */

class LinkSkill {
  /** 唯一 ID，全局不重复（如 'rss-reader'） */
  static id = '';

  /** 语义化版本 */
  static version = '1.0.0';

  /** 兼容的 LINK 版本范围（如 '>=1.0.0'） */
  static linkVersion = '>=1.0.0';

  /** 人类可读名称 */
  static displayName = '';

  /** 简短描述 */
  static description = '';

  /** 作者 */
  static author = '';

  /** 许可证 */
  static license = 'MIT';

  /**
   * 返回此包提供的所有 Tool
   * @returns {Array<{ name, displayName, description, parameters, execute }>}
   */
  getTools() { return []; }

  /**
   * 返回此包提供的所有 Skill（工作流）
   * @returns {Array<{ name, displayName, description, steps }>}
   */
  getSkills() { return []; }

  /** 安装时调用（可选） */
  async onInstall(ctx) { /* 校验环境、创建目录 */ }

  /** 卸载时调用（可选） */
  async onUninstall(ctx) { /* 清理资源 */ }

  /** 每次 LINK 启动时调用（可选） */
  async onStartup(ctx) { return { status: 'ready' }; }
}

module.exports = { LinkSkill };
