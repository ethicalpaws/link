/**
 * LINK · 群聊前端
 *
 * 完全由后端 API 驱动——不硬编码任何 Agent 元数据。
 * 初次启动时从 /api/agents 获取 Agent 列表。
 */

// ─── Store ───

const store = {
  _state: {
    rooms: [], currentRoomId: null, roomHistory: [],
    activeAgents: [], agents: [],
    isLoading: false, connStatus: 'connecting',
  },
  _listeners: {},
  get(key) { return this._state[key]; },
  set(key, value) {
    const prev = this._state[key];
    if (prev === value) return;
    this._state[key] = value;
    this._notify(key, value, prev);
  },
  setAll(partial) {
    const changed = [];
    for (const [key, value] of Object.entries(partial)) {
      const prev = this._state[key];
      if (prev !== value) { this._state[key] = value; changed.push(key); }
    }
    // 批量通知，避免多次渲染
    for (const key of changed) {
      this._notify(key, this._state[key], undefined);
    }
  },
  subscribe(key, fn) {
    if (!this._listeners[key]) this._listeners[key] = new Set();
    this._listeners[key].add(fn);
    return () => this._listeners[key].delete(fn);
  },
  _notify(key, newVal, oldVal) {
    this._listeners[key]?.forEach(fn => fn(newVal, oldVal));
  },
};

// ─── API ───

const api = {
  async get(url) { return fetch(url).then(r => r.json()); },
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '请求失败');
    return r;
  },
  async delete(url) {
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '删除失败');
    return r.json();
  },
  rooms() { return this.get('/api/rooms'); },
  getRoom(id) { return this.get(`/api/rooms/${id}`); },
  createRoom(name) { return this.post('/api/rooms', { name }).then(r => r.json()); },
  deleteRoom(id) { return this.delete(`/api/rooms/${id}`); },
};

// ─── DOM ───

const $ = id => document.getElementById(id);
const dom = {
  roomBar: $('roomBar'), roomCount: $('roomCount'),
  agentBar: $('agentBar'), quickBar: $('quickBar'),
  chatArea: $('chatArea'), msgInput: $('msgInput'),
  sendBtn: $('sendBtn'), connStatus: $('connStatus'),
  createModal: $('createModal'), roomNameInput: $('roomNameInput'),
  modalCancel: $('modalCancel'), modalConfirm: $('modalConfirm'),
  confirmOverlay: $('confirmOverlay'), confirmMsg: $('confirmMsg'),
  confirmCancel: $('confirmCancel'), confirmDelete: $('confirmDelete'),
};

const MAX_CLIENT_HISTORY = 80;
let AGENTS = [];
let AGENT_MAP = {};

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

// ─── 渲染 ───

function renderRoomBar() {
  const rooms = store.get('rooms');
  const currentId = store.get('currentRoomId');
  const frag = document.createDocumentFragment();
  rooms.forEach(r => {
    const tab = document.createElement('div');
    tab.className = 'room-tab' + (r.id === currentId ? ' active' : '');
    tab.textContent = r.name;
    tab.dataset.roomId = r.id;
    tab.addEventListener('click', () => switchRoom(r.id));
    if (rooms.length > 1) {
      const close = document.createElement('span');
      close.className = 'close'; close.textContent = '×';
      close.addEventListener('click', e => { e.stopPropagation(); promptDeleteRoom(r.id, r.name); });
      tab.appendChild(close);
    }
    frag.appendChild(tab);
  });
  const addBtn = document.createElement('div');
  addBtn.className = 'room-tab-add'; addBtn.textContent = '+';
  addBtn.addEventListener('click', openCreateModal);
  frag.appendChild(addBtn);
  dom.roomBar.replaceChildren(frag);
  dom.roomCount.textContent = `${rooms.length} 个房间`;
}

function renderAgentBar() {
  const activeAgents = store.get('activeAgents');
  const frag = document.createDocumentFragment();
  AGENTS.forEach(a => {
    const isActive = activeAgents.includes(a.id);
    const btn = document.createElement('button');
    btn.className = 'agent-btn' + (isActive ? ' active' : '');
    btn.style.setProperty('--acolor', a.color || '#8888a0');
    btn.innerHTML = `<span class="emoji">${a.emoji || '🤖'}</span> ${a.name}`;
    btn.onclick = () => {
      const newList = isActive ? activeAgents.filter(x => x !== a.id) : [...activeAgents, a.id];
      store.set('activeAgents', newList);
    };
    frag.appendChild(btn);
  });
  dom.agentBar.replaceChildren(frag);
}

