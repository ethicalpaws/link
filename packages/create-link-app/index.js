#!/usr/bin/env node

/**
 * create-link-app · LINK 项目脚手架
 *
 * 用法: npm create link-app my-project
 * 或:   npx create-link-app my-project
 *
 * 在当前目录创建 my-project/，包含 LINK 系统的基本骨架。
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function main() {
  const projectName = process.argv[2];
  if (!projectName) {
    console.log('用法: npm create link-app <项目名称>');
    console.log('示例: npm create link-app my-life');
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(targetDir)) {
    console.error(`✗ 目录 "${projectName}" 已存在`);
    process.exit(1);
  }

  console.log(`🔗 正在创建 LINK 项目: ${projectName}`);
  console.log('');

  // 复制模板
  copyTemplate(TEMPLATE_DIR, targetDir);

  // 替换 package.json 中的项目名
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.name = projectName;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  // 设置 bin/link 为可执行
  const binPath = path.join(targetDir, 'bin', 'link');
  try { fs.chmodSync(binPath, 0o755); } catch (_) {}

  console.log(`✅ 项目已创建: ${targetDir}`);
  console.log('');
  console.log('接下来:');
  console.log(`  cd ${projectName}`);
  console.log('  npm install');
  console.log('  npm start');
  console.log('');
  console.log('然后打开浏览器:');
  console.log('  💬 聊天: http://localhost:3000');
  console.log('  ⚙ 管理: http://localhost:3000/admin');
  console.log('');
}

function copyTemplate(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTemplate(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

main();
