/**
 * LINK Registry · 社区包扫描器
 *
 * 职责：LINK 启动时自动扫描 node_modules/@link/skill-*，
 *       加载并注册社区 Skill 包。
 *
 * 扫描流程:
 *   1. 遍历 node_modules/@link/skill-*
 *   2. 检查 package.json 中 link.skill === true
 *   3. 检查 link.minLinkVersion 兼容
 *   4. 实例化 → 注册工具 → 注册工作流
 */

const fs = require('fs');
const path = require('path');

/**
 * 扫描并加载所有社区 Skill 包
 *
 * @param {ToolRegistry} toolRegistry
 * @param {SkillRegistry} skillRegistry
 * @param {string} [nodeModulesPath] - 可选，指定 node_modules 路径
 * @returns {Promise<number>} 加载的包数量
 */
async function scanCommunityPackages(toolRegistry, skillRegistry, nodeModulesPath) {
  const nmDir = nodeModulesPath || path.join(process.cwd(), 'node_modules');
  const linkDir = path.join(nmDir, '@link');

  if (!fs.existsSync(linkDir)) return 0;

  const packages = fs.readdirSync(linkDir)
    .filter(name => name.startsWith('skill-'))
    .map(name => path.join(linkDir, name));

  let count = 0;

  for (const pkgDir of packages) {
    try {
      const pkgJson = JSON.parse(
        fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')
      );

      // 验证 link 标记
      if (!pkgJson.link?.skill) continue;

      // 验证版本兼容性（简化版）
      const linkVersion = '1.0.0';  // 当前 LINK 版本
      const minVersion = pkgJson.link.minLinkVersion || '>=0.0.0';
      if (!_satisfies(linkVersion, minVersion)) {
        console.warn(`  ⚠ ${pkgJson.name} 需要 LINK ${minVersion}，当前 ${linkVersion}，跳过`);
        continue;
      }

      // 加载包
      const SkillClass = require(pkgDir);
      const skill = typeof SkillClass === 'function' ? new SkillClass() : SkillClass;

      // 注册工具
      const tools = skill.getTools();
      if (tools.length > 0) toolRegistry.registerAll(tools);

      // 注册工作流
      const workflows = skill.getSkills();
      for (const w of workflows) skillRegistry.register(w);

      console.log(`  ✓ 加载 Skill: ${SkillClass.id || pkgJson.name} v${SkillClass.version || pkgJson.version}`);
      count++;
    } catch (err) {
      console.warn(`  ⚠ Skill 包加载失败 ${path.basename(pkgDir)}: ${err.message}`);
    }
  }

  return count;
}

/**
 * 简易版本匹配（仅处理 >= x.y.z）
 */
function _satisfies(version, range) {
  const v = version.split('.').map(Number);
  const r = range.replace('>=', '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((v[i] || 0) > (r[i] || 0)) return true;
    if ((v[i] || 0) < (r[i] || 0)) return false;
  }
  return true;
}

module.exports = { scanCommunityPackages };