function renderQuickBar() {
  const frag = document.createDocumentFragment();
  AGENTS.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.style.setProperty('--acolor', a.color || '#8888a0');
    btn.textContent = `@${a.name}`;
    btn.onclick = () => {
      dom.msgInput.focus();
      const cursor = dom.msgInput.selectionStart || dom.msgInput.value.length;
      dom.msgInput.value = dom.msgInput.value.slice(0, cursor) + `@${a.name} ` + dom.msgInput.value.slice(cursor);
      dom.msgInput.focus();
    };
    frag.appendChild(btn);
  });
  dom.quickBar.replaceChildren(frag);
}

function renderChatArea() {
  const history = store.get('roomHistory');
  if (history.length === 0) {
    dom.chatArea.innerHTML = `<div class="empty-state"><div class="big">🔗</div><div class="text">开始新的对话</div><div class="hint">输入消息，@Agent名 指定回应者</div></div>`;
    return;
  }
  dom.chatArea.replaceChildren();
  history.forEach(e => {
    if (e.role === 'user') addMessageDOM('user', null, e.content, e.timestamp);
    else if (e.role === 'assistant') addMessageDOM('agent', e.name, e.content, e.timestamp);
  });
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}


function stripThinking(t){if(typeof t!="string"){return t}let a=t.indexOf("<think>");if(a===-1){return t}let b;while((a=t.indexOf("<think>"))!==-1&&(b=t.indexOf("</think>"))!==-1){t=t.slice(0,a)+t.slice(b+8)}t=t.trim();return t||"";}

function addMessageDOM(type, agentId, content, time) {
  content=stripThinking(content);
  const empty = dom.chatArea.querySelector('.empty-state');
  if (empty) empty.remove();
  const group = document.createElement('div');
  group.className = 'msg-group';
  const msg = document.createElement('div');
  msg.className = `msg ${type}`;
  if (type === 'agent' && agentId) {
    const a = AGENT_MAP[agentId];
    msg.style.setProperty('--acolor', a?.color || '#8888a0');
    const hdr = document.createElement('div');
    hdr.className = 'msg-header';
    hdr.innerHTML = `${a?.emoji || '🤖'} ${a?.name || agentId} <span class="time">${time || ''}</span>`;
    msg.appendChild(hdr);
    const body = document.createElement('div');
    body.id = 'msg-' + agentId;
    body.innerHTML = marked.parse(content);
    msg.appendChild(body);
  } else if (type === 'user') {
    const hdr = document.createElement('div');
    hdr.className = 'msg-header';
    hdr.innerHTML = `我 <span class="time">${time || ''}</span>`;
    msg.appendChild(hdr);
    const body = document.createElement('div');
    body.innerHTML = marked.parse(content);
    msg.appendChild(body);
  } else if (type === 'system') {
    msg.innerHTML = marked.parse(content);
  }
  group.appendChild(msg);
  dom.chatArea.appendChild(group);
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
  return msg;
}

// ─── Streaming ───

const streamBuffers = {};

// ─── Loading ───

function addLoading(agentId) {
  const empty = dom.chatArea.querySelector('.empty-state');
  if (empty) empty.remove();
  const group = document.createElement('div');
  group.className = 'msg-group';
  const msg = document.createElement('div');
  msg.className = 'msg agent loading';
  msg.id = `loading-${agentId}`;
  const a = AGENT_MAP[agentId];
  msg.style.setProperty('--acolor', a?.color || '#8888a0');
  const hdr = document.createElement('div');
  hdr.className = 'msg-header';
  hdr.textContent = `${a?.emoji || '🤖'} ${a?.name || agentId} 思考中...`;
  msg.appendChild(hdr);
  const dots = document.createElement('div');
  dots.className = 'dots';
  dots.innerHTML = '<span></span><span></span><span></span>';
  msg.appendChild(dots);
  group.appendChild(msg);
  dom.chatArea.appendChild(group);
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}

function removeLoading(agentId) {
  const el = document.getElementById(`loading-${agentId}`);
  el?.remove();
}

function addRoutingInfo(agentIds) {
  const empty = dom.chatArea.querySelector('.empty-state');
  if (empty) empty.remove();
  const names = agentIds.map(id => AGENT_MAP[id]).filter(Boolean);
  if (names.length === 0) return;
  const div = document.createElement('div');
  div.className = 'routing-info';
  div.textContent = `☉ ${names.map(a => `${a.emoji || '🤖'} ${a.name}`).join(' · ')} 将回应`;
  dom.chatArea.appendChild(div);
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}

