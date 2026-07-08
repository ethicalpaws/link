<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue';
import { useSSE } from './composables/useSSE';
import { useRooms } from './composables/useRooms';
import { useTheme, themeOptions } from './composables/useTheme';
import { parseMarkdown, highlightCodeBlocks } from './composables/useMarkdown';

// ============================================================
// 类型定义（复用 types.ts）
// ============================================================
interface Agent {
  id: string;
  name: string;
  emoji: string;
  autoReply: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'agent' | 'system' | 'routing';
  agentId?: string;
  agentName?: string;
  agentEmoji?: string;
  content: string;
  timestamp: number;
  status?: 'sending' | 'sent' | 'error';
  tools?: ToolCall[];
  thinking?: string;
  replyTo?: Pick<Message, 'id' | 'role' | 'content' | 'agentName' | 'agentEmoji'>;
}

interface ToolCall {
  name: string;
  input: string;
  status: 'pending' | 'done' | 'error';
  duration?: number;
}

interface Room {
  id: string;
  name: string;
  messageCount?: number;
  lastMessage?: {
    role: string;
    name: string | null;
    content: string;
  };
  updatedAt?: string;
}

// ============================================================
// 状态
// ============================================================
const messages = ref<Message[]>([]);
const inputText = ref('');
const agents = ref<Agent[]>([]);
const activeAgents = ref<Set<string>>(new Set());
const isLoading = ref(false);
const sending = ref(false); // 独立 flag，防止快速双击
// currentRoomId 先声明，由 useRooms 管理
const currentRoomId = ref<string>('');
const lastEventTime = ref(0);
const chatBody = ref<HTMLElement | null>(null);
const inputTextarea = ref<HTMLTextAreaElement | null>(null);
const toastMessage = ref<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
const showAtMenu = ref(false);
const atMenuQuery = ref('');

// 侧边栏
const sidebarOpen = ref(false);
const showCreateRoom = ref(false);
const newRoomName = ref('');
const searchQuery = ref('');

// 主题（抽离到 useTheme）
const { currentTheme, autoTheme, setTheme, toggleAutoTheme, initTheme } = useTheme();

// 回复 & 撤回
const replyingTo = ref<Message | null>(null);
const showContextMenu = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });
const contextMenuMsg = ref<Message | null>(null);

// 右键菜单
function showMsgMenu(e: MouseEvent, msg: Message) {
  e.preventDefault();
  contextMenuMsg.value = msg;
  contextMenuPos.value = { x: e.clientX, y: e.clientY };
  showContextMenu.value = true;
}

function hideMsgMenu() {
  showContextMenu.value = false;
  contextMenuMsg.value = null;
}

// 悬停显示操作按钮
const hoveredMsgId = ref<string | null>(null);

// 输入历史导航
const inputHistory = ref<string[]>([]);
const historyIndex = ref(-1);

// 帮助面板
const showHelp = ref(false);

// 消息折叠：超过 50 条时折叠旧消息
const olderCollapsed = ref(true);
const COLLAPSE_LIMIT = 50;

const shortcuts = [
  { keys: 'Enter', desc: '发送消息' },
  { keys: 'Shift + Enter', desc: '换行' },
  { keys: '@ + 文字', desc: '提及代理（下拉补全）' },
  { keys: 'Alt + 1-7', desc: '快捷 @ 对应代理' },
  { keys: 'Ctrl + K', desc: '打开/关闭侧边栏' },
  { keys: 'Escape', desc: '关闭侧边栏/面板' },
  { keys: 'Ctrl + ↑ / ↓', desc: '浏览输入历史' },
  { keys: '右键消息', desc: '回复 / 撤回' },
  { keys: '/help', desc: '显示此帮助' },
  { keys: '/clear', desc: '清空当前会话' },
];

// ============================================================
// SSE 事件辅助函数（由 useSSE 回调触发）
// ============================================================
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '');
}

