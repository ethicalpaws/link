/**
 * LINK Gateway · 房间管理路由
 */

const { Router } = require('express');

function createRoomRoutes(roomManager) {
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
      const room = roomManager.get(req.params.id);
      if (!room) return res.status(404).json({ error: '房间不存在' });
      res.json(room);
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/:id', (req, res) => {
    try {
      const ok = roomManager.delete(req.params.id);
      if (!ok) return res.status(400).json({ error: '无法删除（至少保留一个房间）' });
      res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
  });

  return router;
}

module.exports = { createRoomRoutes };