function showChatLoading(text) {
  const el = document.createElement('div');
  el.className = 'thinking-bar';
  el.id = '__thinkingBar';
  el.innerHTML = `<span>${text}</span><span class="pulse-dots"><span></span><span></span><span></span></span>`;
  dom.chatArea.appendChild(el);
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}

function hideChatLoading() { document.getElementById('__thinkingBar')?.remove(); }

function showAppLoading(text) {
  dom.chatArea.innerHTML = `<div class="app-loading"><div class="spinner"></div><div class="text">${text}</div></div>`;
}
function hideAppLoading() { dom.chatArea.querySelector('.app-loading')?.remove(); }

// ─── 房间操作 ───

async function switchRoom(roomId) {
  const currentId = store.get('currentRoomId');
  if (roomId === currentId || store.get('isLoading')) return;
  store.set('currentRoomId', roomId);
  renderRoomBar();
  showAppLoading('加载聊天记录...');
  try {
    const room = await api.getRoom(roomId);
    if (!room) return;
    store.setAll({ roomHistory: room.history || [], activeAgents: room.activeAgents || [] });
    hideAppLoading();
    renderChatArea();
    renderAgentBar();
  } catch (err) {
    hideAppLoading();
    addMessageDOM('system', null, `⚠️ 加载失败: ${err.message}`);
  }
}

function openCreateModal() {
  dom.roomNameInput.value = '';
  dom.createModal.classList.add('open');
  setTimeout(() => dom.roomNameInput.focus(), 100);
}

async function handleCreateRoom() {
  const name = dom.roomNameInput.value.trim();
  if (!name) return;
  dom.createModal.classList.remove('open');
  try {
    const room = await api.createRoom(name);
    const rooms = [...store.get('rooms'), room];
    store.set('rooms', rooms);
    renderRoomBar();
    switchRoom(room.id);
  } catch (err) {
    addMessageDOM('system', null, `⚠️ 创建失败: ${err.message}`);
  }
}

let pendingDeleteId = null;
function promptDeleteRoom(id, name) {
  pendingDeleteId = id;
  dom.confirmMsg.textContent = `确定要删除「${name}」吗？聊天记录将永久丢失。`;
  dom.confirmOverlay.classList.add('open');
}

async function handleDeleteRoom() {
  if (!pendingDeleteId) return;
  dom.confirmOverlay.classList.remove('open');
  const id = pendingDeleteId;
  pendingDeleteId = null;
  try {
    await api.deleteRoom(id);
    const rooms = store.get('rooms').filter(r => r.id !== id);
    store.set('rooms', rooms);
    if (id === store.get('currentRoomId')) { const next = rooms[0]; if (next) switchRoom(next.id); }
    else renderRoomBar();
  } catch (err) { addMessageDOM('system', null, `⚠️ 删除失败: ${err.message}`); }
}

// ─── 发送消息 ───

async function sendMessage() {
  const message = dom.msgInput.value.trim();
  if (!message || store.get('isLoading')) return;
  store.set('isLoading', true);
  dom.msgInput.disabled = true;
  dom.sendBtn.disabled = true;
  const t = now();
  addMessageDOM('user', null, message, t);
  const history = store.get('roomHistory');
  const updatedHistory = [...history, { role: 'user', content: message, timestamp: t }];
  store.set('roomHistory', updatedHistory);
  dom.msgInput.value = '';
  showChatLoading('分配回应者...');

  try {
    const resp = await api.post('/api/chat/stream', {
      message,
      activeAgents: store.get('activeAgents'),
      history: updatedHistory.slice(Math.max(0, updatedHistory.length - MAX_CLIENT_HISTORY), -1),
      roomId: store.get('currentRoomId'),
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'routing') {
            hideChatLoading();
            addRoutingInfo(data.agents);
            data.agents.forEach(id => addLoading(id));
          } else if (data.type === 'token') {
            if (!streamBuffers[data.agent]) {
              streamBuffers[data.agent] = '';
              addMessageDOM('agent', data.agent, '', now());
            }
            streamBuffers[data.agent] += data.token;
            const agentMsg = document.getElementById('msg-' + data.agent);
            if (agentMsg) agentMsg.innerHTML = marked.parse(stripThinking(streamBuffers[data.agent]));
          } else if (data.type === 'done') {
            removeLoading(data.agent);
            const fullContent=streamBuffers[data.agent]||'';
            delete streamBuffers[data.agent];
            if(fullContent){
              const rh=[].concat(store.get('roomHistory')||[]);
              rh.push({role:'assistant',name:data.agent,content:fullContent,timestamp:now()});
              store.set('roomHistory',rh);
            }
          } else if (data.type === 'error') {
            removeLoading(data.agent);
            addMessageDOM('system', null, `⚠️ ${AGENT_MAP[data.agent]?.name || data.agent}: ${data.error}`);
          } else if (data.type === 'complete') {
            // 完成后更新 roomHistory
            try {
              const room = await api.getRoom(store.get('currentRoomId'));
              if (room) store.set('roomHistory', room.history || []);
            } catch (_) {}
          }
        } catch (e) { console.warn('SSE parse error:', e); }
      }
    }
  } catch (err) {
    hideChatLoading();
    addMessageDOM('system', null, `⚠️ 错误: ${err.message}`);
  } finally {
    store.set('isLoading', false);
    dom.msgInput.disabled = false;
    dom.sendBtn.disabled = false;
    dom.msgInput.focus();
  }
}