function handleToken(agentId: string, agentName: string, agentEmoji: string, token: string) {
  // token 已由 useSSE 剥离 thinking，这里直接追加到消息
  const buffer = (streamBuffers.value.get(agentId) ?? '') + token;
  streamBuffers.value.set(agentId, buffer);

  const existingIdx = messages.value.findIndex(
    m => m.role === 'agent' && m.agentId === agentId && m.status === 'sending'
  );

  if (existingIdx >= 0) {
    messages.value[existingIdx].content = stripThinking(buffer);
  } else {
    messages.value.push({
      id: `stream-${agentId}-${Date.now()}`,
      role: 'agent',
      agentId,
      agentName,
      agentEmoji,
      content: stripThinking(buffer),
      timestamp: Date.now(),
      status: 'sending'
    });
  }
  scrollToBottom();
}

function finishAgentStream(agentId: string) {
  const idx = messages.value.findIndex(
    m => m.role === 'agent' && m.agentId === agentId && m.status === 'sending'
  );
  if (idx >= 0) {
    messages.value[idx].status = 'sent';
  }
}

function addRoutingNode(routingAgents: string[]) {
  const names = routingAgents.map(id => {
    const a = agents.value.find(ag => ag.id === id);
    return a ? `${a.emoji} ${a.name}` : id;
  }).join('、');

  messages.value.push({
    id: `routing-${Date.now()}`,
    role: 'routing',
    content: `路由至: ${names}`,
    timestamp: Date.now()
  });
  scrollToBottom();
}

function addProactiveMessage(data: any) {
  const agent = agents.value.find(a => a.id === data.agentId);
  messages.value.push({
    id: `proactive-${Date.now()}`,
    role: 'agent',
    agentId: data.agentId,
    agentName: agent?.name || data.agentId,
    agentEmoji: agent?.emoji || '🤖',
    content: data.content || data.message,
    timestamp: Date.now(),
    status: 'sent'
  });
  scrollToBottom();
}

// ============================================================
// SSE（抽离到 composable）
// ============================================================
const { connectionStatus, streamingAgents, streamBuffers, connectSSE, disconnect: sseDisconnect, handleStreamEvent } = useSSE(lastEventTime, {
  onRouting: (agents) => addRoutingNode(agents),
  onToken: (agentId, agentName, agentEmoji, token) => handleToken(agentId, agentName, agentEmoji, token),
  onDone: (agentId) => finishAgentStream(agentId),
  onComplete: (hasError) => {
    isLoading.value = false;
    const lastUser = messages.value.findLast(m => m.role === 'user' && m.status === 'sending');
    if (lastUser) lastUser.status = 'sent';
    loadRooms();
    scrollToBottom();
    nextTick(() => inputTextarea.value?.focus());
  },
  onProactive: (data) => addProactiveMessage(data),
  onError: (message) => {
    showToast(message, 'error');
    isLoading.value = false;
  },
  onConnected: () => { /* connected */ },
});

