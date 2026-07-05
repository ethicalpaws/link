/**
 * LINK Registry · 本机命令执行器
 *
 * 执行类型: command
 * 适用: 本地脚本、文件操作、系统命令
 *
 * 安全说明：
 *   传入的 {{param}} 参数使用 shell 单引号转义，
 *   阻止命令注入但保留 shell 管道、glob 等特性。
 *
 * YAML 配置示例:
 *   execution:
 *     type: command
 *     command: "gzip {{dir}}/*.log"
 *     workingDir: ~/logs
 *     timeout: 60
 */

const { exec } = require('child_process');

async function execute(config, args, signal) {
  const cmd = _template(config.command, args, true);
  const opts = {
    maxBuffer: 10 * 1024 * 1024,
    timeout: config.timeout || 30_000,
    cwd: config.workingDir || process.cwd(),
    shell: true,
  };

  return new Promise((resolve, reject) => {
    const child = exec(cmd, opts, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.slice(0, 500) || err.message));
      } else {
        resolve(stdout.slice(0, 5000));
      }
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill();
        reject(new Error('执行被取消'));
      });
    }
  });
}

/**
 * 模板替换：将 {{key}} 替换为 args[key]
 * 所有替换值用 shell 单引号包裹，防止命令注入
 */
function _template(template, args) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (args[key] === undefined) throw new Error(`缺少参数: ${key}`);
    return _escapeShellArg(String(args[key]));
  });
}

/**
 * Shell 单引号转义：
 * 单引号内的内容在 shell 中保持完全字面量（不展开变量、不执行命令）
 * 唯一需要处理的字符是单引号本身：结束当前引号 → 插入转义单引号 → 重新开始
 */
function _escapeShellArg(str) {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

module.exports = { type: 'command', execute };
