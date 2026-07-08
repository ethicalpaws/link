/**
 * LINK Knowledge · 知识库
 *
 * 提供：笔记存储、全文索引、关键词搜索。
 * 被 Gateway 管理面板和 Agent 工具调用。
 */

const { KnowledgeStorage } = require('./storage');
const { KnowledgeIndexer } = require('./indexer');
const { KnowledgeSearch } = require('./search');

function createKnowledgeBase(dataDir) {
  const storage = new KnowledgeStorage(dataDir);
  storage.ensure();
  const indexer = new KnowledgeIndexer(storage);
  const search = new KnowledgeSearch(indexer);
  return { storage, indexer, search };
}

module.exports = { createKnowledgeBase, KnowledgeStorage, KnowledgeIndexer, KnowledgeSearch };
