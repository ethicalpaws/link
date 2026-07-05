/**
 * LINK Knowledge · 搜索
 *
 * 职责：基于 knowledge_index.json 的关键词搜索。
 * 搜索优先级：标题 > 标签 > 描述 > 正文摘要
 */

class KnowledgeSearch {
  /**
   * @param {KnowledgeIndexer} indexer
   */
  constructor(indexer) {
    this.indexer = indexer;
    this._cache = null;
  }

  /** 搜索知识库 */
  search(query, options = {}) {
    const { limit = 20, tags, status } = options;
    if (!query && !tags) return [];

    const index = this._getIndex();
    if (!index || !index.entries) return [];

    const keywords = query ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];
    const results = [];

    for (const entry of index.entries) {
      // 按标签筛选
      if (tags && tags.length > 0) {
        const entryTags = (entry.tags || []).map(t => t.toLowerCase());
        if (!tags.some(t => entryTags.includes(t.toLowerCase()))) continue;
      }
      if (status && entry.status !== status) continue;
      if (!query) { results.push(entry); continue; }

      const title = (entry.title || '').toLowerCase();
      const desc = (entry.description || '').toLowerCase();
      const tagStr = (entry.tags || []).join(' ').toLowerCase();
      const summary = (entry.summary || '').toLowerCase();

      let score = 0;
      const matchedOn = [];

      for (const kw of keywords) {
        if (title.includes(kw)) { score += 10; matchedOn.push('title'); }
        if (tagStr.includes(kw)) { score += 5; matchedOn.push('tags'); }
        if (desc.includes(kw)) { score += 3; matchedOn.push('description'); }
        if (summary.includes(kw)) { score += 1; matchedOn.push('content'); }
      }

      if (score > 0) {
        results.push({ ...entry, score, matchedOn: [...new Set(matchedOn)] });
      }
    }

    // 按分值排序
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    return results.slice(0, limit);
  }

  /** 获取索引状态 */
  stats() {
    const index = this._getIndex();
    if (!index) return { count: 0, updatedAt: null };
    return { count: index.count, updatedAt: index.updatedAt };
  }

  _getIndex() {
    if (!this._cache) this._cache = this.indexer.getIndex();
    return this._cache;
  }

  /** 刷新索引（添加新笔记后调用） */
  refresh(filePath) {
    if (filePath) {
      this.indexer.updateEntry(filePath);
      this._cache = null;
    } else {
      this._cache = this.indexer.rebuild();
    }
  }
}

module.exports = { KnowledgeSearch };
