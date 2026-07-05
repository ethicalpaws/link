/**
 * LINK Gateway · 聊天路由
 */

const { Router } = require('express');
const { determineResponders, buildAgentPrompt } = require('../lib/chat-service');
const { buildContext } = require('@link/memory');
const { callWithTools } = require('../lib/tool-runner');

function createChatRoute({ roomManager, agents, agentMap, llmCall, memoryStorage, toolRegistry, audit }) {
  const router = Router();

  async function handleAgents(message, history, roomId, activeAgents, res, sendResponse) {
    if (!message?.trim()) { res.status(400).json({ error: '消息不能为空' }); return; }
    let roomMeta = null;
    if (roomId) { roomMeta = roomManager.getMeta(roomId); if (!roomMeta) { res.status(404).json({ error: '房间不存在' }); return; } }
    const agentList = determineResponders(message, activeAgents, agents);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write('data: ' + JSON.stringify({ type: 'routing', agents: agentList }) + '\n\n');

    const responses = [];
    let hasError = false;

    const promises = agentList.map(async (agentId) => {
      if (!agentMap?.[agentId]) return;
      try {
        const isLast = agentId === agentList[agentList.length - 1];

        // 每次请求时动态构建上下文（含日/周摘要、用户身份、计划等）
        const ctxSummary = memoryStorage ? buildContext(memoryStorage) : '';

        let messages = buildAgentPrompt(agentId, message, history, agentMap, false, isLast);
        if (ctxSummary && messages.length > 0 && messages[0].role === 'user') messages.unshift({ role: 'system', content: ctxSummary });

        const content = await callWithTools(agentId, messages, llmCall, toolRegistry, agentMap?.[agentId], 0, audit);
        const displayContent = (content || '').trim() || '';

        sendResponse(res, agentId, displayContent, isLast);
        responses.push({ agent: agentId, content: displayContent });
      } catch (err) { hasError = true; res.write('data: ' + JSON.stringify({ type: 'error', agent: agentId, error: err.message }) + '\n\n'); }
    });

    await Promise.all(promises);

    if (roomId) {
      roomManager.appendBatch(roomId, [{ role: 'user', content: message }].concat(responses.map(function(r){ return { role: 'assistant', name: r.agent, content: r.content }; })));
      if (activeAgents.length > 0) roomManager.updateActiveAgents(roomId, activeAgents);
    }
    res.write('data: ' + JSON.stringify({ type: 'complete', hasError: hasError }) + '\n\n');
    res.end();
  }

  router.post('/', function(req, res) {
    const body = req.body;
    handleAgents(body.message, body.history || [], body.roomId, body.activeAgents || [], res, function(r, id, content, isLast) {
      r.write('data: ' + JSON.stringify({ type: 'response', agent: id, content: content }) + '\n\n');
    });
  });

  router.post('/stream', function(req, res) {
    const body = req.body;
    handleAgents(body.message, body.history || [], body.roomId, body.activeAgents || [], res, function(r, id, content, isLast) {
      r.write('data: ' + JSON.stringify({ type: 'token', agent: id, token: content }) + '\n\n');
      r.write('data: ' + JSON.stringify({ type: 'done', agent: id }) + '\n\n');
    });
  });

  return router;
}

module.exports = { createChatRoute };
