/**
 * LINK Registry · SSH 远程执行器
 *
 * 执行类型: ssh
 * 适用: 远程服务器管理
 *
 * 安全说明：
 *   使用 spawn + args 数组替代 shell 字符串拼接，
 *   参数作为独立数组元素传递，shell 无法解释。
 *
 * YAML 配置示例:
 *   execution:
 *     type: ssh
 *     host: "{{serverIp}}"
 *     port: 22
 *     username: "root"
 *     privateKey: "~/.ssh/id_rsa"
 *     command: "nmap -sV {{target}}"
 *     timeout: 300
 *
 * 注意: SSH 执行器依赖本机 ssh 命令（openssh-client）
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function execute(config, args, signal) {
  const host = String(config.host || '');
  const port = config.port || 22;
  const username = config.username || 'root';
  const remoteCmd = _template(config.command || '', args);
  const timeout = (config.timeout || 60) * 1000;

  // 构建 ssh 参数数组（每个参数独立传递，shell 无法注入）
  const sshArgs = [
    '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=no',
    '-p', String(port),
  ];

  if (config.privateKey) {
    const keyPath = path.resolve(_template(config.privateKey, args));
    if (!fs.existsSync(keyPath)) throw new Error(`SSH 密钥文件不存在: ${keyPath}`);
    sshArgs.push('-i', keyPath);
  }

  sshArgs.push(`${username}@${host}`, '--', remoteCmd);

  return new Promise((resolve, reject) => {
    const child = spawn('ssh', sshArgs, {
      timeout: timeout,
      shell: false,
      maxBuffer: 10 * 1024 * 1024,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      reject(new Error(err.message));
    });

    child.on('close', (code) => {
      // SSH 返回非零退出码不代表没输出
      const output = stdout.slice(0, 5000);
      if (output.trim()) return resolve(output);
      if (code !== 0) {
        reject(new Error(stderr.slice(0, 1000) || `SSH 退出码: ${code}`));
      } else {
        resolve('');
      }
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill();
        reject(new Error('SSH 执行被取消'));
      });
    }
  });
}

function _template(template, args) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (args[key] === undefined) throw new Error(`缺少参数: ${key}`);
    return String(args[key]);
  });
}

module.exports = { type: 'ssh', execute };
