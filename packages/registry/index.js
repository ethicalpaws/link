/**
 * LINK Registry · 工具与工作流注册中心
 *
 * 提供:
 *   - ToolRegistry  — 工具注册表
 *   - SkillRegistry — 工作流注册表
 *   - YamlLoader    — 从 YAML 配置加载工具
 *   - MCPBridge     — MCP 协议工具桥接
 *   - scanCommunityPackages — 扫描加载社区 @link/skill-* 包
 */

const { ToolRegistry } = require('./tool-registry');
const { SkillRegistry } = require('./skill-registry');
const { YamlLoader } = require('./yaml-loader');
const { scanCommunityPackages } = require('./package-scanner');
const { LinkSkill } = require('./link-skill');
const { MCPBridge } = require('./mcp-bridge');

module.exports = {
  ToolRegistry,
  SkillRegistry,
  YamlLoader,
  scanCommunityPackages,
  LinkSkill,
  MCPBridge,
};
