/**
 * LINK Gateway · Agent 信息路由
 */

const { Router } = require('express');

function createAgentRoutes(agents) {
  const router = Router();
  router.get('/', (req, res) => res.json(agents));
  return router;
}

module.exports = { createAgentRoutes };
