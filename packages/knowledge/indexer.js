/**
 * LINK Knowledge · 索引构建器
 *
 * 职责：扫描知识库目录，构建 knowledge_index.json。
 * 支持全量重建和增量更新。
 */

const path = require('path');

class KnowledgeIndexer {
  /**
   * @param {KnowledgeStorage} storage
   */
  constructor(storage) {
    this.storage = storage;
  }

  /** 全量重建索引 */
  rebuild() {
    const files = this.storage.getAllNoteFiles();
    const entries = [];

    for (const file of files) {
      const note = this.storage.readNote(file);
      if (!note) continue;
      entries.push({
        id: note.relativePath,
        path: note.relativePath,
        title: note.title,
        description: note.description,
        tags: note.tags,
        status: note.status,
        difficulty: note.difficulty,
        finishDate: note.finishDate,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        // 正文前 200 字作为搜索摘要
        summary: note.body ? note.body.replace(/[#*`\n]/g, ' ').trim().slice(0, 200) : '',
      });
    }

    const index = {
      version: 1,
      updatedAt: new Date().toISOString(),
      count: entries.length,
      entries: entries,
    };

    this.storage.saveIndex(index);
    return index;
  }

  /** 增量更新单篇笔记的索引 */
  updateEntry(filePath) {
    var index = this.storage.loadIndex() || { version: 1, entries: [] };
    var note = this.storage.readNote(filePath);
    if (!note) return index;

    var entry = {
      id: note.relativePath,
      path: note.relativePath,
      title: note.title,
      description: note.description,
      tags: note.tags,
      status: note.status,
      difficulty: note.difficulty,
      finishDate: note.finishDate,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      summary: note.body ? note.body.replace(/[#*`\n]/g, ' ').trim().slice(0, 200) : '',
    };

    // 替换或新增
    var found = false;
    for (var i = 0; i < index.entries.length; i++) {
      if (index.entries[i].path === note.relativePath) {
        index.entries[i] = entry;
        found = true; break;
      }
    }
    if (!found) index.entries.push(entry);
    index.count = index.entries.length;
    index.updatedAt = new Date().toISOString();
    this.storage.saveIndex(index);
    return index;
  }

  /** 获取索引（存在则加载，否则重建） */
  getIndex() {
    const existing = this.storage.loadIndex();
    if (existing && existing.entries && existing.entries.length > 0) return existing;
    return this.rebuild();
  }
}

module.exports = { KnowledgeIndexer };
