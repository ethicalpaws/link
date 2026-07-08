/**
 * LINK Gateway · 知识库路由
 *
 * 支持多个知识库目录：
 *   - 第一个目录为内置知识库（可读可写）
 *   - 后续目录为外部知识库（只读，技术用户自己维护）
 */

const { Router } = require('express');
const { createKnowledgeBase } = require('@link/knowledge');
const path = require('path');
const fs = require('fs');

function cleanPath(p) {
  return p ? p.replace(/\\/g, '/') : p;
}

function createKnowledgeRoutes(knowledgeDirs) {
  // 统一转成数组
  const dirs = Array.isArray(knowledgeDirs) ? knowledgeDirs : [knowledgeDirs];
  const kbs = dirs.map(dir => dir ? createKnowledgeBase(dir) : null).filter(Boolean);

  const router = Router();
  if (kbs.length === 0) { router.all('*', (req, res) => res.status(404).json({ error: '知识库未配置' })); return router; }

  // 主知识库（第一个，可读写）
  const primaryKb = kbs[0];
  // 所有知识库
  const allKbs = kbs;

  function searchAll(query, opts) {
    const allResults = [];
    for (const kb of allKbs) {
      try {
        const results = kb.search.search(query, opts);
        const sourceDir = kb.storage.dataDir;
        for (const r of results) {
          r._source = sourceDir;
        }
        allResults.push(...results);
      } catch {}
    }
    // 按分数排序
    allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
    return allResults.slice(0, opts.limit || 50);
  }

  router.get('/stats', (req, res) => {
    try {
      const stats = allKbs.map(kb => ({ dir: kb.storage.dataDir, count: kb.search.stats().count }));
      res.json({ kbs: stats });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/search', (req, res) => {
    try {
      const q = req.query.q || '';
      const tags = req.query.tags ? req.query.tags.split(',') : undefined;
      const results = searchAll(q, { limit: 50, tags });
      res.json({ count: results.length, results });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/reindex', (req, res) => {
    try {
      for (const kb of allKbs) kb.search.refresh();
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // 目录浏览（所有知识库合并展示）
  router.get('/dir', (req, res) => {
    try {
      let allFiles = [], allDirs = [];

      for (const kb of allKbs) {
        const dirPath = req.query.path || '';
        const fullDir = path.join(kb.storage.dataDir, dirPath);
        if (!fs.existsSync(fullDir)) continue;
        const entries = fs.readdirSync(fullDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.name.startsWith('.') || e.name === 'knowledge_index.json') continue;
          if (e.isDirectory()) {
            if (!allDirs.find(d => d === e.name)) allDirs.push(e.name);
            continue;
          }
          if (e.name.endsWith('.md')) {
            const note = kb.storage.readNote(path.join(fullDir, e.name));
            if (note) {
              allFiles.push({ path: cleanPath(note.relativePath), title: note.title, description: note.description || '', tags: note.tags, _source: kb.storage.dataDir });
            }
          }
        }
      }

      res.json({ dir: req.query.path || '', dirs: allDirs.sort(), files: allFiles });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/dir', (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: '缺少目录名' });
      fs.mkdirSync(path.join(primaryKb.storage.dataDir, req.body.path || '', name), { recursive: true });
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/dir', (req, res) => {
    try {
      const { path: p } = req.body;
      if (!p) return res.status(400).json({ error: '缺少目录路径' });
      const fullDir = path.join(primaryKb.storage.dataDir, p);
      if (!fs.existsSync(fullDir)) return res.status(404).json({ error: '目录不存在' });
      // 删除前：收集目录下所有笔记路径用于索引清理
      const notePaths = _collectNotePaths(fullDir);
      fs.rmSync(fullDir, { recursive: true, force: true });
      // 从索引中移除这些笔记
      for (const np of notePaths) primaryKb.storage.removeFromIndex(np);
      primaryKb.search.refresh();
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  /** 递归收集目录下所有 .md 文件的 relativePath */
  function _collectNotePaths(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(..._collectNotePaths(full));
      else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        results.push(path.relative(primaryKb.storage.dataDir, full));
      }
    }
    return results;
  }

  router.get('/note', (req, res) => {
    try {
      const p = req.query.path;
      if (!p) return res.status(400).json({ error: '缺少 path' });
      // 在所有知识库中查找
      for (const kb of allKbs) {
        const note = kb.storage.readNote(path.resolve(kb.storage.dataDir, p));
        if (note) {
          note._source = kb.storage.dataDir;
          note._readonly = kb !== primaryKb;
          return res.json(note);
        }
      }
      res.status(404).json({ error: '不存在' });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // 以下路由只对主知识库生效（外部只读）
  router.post('/note', (req, res) => {
    try {
      const { path: p, title, body, tags, description } = req.body;
      if (!p || !title || !body) return res.status(400).json({ error: '缺必填字段' });
      const note = primaryKb.storage.writeNote(p, title, body, tags || [], { description });
      primaryKb.search.refresh(p);
      res.json({ success: true, note });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/note', (req, res) => {
    try {
      const { path: p, title, body, tags, description } = req.body;
      if (!p || !title) return res.status(400).json({ error: '缺必填字段' });
      const old = primaryKb.storage.readNote(path.resolve(primaryKb.storage.dataDir, p));
      if (!old) return res.status(404).json({ error: '笔记不存在' });
      primaryKb.storage.deleteNote(p);
      const note = primaryKb.storage.writeNote(p, title, body || old.body, tags || old.tags || [], { description: description || old.description });
      primaryKb.search.refresh(p);
      res.json({ success: true, note });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/note', (req, res) => {
    try {
      const { path: p } = req.body;
      if (!p) return res.status(400).json({ error: '缺 path' });
      // 先从索引移除（同步），再删文件（同步），最后通知刷新
      primaryKb.storage.removeFromIndex(p);
      const ok = primaryKb.storage.deleteNote(p);
      if (ok) primaryKb.search.refresh();
      res.json({ success: ok });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/tags', (req, res) => {
    try {
      const tagCount = {};
      for (const kb of allKbs) {
        const all = kb.storage.getAllNoteFiles();
        for (const f of all) {
          const note = kb.storage.readNote(f);
          if (note && note.tags) {
            const tarr = Array.isArray(note.tags) ? note.tags : [note.tags];
            for (const t of tarr) tagCount[t] = (tagCount[t] || 0) + 1;
          }
        }
      }
      const tags = Object.entries(tagCount).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count);
      res.json({ count: tags.length, tags });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/import', (req, res) => {
    let tmp = null;
    try {
      const content = req.body.content;
      if (!content) return res.status(400).json({ error: '缺少 content' });
      const buf = Buffer.from(content, 'base64');
      const name = req.body.name || 'imported.md';
      tmp = path.join(require('os').tmpdir(), path.basename(name));
      fs.writeFileSync(tmp, buf);
      const target = req.body.path || name;
      const note = primaryKb.storage.importNote(tmp, target);
      primaryKb.search.refresh();
      res.json({ success: true, note });
    } catch(err) { res.status(500).json({ error: err.message }); }
    finally { if (tmp) try { fs.unlinkSync(tmp); } catch(_) {} }
  });

  router.get('/export', (req, res) => {
    try {
      const p = req.query.path;
      if (!p) return res.status(400).json({ error: '缺 path' });
      for (const kb of allKbs) {
        const note = kb.storage.readNote(path.resolve(kb.storage.dataDir, p));
        if (note) {
          const md = '---\ntitle: ' + (note.title || '') + '\n' +
            (note.tags && note.tags.length ? 'tags: [' + note.tags.join(', ') + ']\n' : '') +
            '---\n\n' + (note.body || '');
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(p.replace(/\//g, '_')) + '"');
          return res.send(md);
        }
      }
      res.status(404).json({ error: '不存在' });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── 外部目录配置 API ───

  const extConfigFile = primaryKb.storage.dataDir ? path.join(path.resolve(primaryKb.storage.dataDir, '..'), 'external-knowledge.json') : null;

  router.get('/external-config', (req, res) => {
    try {
      if (!extConfigFile || !fs.existsSync(extConfigFile)) return res.json({ dirs: [] });
      const d = JSON.parse(fs.readFileSync(extConfigFile, 'utf-8'));
      res.json({ dirs: d.dirs || [] });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/external-config', (req, res) => {
    try {
      const { dirs } = req.body;
      if (!Array.isArray(dirs)) return res.status(400).json({ error: '无效配置' });
      const file = path.join(path.resolve(primaryKb.storage.dataDir, '..'), 'external-knowledge.json');
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ dirs }, null, 2), 'utf-8');
      fs.renameSync(tmp, file);
      // 提示需要重启才能生效
      res.json({ success: true, count: dirs.length, needRestart: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

module.exports = { createKnowledgeRoutes };
