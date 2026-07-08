/**
 * LINK Gateway · 分层分类日志
 *
 * 支持按分类写不同文件，按级别过滤，JSONL 格式
 * 文件按日期命名，每天一个新文件，不做大小轮转
 */

const fs = require('fs');
const path = require('path');

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CATEGORIES = {
  access:    'access.log',
  audit:     'audit.log',
  scheduler: 'scheduler.log',
  system:    'system.log',
  llm:       'llm.log',
};

const DEFAULT_LEVEL = 'info';

let _config = null;   // { logDir, levels: { cat: level }, console: bool }
let _warned = false;

function init({ logDir, levels = {}, console: consoleOut = false }) {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  _config = { logDir, levels, console: consoleOut };
}

function _levelOf(cat) {
  const lvl = (_config?.levels?.[cat] || DEFAULT_LEVEL).toLowerCase();
  return LOG_LEVELS[lvl] ?? LOG_LEVELS[DEFAULT_LEVEL];
}

function _shouldLog(cat, level) {
  if (!_config) { if (!_warned) { console.warn('[logger] not initialized, buffered'); _warned = true; } return false; }
  return LOG_LEVELS[level] >= _levelOf(cat);
}

function _filePath(cat) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const base = CATEGORIES[cat] || cat + '.log';
  // 替换 .log -> -YYYY-MM-DD.log
  const name = base.replace(/\.log$/, '-' + today + '.log');
  return path.join(_config.logDir, name);
}

function _write(cat, level, msg, meta) {
  const entry = {
    time: new Date().toISOString(),
    level,
    category: cat,
    msg,
    ...(meta || {}),
  };
  const line = JSON.stringify(entry);

  if (_config?.console) {
    const prefix = `\x1b[${level === 'error' ? '31' : level === 'warn' ? '33' : '36'}[${cat}]\x1b[0m`;
    console.log(`${prefix} ${line}`);
  }

  try {
    const filePath = _filePath(cat);
    fs.appendFileSync(filePath, line + '\n', 'utf-8');
  } catch (err) {
    console.error('[logger] write failed:', err.message);
  }
}

function log(cat, level, msg, meta) {
  if (_shouldLog(cat, level)) _write(cat, level, msg, meta);
}

const logger = {
  debug: (cat, msg, meta) => log(cat, 'debug', msg, meta),
  info:  (cat, msg, meta) => log(cat, 'info',  msg, meta),
  warn:  (cat, msg, meta) => log(cat, 'warn',  msg, meta),
  error: (cat, msg, meta) => log(cat, 'error', msg, meta),
};

module.exports = { logger, init };
