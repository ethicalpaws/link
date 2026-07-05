/**
 * LINK Knowledge · 存储层
 *
 * 读写 Markdown + YAML frontmatter 笔记文件。
 * 不处理图片——用户自行管理，LINK 只负责存和搜。
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

class KnowledgeStorage {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.indexFile = path.join(dataDir, 'knowledge_index.json');
  }

  ensure() {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
  }

  getAllNoteFiles() {
    if (!fs.existsSync(this.dataDir)) return [];
    return this._walkDir(this.dataDir);
  }

  _walkDir(dir) {
    const result = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) result.push(...this._walkDir(full));
      else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) result.push(full);
    }
    return result;
  }

  readNote(filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = matter(raw);
      return {
        path: filePath,
        relativePath: path.relative(this.dataDir, filePath),
        title: parsed.data.title || path.basename(filePath, '.md'),
        description: parsed.data.description || '',
        tags: parsed.data.tags || [],
        status: parsed.data.status || '',
        difficulty: parsed.data.difficulty || '',
        finishDate: parsed.data['finish-date'] || parsed.data.finish_date || '',
        body: parsed.content.trim(),
        createdAt: parsed.data.created_at || null,
        updatedAt: parsed.data.updated_at || null,
      };
    } catch { return null; }
  }

  writeNote(relativePath, title, body, tags, options) {
    options = options || {};
    this.ensure();
    const filePath = path.join(this.dataDir, relativePath);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const fm = { title, created_at: new Date().toISOString().slice(0, 10) };
    if (tags && tags.length > 0) fm.tags = tags;
    if (options.description) fm.description = options.description;
    if (options.status) fm.status = options.status;
    if (options.difficulty) fm.difficulty = options.difficulty;

    fs.writeFileSync(filePath, matter.stringify(body, fm), 'utf-8');
    return this.readNote(filePath);
  }

  deleteNote(relativePath) {
    const filePath = path.join(this.dataDir, relativePath);
    try { fs.unlinkSync(filePath); return true; } catch { return false; }
  }

  importNote(filePath, targetPath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);
    return this.writeNote(targetPath, parsed.data.title || path.basename(filePath, '.md'), parsed.content.trim(), parsed.data.tags || [], {
      description: parsed.data.description,
    });
  }

  loadIndex() {
    try {
      if (fs.existsSync(this.indexFile)) return JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'));
    } catch {}
    return null;
  }

  saveIndex(index) {
    this.ensure();
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf-8');
  }
}

module.exports = { KnowledgeStorage };
