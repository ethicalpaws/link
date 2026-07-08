/**
 * LINK Gateway · 聊天服务
 *
 * 职责：@路由解析、上下文截断、Prompt 构建。
 * 所有 Agent 元数据从外部注入，不硬编码。
 */

const fs = require('fs');
const path = require('path');

/**
 * 读取 agent 目录下的配置文件（AGENTS.md / SOUL.md）
 * 文件不存在时返回空字符串，不报错
 */
function loadAgentFiles(agentId, agentMap) {
  const agent = agentMap?.[agentId];
  const agentDir = agent?.agentDir || path.join(__dirname, '..', '..', 'agents', agentId);
  const result = { agentsMd: '', soulMd: '' };

  for (const [file, key] of [['AGENTS.md', 'agentsMd'], ['SOUL.md', 'soulMd']]) {
    const filePath = path.join(agentDir, file);
    try {
      if (fs.existsSync(filePath)) {
        result[key] = fs.readFileSync(filePath, 'utf-8').trim();
      }
    } catch (_) {}
  }
  return result;
}

/**
 * 解析 @mention，返回命中的 Agent ID 列表
 */
function parseMentions(message, agents) {
  const regex = /@([^\s，,、]+)/g;
  const mentions = [];
  let match;
  while ((match = regex.exec(message)) !== null) {
    const name = match[1].toLowerCase();
    const hit = agents.find(a => a.id === name || a.name === match[1]);
    if (hit && !mentions.includes(hit.id)) mentions.push(hit.id);
  }
  return mentions;
}

/**
 * 决定本轮回应者列表
 * 优先级: @提及 > (activeAgents 过滤的 autoReply)
 * - 有 @mention → 只返回被提及的（再被 activeAgents 过滤）
 * - 无 @mention → 返回 autoReply 的 agent（被 activeAgents 过滤）
 * - activeAgents 非空时同时做过滤，为空时不过滤
 */
function determineResponders(message, activeAgents, agents) {
  const mentions = parseMentions(message, agents);

  // 有 @ 提及时，只路由到被提及的代理（不再叠加 autoReply）
  if (mentions.length > 0) {
    if (activeAgents && activeAgents.length > 0) {
      const activeSet = new Set(activeAgents);
      return mentions.filter(id => activeSet.has(id));
    }
    return mentions;
  }

  // 无 @ 提及时，走 autoReply 兜底
  const baseList = agents.filter(a => a.autoReply).map(a => a.id);
  if (activeAgents && activeAgents.length > 0) {
    const activeSet = new Set(activeAgents);
    return baseList.filter(id => activeSet.has(id));
  }
  return baseList;
}

/**
 * 构建对话转述文本（滑动窗口截断）
 * 超出上限的早期消息被压缩为一行摘要。
 */
function buildTranscript(msgs, agentMap, maxContext) {
  const limit = maxContext || 60;
  if (msgs.length === 0) return '';

  let header = '';
  let slice = msgs;

  if (msgs.length > limit) {
    const dropped = msgs.slice(0, msgs.length - limit);
    slice = msgs.slice(msgs.length - limit);
    const userCount = dropped.filter(m => m.role === 'user').length;
    const agentSummary = {};
    dropped.filter(m => m.role === 'assistant').forEach(m => {
      agentSummary[m.name] = (agentSummary[m.name] || 0) + 1;
    });
    const summary = Object.entries(agentSummary)
      .map(([name, c]) => `${name || '助手'} ${c}条`).join(' ');
    header = `【以下省略了 ${dropped.length} 条早期对话 — 用户 ${userCount} 条，${summary}】\n\n`;
  }

  const body = slice.map(m => {
    if (m.role === 'user') return `用户：${m.content}`;
    if (m.role === 'assistant') {
      const agent = agentMap?.[m.name];
      return agent ? `${agent.emoji || ''} ${agent.name}：${m.content}` : `助手：${m.content}`;
    }
    return '';
  }).filter(Boolean).join('\n');

  return header + body;
}

/**
 * 构建 Agent 的调用 prompt
 */
function buildAgentPrompt(agentId, message, accumulated, agentMap, isFirst, isLast) {
  const agent = agentMap?.[agentId];
  const transcript = buildTranscript(accumulated, agentMap);
  const { agentsMd, soulMd } = loadAgentFiles(agentId, agentMap);

  if (isFirst && accumulated.length === 0) {
    const parts = [];
    if (agentsMd) parts.push(`【你的角色设定】\n${agentsMd}`);
    if (soulMd) parts.push(`【你的灵魂】\n${soulMd}`);
    const header = parts.length > 0 ? parts.join('\n\n') + '\n\n' : '';
    return [{ role: 'user', content: header + message }];
  }

  const headerParts = [];
  if (agentsMd) headerParts.push(`【你的角色设定】\n${agentsMd}`);
  if (soulMd) headerParts.push(`【你的灵魂】\n${soulMd}`);
  const header = headerParts.length > 0 ? headerParts.join('\n\n') + '\n\n' : '';

  const prompt = `${header}以下是在场群聊记录：\n\n${transcript}\n\n---\n用户的最新消息：${message}\n\n现在轮到你——${agent?.emoji || ''} ${agent?.name || agentId}——回应。`;

  return [{ role: 'user', content: prompt }];
}

module.exports = {
  parseMentions, determineResponders,
  buildTranscript, buildAgentPrompt,
};
