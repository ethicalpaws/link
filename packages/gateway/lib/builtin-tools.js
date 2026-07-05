/**
 * LINK Gateway · 内置工具
 *
 * LINK 开箱即用的工具，不需要用户配 YAML 或装包。
 * 在 createServer 启动时自动注册到 ToolRegistry。
 */

const fs = require('fs');
const path = require('path');

function registerBuiltinTools(registry) {
  // 文件读取
  registry.register({
    name: 'read_file',
    description: '读取指定文件的内容',
    parameters: {
      path: { type: 'string', description: '文件路径（绝对路径）', required: true },
    },
    execute: async (args) => {
      try {
        const content = fs.readFileSync(args.path, 'utf-8');
        return content.slice(0, 5000) + (content.length > 5000 ? '\n...（文件过长，已截断）' : '');
      } catch (err) {
        return `读取失败: ${err.message}`;
      }
    },
  });

  // 文件写入
  registry.register({
    name: 'write_file',
    description: '写入内容到指定文件（会覆盖原内容）',
    parameters: {
      path: { type: 'string', description: '文件路径（绝对路径）', required: true },
      content: { type: 'string', description: '写入内容', required: true },
    },
    execute: async (args) => {
      try {
        const dir = path.dirname(args.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(args.path, args.content, 'utf-8');
        return `已写入 ${args.path}`;
      } catch (err) {
        return `写入失败: ${err.message}`;
      }
    },
  });

  // 追加写入
  registry.register({
    name: 'append_file',
    description: '追加内容到文件尾部（文件不存在则创建）',
    parameters: {
      path: { type: 'string', description: '文件路径（绝对路径）', required: true },
      content: { type: 'string', description: '追加内容', required: true },
    },
    execute: async (args) => {
      try {
        const dir = path.dirname(args.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(args.path, args.content, 'utf-8');
        return `已追加到 ${args.path}`;
      } catch (err) {
        return `追加失败: ${err.message}`;
      }
    },
  });

  // 文件列表
  registry.register({
    name: 'list_dir',
    description: '列出目录内容',
    parameters: {
      path: { type: 'string', description: '目录路径（绝对路径）', required: false },
    },
    execute: async (args) => {
      const dir = args.path || '.';
      try {
        const files = fs.readdirSync(dir);
        return `📁 ${dir} 的内容:\n${files.join('\n')}`;
      } catch (err) {
        return `读取失败: ${err.message}`;
      }
    },
  });

  // 内容搜索
  registry.register({
    name: 'search_content',
    description: '在文件中搜索包含关键词的行',
    parameters: {
      path: { type: 'string', description: '文件路径（绝对路径）', required: true },
      keyword: { type: 'string', description: '搜索关键词', required: true },
      case_sensitive: { type: 'boolean', description: '是否大小写敏感', required: false },
    },
    execute: async (args) => {
      try {
        const content = fs.readFileSync(args.path, 'utf-8');
        const lines = content.split('\n');
        const keyword = args.case_sensitive ? args.keyword : args.keyword.toLowerCase();
        const matches = lines.filter((line, idx) => {
          const target = args.case_sensitive ? line : line.toLowerCase();
          return target.includes(keyword);
        });
        if (matches.length === 0) return `未找到 "${args.keyword}"`;
        return `找到 ${matches.length} 处匹配：\n${matches.map(l => '  ' + l.trim()).join('\n')}`;
      } catch (err) {
        return `搜索失败: ${err.message}`;
      }
    },
  });

  // 获取日期时间
  registry.register({
    name: 'get_date',
    description: '获取当前日期和时间',
    parameters: {
      format: { type: 'string', description: '格式：date（仅日期）/ time（仅时间）/ datetime（日期+时间）', required: false },
    },
    execute: async (args) => {
      const now = new Date();
      const f = args.format || 'datetime';
      if (f === 'date') return now.toISOString().slice(0, 10);
      if (f === 'time') return now.toTimeString().slice(0, 8);
      return now.toISOString().slice(0, 19).replace('T', ' ');
    },
  });

  // 网页搜索
  registry.register({
    name: 'web_search',
    description: '搜索网页获取最新情报（用于搜集安全资讯、技术文章等）',
    parameters: {
      query: { type: 'string', description: '搜索关键词', required: true },
      num_results: { type: 'number', description: '返回结果数量，默认 5', required: false },
    },
    execute: async (args) => {
      try {
        const query = encodeURIComponent(args.query);
        const n = args.num_results || 5;
        // 使用 DuckDuckGo 零点击 API
        const resp = await fetch(`https://api.duckduckgo.com/?format=json&q=${query}&kj=cn-zh`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LINK-Bot/1.0)' },
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) return `搜索失败: HTTP ${resp.status}`;
        const data = await resp.json();

        // 提取 RelatedTopics（零点击结果）
        const results = (data.RelatedTopics || []).slice(0, n).filter(t => t.Text);
        if (results.length === 0) return `未找到关于 "${args.query}" 的结果`;

        return `🌐 搜索结果（${args.query}）：\n` +
          results.map((r, i) => `${i + 1}. ${r.Text}${r.FirstURL ? '\n   🔗 ' + r.FirstURL : ''}`).join('\n\n');
      } catch (err) {
        return `搜索失败: ${err.message}`;
      }
    },
  });

  // 获取网页内容
  registry.register({
    name: 'fetch_url',
    description: '获取网页/文章内容（用于抓取情报摘要）',
    parameters: {
      url: { type: 'string', description: '目标 URL', required: true },
      max_length: { type: 'number', description: '最大抓取字符数', required: false },
    },
    execute: async (args) => {
      try {
        const resp = await fetch(args.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LINK-Bot/1.0)' },
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) return `获取失败: HTTP ${resp.status}`;
        const text = await resp.text();
        const max = args.max_length || 3000;
        return text.slice(0, max) + (text.length > max ? '\n...（内容过长，已截断）' : '');
      } catch (err) {
        return `抓取失败: ${err.message}`;
      }
    },
  });
}

module.exports = { registerBuiltinTools };