// ─── SSE ───

let eventSource = null;
let lastEventTime = 0;

function subscribeEvents() {
  if (eventSource) eventSource.close();
  store.set('connStatus', 'connecting');
  updateConnStatusUI();

  // 带上 lastEventTime，服务端补发断线期间的遗漏事件
  let url = '/api/events';
  if (lastEventTime > 0) url += '?since=' + lastEventTime;

  eventSource = new EventSource(url);
  eventSource.onopen = function() {
    store.set('connStatus', 'online');
    updateConnStatusUI();
    // 重连后主动拉一次遗漏事件（兜底）
    if (lastEventTime > 0) {
      fetch('/api/events/missed?since=' + lastEventTime).then(function(r){return r.json()}).then(function(data){
        if (data.events && data.events.length > 0) {
          for (let i = 0; i < data.events.length; i++) {
            const ev = data.events[i].event || data.events[i];
            handleProactiveEvent(ev);
          }
        }
      }).catch(function(){});
    }
  };
  eventSource.onmessage = function(e) {
    lastEventTime = Date.now();
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'proactive') {
        handleProactiveEvent(data);
      }
    } catch (_) {}
  };
  eventSource.onerror = function() {
    store.set('connStatus', 'offline');
    updateConnStatusUI();
    eventSource && eventSource.close();
    eventSource = null;
    setTimeout(subscribeEvents, 5000);
  };
}

function handleProactiveEvent(data) {
  if (data.roomId && data.roomId !== store.get('currentRoomId')) return;
  addMessageDOM('agent', data.agent, data.content, now());
  const tip = document.createElement('div');
  tip.className = 'routing-info';
  tip.textContent = '🐥 ' + (data.desc || '主动推送');
  dom.chatArea.appendChild(tip);
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}

function updateConnStatusUI() {
  const status = store.get('connStatus');
  const labels = { connecting: '连接中', online: '已连接', offline: '已断开' };
  dom.connStatus.innerHTML = `<span class="dot ${status}"></span> ${labels[status]}`;
}

// ─── 初始化 ───

async function init() {
  showAppLoading('连接服务器...');
  try {
    AGENTS = await api.get('/api/agents');
    AGENT_MAP = Object.fromEntries(AGENTS.map(a => [a.id, a]));
    const rooms = await api.rooms();
    store.set('rooms', rooms);
    renderRoomBar();
    renderQuickBar();
    if (rooms.length > 0) await switchRoom(rooms[0].id);
    else hideAppLoading();
  } catch (err) {
    hideAppLoading();
    dom.chatArea.innerHTML = `<div class="app-loading"><div>⚠️</div><div class="text">加载失败: ${err.message}</div></div>`;
  }
  subscribeEvents();
  dom.msgInput.focus();
}

// ─── 事件绑定 ───

dom.sendBtn.onclick = sendMessage;
dom.msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
store.subscribe('activeAgents', () => renderAgentBar());
store.subscribe('rooms', () => renderRoomBar());
store.subscribe('roomHistory', () => renderChatArea());
dom.modalCancel.onclick = () => dom.createModal.classList.remove('open');
dom.modalConfirm.onclick = handleCreateRoom;
dom.roomNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleCreateRoom();
  if (e.key === 'Escape') dom.createModal.classList.remove('open');
});
dom.createModal.addEventListener('click', e => {
  if (e.target === dom.createModal) dom.createModal.classList.remove('open');
});
dom.confirmCancel.onclick = () => { dom.confirmOverlay.classList.remove('open'); pendingDeleteId = null; };
dom.confirmDelete.onclick = handleDeleteRoom;
dom.confirmOverlay.addEventListener('click', e => {
  if (e.target === dom.confirmOverlay) { dom.confirmOverlay.classList.remove('open'); pendingDeleteId = null; }
});

init();
