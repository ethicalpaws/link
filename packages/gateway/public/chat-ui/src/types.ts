// ============================================================
// 类型定义 - 集中管理所有类型
// ============================================================

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  autoReply: boolean;
}

export interface Message {
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

export interface ToolCall {
  name: string;
  input: string;
  status: 'pending' | 'done' | 'error';
  duration?: number;
}

export interface Room {
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

export interface Shortcut {
  keys: string;
  desc: string;
}
