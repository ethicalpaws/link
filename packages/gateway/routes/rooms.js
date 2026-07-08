/**
 * LINK Gateway · 房间管理路由
 */

const { Router } = require('express');
const { upsertRoomToken, deleteRoomToken } = require('../lib/room-auth');

function createRoomRoutes(roomManager, dataDir) {
  const router = Router();

  router.get('/', (req, res) => {
    try { res.json(roomManager.list()); } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/', (req, res) => {
    try {
      const { name } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: '房间名不能为空' });
      res.json(roomManager.create(name.trim()));
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/:id', (req, res) => {
    try {
      const room = roomManager.get(req.params.id, {
        offset: req.query.offset,
        limit: req.query.limit,
      });
      if (!room) return res.status(404).json({ error: '房间不存在' });
      res.json(room);
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/:id', (req, res) => {
    try {
      const ok = roomManager.delete(req.params.id);
      if (!ok) return res.status(400).json({ error: '无法删除（至少保留一个房间）' });
      if (dataDir) deleteRoomToken(dataDir, req.params.id);
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  /** 删除房间内指定消息 */
  router.delete('/:id/messages/:msgId', (req, res) => {
    try {
      const ok = roomManager.removeMessage(req.params.id, req.params.msgId);
      if (!ok) return res.status(404).json({ error: '消息不存在' });
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  // ─── 房间 Token 管理 ───

  /** 生成或获取房间访问 token */
  router.post('/:id/token', (req, res) => {
    try {
      const room = roomManager.getMeta(req.params.id);
      if (!room) return res.status(404).json({ error: '房间不存在' });
      if (!dataDir) return res.status(500).json({ error: '未配置 dataDir' });
      const token = upsertRoomToken(dataDir, req.params.id, room.name);
      res.json({ roomId: req.params.id, token });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  /** 删除房间访问 token（撤销授权） */
  router.delete('/:id/token', (req, res) => {
    try {
      if (!dataDir) return res.status(500).json({ error: '未配置 dataDir' });
      deleteRoomToken(dataDir, req.params.id);
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

module.exports = { createRoomRoutes };