// ============================================================
// 房间管理（抽离到 composable）
// ============================================================
const { rooms, loadRooms, loadRoom: loadRoomComposed, createRoom: createRoomComposed, deleteRoom: deleteRoomComposed, switchRoom: switchRoomComposed, updateRoomPreview } = useRooms(currentRoomId, {
  deleteMessage: async (roomId: string, msgId: string) => {
    const res = await fetch(`/api/rooms/${roomId}/messages/${msgId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
});

async function deleteMessage(roomId: string, msgId: string) {
  const res = await fetch(`/api/rooms/${roomId}/messages/${msgId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function copyMessageContent(msg: Message) {
  navigator.clipboard.writeText(msg.content).then(() => {
    showToast('已复制', 'success');
  }).catch(() => {
    showToast('复制失败', 'error');
  });
  hoveredMsgId.value = null;
}

function replyToMessage(msg: Message) {
  replyingTo.value = msg;
  hideMsgMenu();
  nextTick(() => inputTextarea.value?.focus());
}

async function recallMessage(msg: Message) {
  hideMsgMenu();
  if (msg.status === 'sending') {
    showToast('消息发送中，无法撤回', 'error');
    return;
  }
  try {
    await deleteMessage(currentRoomId.value, msg.id);
    messages.value = messages.value.filter(m => m.id !== msg.id);
    showToast('已撤回', 'success');
  } catch (e: any) {
    showToast('撤回失败: ' + e.message, 'error');
  }
}

// MutationObserver 用于代码高亮
let codeObserver: MutationObserver | null = null;

// ============================================================
// 计算属性
// ============================================================
const activeAgentList = computed(() =>
  agents.value.filter(a => activeAgents.value.has(a.id))
);

// 过滤后的房间列表
const filteredRooms = computed(() => {
  if (!searchQuery.value.trim()) return rooms.value;
  const q = searchQuery.value.toLowerCase();
  return rooms.value.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.lastMessage?.content.toLowerCase().includes(q)
  );
});

// 按日期分组的消息
const groupedMessages = computed(() => {
  const groups: { date: string; dateNum: number; messages: Message[] }[] = [];
  let currentGroup: { date: string; dateNum: number; messages: Message[] } | null = null;

  for (const msg of messages.value) {
    const msgDate = new Date(msg.timestamp);
    const dateStr = msgDate.toDateString();
    const dateNum = msgDate.setHours(0, 0, 0, 0);

    if (!currentGroup || currentGroup.date !== dateStr) {
      currentGroup = { date: dateStr, dateNum, messages: [] };
      groups.push(currentGroup);
    }
    currentGroup.messages.push(msg);
  }

  return groups;
});

// 折叠后的可见消息（只显示最新 COLLAPSE_LIMIT 条）
const visibleGroupedMessages = computed(() => {
  if (messages.value.length <= COLLAPSE_LIMIT || !olderCollapsed.value) {
    return groupedMessages.value;
  }
  // 找出第 COLLAPSE_LIMIT 条之后的消息，重新按日期分组
  const olderMsgs = messages.value.slice(COLLAPSE_LIMIT);
  const groups: { date: string; dateNum: number; messages: Message[] }[] = [];
  let currentGroup: { date: string; dateNum: number; messages: Message[] } | null = null;
  for (const msg of olderMsgs) {
    const msgDate = new Date(msg.timestamp);
    const dateStr = msgDate.toDateString();
    const dateNum = msgDate.setHours(0, 0, 0, 0);
    if (!currentGroup || currentGroup.date !== dateStr) {
      currentGroup = { date: dateStr, dateNum, messages: [] };
      groups.push(currentGroup);
    }
    currentGroup.messages.push(msg);
  }
  return groups;
});

// @菜单过滤
const filteredAgentsForAt = computed(() => {
  const q = atMenuQuery.value.toLowerCase();
  if (!q) return agents.value;
  return agents.value.filter(a => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
});

// ============================================================
// 工具函数
// ============================================================
function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatFullTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return '今天';
  if (d.toDateString() === yesterday.toDateString()) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatRoomTime(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}小时前`;
  if (hours < 48) return '昨天';
  return `${Math.floor(hours / 24)}天前`;
}

// 复制代码
function copyCode(text: string) {
  const decoded = decodeURIComponent(text);
  navigator.clipboard.writeText(decoded).then(() => {
    showToast('代码已复制', 'success');
  }).catch(() => {
    showToast('复制失败', 'error');
  });
}

function showToast(text: string, type: 'info' | 'error' | 'success' = 'info') {
  toastMessage.value = { text, type };
  setTimeout(() => { toastMessage.value = null; }, 2500);
}

function expandOlder() {
  olderCollapsed.value = false;
}

function scrollToBottom(smooth = true) {
  nextTick(() => {
    if (chatBody.value) {
      chatBody.value.scrollTo({
        top: chatBody.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  });
}

// ============================================================
// 主题切换（已迁移到 useTheme）
// ============================================================

// ============================================================
// 房间操作包装函数（模板调用）
// ============================================================
async function createRoom() {
  const name = newRoomName.value.trim();
  if (!name) return;
  const room = await createRoomComposed(name);
  if (room) {
    newRoomName.value = '';
    showCreateRoom.value = false;
    await switchRoomComposed(room.id, (msgs) => {
      messages.value = msgs;
      scrollToBottom(false);
    });
    sidebarOpen.value = false;
    showToast(`房间「${name}」已创建`, 'success');
  } else {
    showToast('创建房间失败', 'error');
  }
}

async function deleteRoom(roomId: string) {
  if (rooms.value.length <= 1) {
    showToast('至少保留一个房间', 'error');
    return;
  }
  const ok = await deleteRoomComposed(roomId);
  if (ok) {
    if (currentRoomId.value === roomId) {
      const firstRoom = rooms.value[0];
      if (firstRoom) {
        await switchRoomComposed(firstRoom.id, (msgs) => {
          messages.value = msgs;
          scrollToBottom(false);
        });
      }
    }
    showToast('房间已删除', 'success');
  }
}

async function switchRoom(roomId: string) {
  if (roomId === currentRoomId.value) {
    sidebarOpen.value = false;
    return;
  }
  await switchRoomComposed(roomId, (msgs) => {
    messages.value = msgs;
    streamBuffers.value.clear();
    streamingAgents.value.clear();
    scrollToBottom(false);
  });
  sidebarOpen.value = false;
}

async function loadRoom(roomId: string) {
  const msgs = await loadRoomComposed(roomId);
  messages.value = msgs;
  scrollToBottom(false);
}

// ============================================================
// API
// ============================================================
async function apiGet(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}


// ============================================================
// 初始化
// ============================================================
async function init() {
  try {
    // 恢复主题偏好（已迁移到 useTheme）
    initTheme();

    // 加载代理配置
    const agentData = await apiGet('/api/agents');
    agents.value = Array.isArray(agentData) ? agentData : (agentData.agents || []);
    agents.value.forEach(a => activeAgents.value.add(a.id));

    // 加载房间列表
    await loadRooms();

    // 默认选中第一个房间
    if (!currentRoomId.value && rooms.value.length > 0) {
      currentRoomId.value = rooms.value[0].id;
    }

    // 加载当前房间消息
    const loadedMsgs = await loadRoomComposed(currentRoomId.value);
    messages.value = loadedMsgs;
    scrollToBottom(false);

    // 建立 SSE 连接
    connectSSE();
  } catch (e: any) {
    console.error('初始化失败:', e);
    showToast('连接失败: ' + e.message, 'error');
  }
}


// ============================================================
// 发送消息
// ============================================================
async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || sending.value) return;
  sending.value = true;

  // 处理 slash 命令
  if (text === '/help') {
    inputText.value = '';
    showHelp.value = true;
    return;
  }
  if (text === '/clear') {
    inputText.value = '';
    messages.value = [];
    showToast('会话已清空', 'success');
    return;
  }

  // 加入输入历史（去重：去掉连续的重复）
  if (!inputHistory.value.length || inputHistory.value[inputHistory.value.length - 1] !== text) {
    inputHistory.value.push(text);
    if (inputHistory.value.length > 50) inputHistory.value.shift();
  }

  inputText.value = '';
  autoResize();

  // 保存回复引用（fetch 前清空 replyingTo）
  const replyRef = replyingTo.value;
  replyingTo.value = null;

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: Date.now(),
    status: 'sending',
    replyTo: replyRef ? {
      id: replyRef.id,
      role: replyRef.role,
      content: replyRef.content,
      agentName: replyRef.agentName,
      agentEmoji: replyRef.agentEmoji,
    } : undefined
  };
  messages.value.push(userMsg);
  scrollToBottom();

  // 更新侧边栏最后消息预览
  updateRoomPreview(currentRoomId.value, 'user', null, text);

  try {
    const activeAgentIds = Array.from(activeAgents.value);

    // 构建带回复引用的消息
    const fullText = replyRef
      ? `${replyRef.content}\n\n@${replyRef.role === 'user' ? '我' : (replyRef.agentName || '助手')}\n---\n${text}`
      : text;

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: fullText,
        roomId: currentRoomId.value,
        activeAgents: activeAgentIds
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    if (!reader) throw new Error('No response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            handleStreamEvent(data);
          } catch {}
        }
      }
    }

  } catch (e: any) {
    console.error('发送失败:', e);
    showToast('发送失败: ' + e.message, 'error');
    // 标记用户消息为失败
    const failedUser = messages.value.findLast(m => m.role === 'user' && m.status === 'sending');
    if (failedUser) failedUser.status = 'error';
    else {
      messages.value.push({
        id: `error-${Date.now()}`,
        role: 'system',
        content: `发送失败: ${e.message}`,
        timestamp: Date.now(),
        status: 'error'
      });
    }
  } finally {
    isLoading.value = false;
    sending.value = false;
  }
}

// ============================================================
// 代理选择
// ============================================================
function toggleAgent(agentId: string) {
  if (activeAgents.value.has(agentId)) {
    activeAgents.value.delete(agentId);
  } else {
    activeAgents.value.add(agentId);
  }
  activeAgents.value = new Set(activeAgents.value);
}

// ============================================================
// 输入框处理
// ============================================================
function handleInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    // 上屏后重置历史导航状态
    historyIndex.value = -1;
    sendMessage();
  }
  // Ctrl+↑ / Ctrl+↓ 浏览历史消息
  if (e.ctrlKey && e.key === 'ArrowUp') {
    e.preventDefault();
    if (inputHistory.value.length === 0) return;
    if (historyIndex.value === -1) {
      // 从最新一条开始
      historyIndex.value = inputHistory.value.length - 1;
    } else if (historyIndex.value > 0) {
      historyIndex.value--;
    }
    inputText.value = inputHistory.value[historyIndex.value];
    nextTick(() => {
      if (inputTextarea.value) {
        inputTextarea.value.selectionStart = inputTextarea.value.selectionEnd = inputText.value.length;
      }
    });
  }
  if (e.ctrlKey && e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex.value === -1) return;
    if (historyIndex.value < inputHistory.value.length - 1) {
      historyIndex.value++;
      inputText.value = inputHistory.value[historyIndex.value];
    } else {
      historyIndex.value = -1;
      inputText.value = '';
    }
    nextTick(() => {
      if (inputTextarea.value) {
        inputTextarea.value.selectionStart = inputTextarea.value.selectionEnd = inputText.value.length;
      }
    });
  }
  // Alt+数字 快捷@
  if (e.altKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const idx = parseInt(e.key) - 1;
    if (agents[idx]) {
      insertAtCursor(`@${agents[idx].name} `);
    }
  }
}

function autoResize() {
  if (inputTextarea.value) {
    inputTextarea.value.style.height = 'auto';
    inputTextarea.value.style.height = Math.min(inputTextarea.value.scrollHeight, 120) + 'px';
  }
}

function insertAtCursor(text: string) {
  if (!inputTextarea.value) return;
  const ta = inputTextarea.value;
  const start = ta.selectionStart || 0;
  const end = ta.selectionEnd || 0;
  const before = inputText.value.substring(0, start);
  const after = inputText.value.substring(end);
  inputText.value = before + text + after;
  // 设置光标位置到插入文本之后
  nextTick(() => {
    ta.selectionStart = ta.selectionEnd = start + text.length;
    ta.focus();
  });
  autoResize();
}

function insertAgentMention(agentId: string) {
  const agent = agents.value.find(a => a.id === agentId);
  if (agent) {
    insertAtCursor(`@${agent.name} `);
  }
  showAtMenu.value = false;
  atMenuQuery.value = '';
}

let atMenuBlurTimer: ReturnType<typeof setTimeout> | null = null;

function onInputChange() {
  autoResize();
  // 打字时重置历史导航状态
  historyIndex.value = -1;
  // 检测输入中是否有 @ 触发菜单
  if (!inputTextarea.value) return;
  const pos = inputTextarea.value.selectionStart || 0;
  const textBefore = inputText.value.substring(0, pos);
  const atMatch = textBefore.match(/@(\w*)$/);
  if (atMatch) {
    atMenuQuery.value = atMatch[1];
    showAtMenu.value = true;
  } else {
    showAtMenu.value = false;
    atMenuQuery.value = '';
  }
}

function onInputBlur() {
  // 延迟关闭，等待点击菜单
  atMenuBlurTimer = setTimeout(() => {
    showAtMenu.value = false;
    atMenuQuery.value = '';
  }, 200);
}

// ============================================================
// 键盘快捷键
// ============================================================
function handleGlobalKeydown(e: KeyboardEvent) {
  // Ctrl+K 或 Cmd+K 打开侧边栏
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    sidebarOpen.value = !sidebarOpen.value;
  }
  // Escape 关闭侧边栏/面板
  if (e.key === 'Escape') {
    sidebarOpen.value = false;
    showCreateRoom.value = false;
    showHelp.value = false;
  }
}

// ============================================================
// 生命周期
// ============================================================
onMounted(() => {
  init();
  window.addEventListener('keydown', handleGlobalKeydown);

  // 监听聊天区域 DOM 变化，高亮新增的代码块
  codeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) {
          highlightCodeBlocks(node);
          // 绑定复制按钮事件
          node.querySelectorAll('.code-block__copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const code = (btn as HTMLElement).dataset.code || '';
              copyCode(code);
            });
          });
        }
      });
    }
  });
  // 等 chat-body 渲染后再 observe
  nextTick(() => {
    if (chatBody.value) {
      codeObserver!.observe(chatBody.value, { childList: true, subtree: true });
      // 初始高亮
      highlightCodeBlocks(chatBody.value);
      chatBody.value.querySelectorAll('.code-block__copy').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = (btn as HTMLElement).dataset.code || '';
          copyCode(code);
        });
      });
    }
  });
});

onUnmounted(() => {
  sseDisconnect();
  if (codeObserver) codeObserver.disconnect();
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <div class="chat-layout">
    <!-- 侧边栏 -->
    <div class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar__header">
        <span class="sidebar__title">会话列表</span>
        <button class="sidebar__close" @click="sidebarOpen = false">✕</button>
      </div>

      <!-- 搜索 -->
      <div class="sidebar__search">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索会话..."
          class="sidebar__search-input"
        />
      </div>

      <!-- 新建房间 -->
      <div class="sidebar__new">
        <button v-if="!showCreateRoom" class="sidebar__new-btn" @click="showCreateRoom = true">
          + 新建会话
        </button>
        <div v-else class="sidebar__new-form">
          <input
            v-model="newRoomName"
            type="text"
            placeholder="会话名称..."
            class="sidebar__new-input"
            @keydown.enter="createRoom"
            @keydown.escape="showCreateRoom = false"
            autofocus
          />
          <div class="sidebar__new-actions">
            <button class="btn-cancel" @click="showCreateRoom = false">取消</button>
            <button class="btn-confirm" @click="createRoom">创建</button>
          </div>
        </div>
      </div>

      <!-- 房间列表 -->
      <div class="sidebar__rooms">
        <div
          v-for="room in filteredRooms"
          :key="room.id"
          class="room-item"
          :class="{ active: room.id === currentRoomId }"
          @click="switchRoom(room.id)"
        >
          <div class="room-item__main">
            <div class="room-item__name">{{ room.name }}</div>
            <div v-if="room.lastMessage" class="room-item__preview">
              <span v-if="room.lastMessage.name" class="room-item__sender">
                {{ room.lastMessage.name }}:
              </span>
              {{ room.lastMessage.content }}
            </div>
          </div>
          <div class="room-item__meta">
            <span class="room-item__time">{{ formatRoomTime(room.updatedAt) }}</span>
            <button
              v-if="rooms.length > 1"
              class="room-item__delete"
              @click.stop="deleteRoom(room.id)"
              title="删除会话"
            >
              🗑
            </button>
          </div>
        </div>

        <div v-if="filteredRooms.length === 0" class="sidebar__empty">
          <template v-if="searchQuery">未找到匹配的会话</template>
          <template v-else>暂无会话</template>
        </div>
      </div>

      <!-- 主题切换 -->
      <div class="sidebar__theme">
        <div class="sidebar__theme-label">
          主题
          <button
            class="auto-theme-btn"
            :class="{ active: autoTheme }"
            @click="toggleAutoTheme"
            :title="autoTheme ? '已开启跟随系统' : '点击开启跟随系统主题'"
          >
            {{ autoTheme ? '☑️ 自动' : '⬜ 自动' }}
          </button>
        </div>
        <div class="sidebar__theme-options" :class="{ dimmed: autoTheme }">
          <button
            v-for="theme in themeOptions"
            :key="theme.value"
            class="theme-btn"
            :class="{ active: !autoTheme && currentTheme === theme.value }"
            @click="setTheme(theme.value)"
            :title="autoTheme ? '关闭自动跟随后再选择' : theme.label"
          >
            {{ theme.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- 遮罩层 -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>

    <!-- 头部 -->
    <header class="chat-header">
      <button class="header-btn sidebar-toggle" @click="sidebarOpen = true" title="会话列表 (Ctrl+K)">
        ☰
      </button>
      <span class="chat-header__title">{{ rooms.find(r => r.id === currentRoomId)?.name || 'LINK 智能助手' }}</span>

      <div class="chat-header__agents">
        <button
          v-for="agent in agents"
          :key="agent.id"
          class="agent-chip"
          :class="{ active: activeAgents.has(agent.id) }"
          @click="toggleAgent(agent.id)"
          :title="agent.name"
        >
          <span class="agent-chip__emoji">{{ agent.emoji }}</span>
        </button>
      </div>

      <button class="header-btn" title="主题设置" @click="sidebarOpen = true">🎨</button>
    </header>

    <!-- 主题面板（从侧边栏触发） -->

    <!-- 消息区域 -->
    <main class="chat-body" ref="chatBody">
      <div class="message-list">
        <div v-if="messages.length === 0" class="empty-state">
          <div class="empty-state__icon">💬</div>
          <div class="empty-state__text">开始对话吧</div>
          <div class="empty-state__hint">按 Ctrl+K 打开会话列表</div>
        </div>
        <!-- 折叠提示 -->
        <div v-if="olderCollapsed && messages.length > COLLAPSE_LIMIT" class="collapse-hint">
          <button class="collapse-btn" @click="expandOlder">
            ↑ 展开 {{ messages.length - COLLAPSE_LIMIT }} 条历史消息
          </button>
        </div>

        <template v-for="group in visibleGroupedMessages" :key="group.date">
          <div class="date-divider">{{ formatDate(group.dateNum) }}</div>

          <div
            v-for="msg in group.messages"
            :key="msg.id"
            class="message"
            :class="[
              msg.role,
              { streaming: msg.status === 'sending' && streamingAgents.has(msg.agentId || '') }
            ]"
            @contextmenu="showMsgMenu($event, msg)"
            @mouseenter="hoveredMsgId = msg.id"
            @mouseleave="hoveredMsgId = null"
          >
            <div class="message__avatar">
              <template v-if="msg.role === 'user'">👤</template>
              <template v-else>{{ msg.agentEmoji || '🤖' }}</template>
            </div>

            <div class="message__bubble-wrap">
              <div v-if="msg.role === 'agent'" class="message__name">
                {{ msg.agentName || '助手' }}
              </div>

              <!-- 回复引用 -->
              <div v-if="msg.replyTo" class="message__reply">
                <span class="message__reply-author">{{ msg.replyTo.agentName || msg.replyTo.role === 'user' ? '我' : '助手' }}：</span>
                <span class="message__reply-text">{{ msg.replyTo.content.slice(0, 50) }}{{ msg.replyTo.content.length > 50 ? '...' : '' }}</span>
              </div>

              <div class="message__bubble" v-html="parseMarkdown(msg.content)"></div>

              <div class="message__meta">
                <span
                  v-if="msg.status === 'sending'"
                  class="message__status sending"
                >发送中...</span>
                <span
                  v-else-if="msg.status === 'error'"
                  class="message__status error"
                >! </span>
                <span
                  class="message__time"
                  :title="formatFullTime(msg.timestamp)"
                >{{ formatTime(msg.timestamp) }}</span>
              </div>

              <!-- 悬停操作按钮 -->
              <div v-if="hoveredMsgId === msg.id && msg.status !== 'sending'" class="msg-actions">
                <button class="msg-action-btn" @click.stop="replyToMessage(msg)" title="回复">🔁</button>
                <button class="msg-action-btn" @click.stop="copyMessageContent(msg)" title="复制">📋</button>
                <button
                  v-if="msg.role === 'user'"
                  class="msg-action-btn danger"
                  @click.stop="recallMessage(msg)"
                  title="撤回"
                >🗑</button>
              </div>
            </div>
          </div>
        </template>

        <!-- 正在等待响应 -->
        <div v-if="isLoading && streamingAgents.size === 0" class="loading-indicator">
          <div class="loading-dots"><span></span><span></span><span></span></div>
          <span>思考中...</span>
        </div>
      </div>
    </main>

    <!-- 输入区域 -->
    <footer class="chat-footer">
      <!-- 回复引用栏 -->
      <div v-if="replyingTo" class="reply-bar">
        <div class="reply-bar__info">
          <span class="reply-bar__label">回复</span>
          <span class="reply-bar__author">{{ replyingTo.role === 'user' ? '我' : (replyingTo.agentName || '助手') }}：</span>
          <span class="reply-bar__text">{{ replyingTo.content.slice(0, 60) }}{{ replyingTo.content.length > 60 ? '...' : '' }}</span>
        </div>
        <button class="reply-bar__close" @click="replyingTo = null" title="取消回复">✕</button>
      </div>

      <!-- 快捷@栏 -->
      <div class="quick-at">
        <div
          v-for="(agent, idx) in agents"
          :key="agent.id"
          class="quick-at__item"
        >
          <button
            class="quick-at__btn"
            :class="{ active: activeAgents.has(agent.id) }"
            @click="insertAgentMention(agent.id)"
            :title="`@${agent.name} (Alt+${idx + 1})`"
          >
            <span class="quick-at__emoji">{{ agent.emoji }}</span>
            <span class="quick-at__name">{{ agent.name }}</span>
            <kbd class="quick-at__key">⌥{{ idx + 1 }}</kbd>
          </button>
        </div>
      </div>

      <!-- @ 菜单 -->
      <div v-if="showAtMenu" class="at-menu">
        <div class="at-menu__search">
          <input
            v-model="atMenuQuery"
            type="text"
            placeholder="搜索代理..."
            class="at-menu__input"
            @keydown.escape="showAtMenu = false"
            @keydown.enter.prevent="filteredAgentsForAt[0] && insertAgentMention(filteredAgentsForAt[0].id)"
            autofocus
          />
        </div>
        <div class="at-menu__list">
          <button
            v-for="agent in filteredAgentsForAt"
            :key="agent.id"
            class="at-menu__item"
            @click="insertAgentMention(agent.id)"
          >
            <span class="at-menu__emoji">{{ agent.emoji }}</span>
            <span class="at-menu__name">{{ agent.name }}</span>
            <span class="at-menu__id">{{ agent.id }}</span>
          </button>
          <div v-if="filteredAgentsForAt.length === 0" class="at-menu__empty">
            未找到代理
          </div>
        </div>
      </div>

      <div class="input-bar">
        <div class="input-wrap">
          <div class="input-box">
            <textarea
              ref="inputTextarea"
              v-model="inputText"
              placeholder="输入 @ 触发提及，或点击上方按钮..."
              rows="1"
              @keydown="handleInputKeydown"
              @input="onInputChange"
              @blur="onInputBlur"
              :disabled="isLoading"
            ></textarea>
            <button
              class="send-btn"
              @click="sendMessage"
              :disabled="!inputText.trim() || isLoading"
            >
              ▲
            </button>
          </div>
          <div class="input-hint">Enter 发送 · @ 提及代理 · ⌥1-7 快捷@ · Ctrl+↑↓ 浏览历史</div>
        </div>
      </div>
    </footer>

    <!-- 连接状态 -->
    <div v-if="connectionStatus !== 'connected'" class="conn-status" :class="connectionStatus">
      {{ connectionStatus === 'reconnecting' ? '重连中...' : '已断开' }}
    </div>

    <!-- Toast -->
    <div v-if="toastMessage" class="toast" :class="toastMessage.type">
      {{ toastMessage.text }}
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="showContextMenu"
      class="context-menu"
      :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
      @click.stop
    >
      <button class="context-menu__item" @click="replyToMessage(contextMenuMsg!)">
        🔁 回复
      </button>
      <button
        v-if="contextMenuMsg?.role === 'user'"
        class="context-menu__item danger"
        @click="recallMessage(contextMenuMsg!)"
      >
        🗑 撤回
      </button>
    </div>
    <div v-if="showContextMenu" class="context-menu-overlay" @click="hideMsgMenu"></div>

    <!-- 帮助面板 -->
    <div v-if="showHelp" class="help-overlay" @click.self="showHelp = false">
      <div class="help-panel">
        <div class="help-panel__header">
          <span>⌨️ 快捷键 & 命令</span>
          <button class="help-panel__close" @click="showHelp = false">✕</button>
        </div>
        <div class="help-panel__list">
          <div v-for="s in shortcuts" :key="s.keys" class="help-item">
            <kbd class="help-item__key">{{ s.keys }}</kbd>
            <span class="help-item__desc">{{ s.desc }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
