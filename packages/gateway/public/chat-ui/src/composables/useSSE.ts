/**
 * useSSE — SSE 连接管理 Composable
 *
 * 职责：SSE 重连（指数退避）、事件分发。
 * 从 App.vue 中提取，简化主组件逻辑。
 */
import { ref, shallowRef } from 'vue';
import type { Ref } from 'vue';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface SSEEvents {
  onRouting?: (agents: string[]) => void;
  onToken?: (agentId: string, agentName: string, agentEmoji: string, token: string) => void;
  onDone?: (agentId: string) => void;
  onComplete?: (hasError: boolean) => void;
  onProactive?: (data: any) => void;
  onError?: (message: string) => void;
  onConnected?: () => void;
}

export function useSSE(lastEventTime: Ref<number>, events: SSEEvents) {
  const connectionStatus = ref<ConnectionStatus>('disconnected');
  const streamingAgents = ref<Set<string>>(new Set());
  const streamBuffers = ref<Map<string, string>>(new Map());

  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;

  function getReconnectDelay(): number {
    // 指数退避: 1s, 2s, 4s, 8s, 16s, 最大 30s
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    return delay;
  }

  function handleIncomingEvent(data: any) {
    switch (data.type) {
      case 'routing':
        events.onRouting?.(data.agents);
        break;
      case 'token':
        events.onToken?.(data.agent, data.agentName, data.agentEmoji, data.token);
        break;
      case 'done':
        events.onDone?.(data.agent);
        break;
      case 'complete':
        events.onComplete?.(data.hasError);
        streamingAgents.value.clear();
        streamBuffers.value.clear();
        break;
      case 'proactive':
        events.onProactive?.(data);
        break;
      case 'error':
        events.onError?.(data.message || '发生错误');
        break;
    }
  }

  function connectSSE() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const url = `/api/events${lastEventTime.value ? `?since=${lastEventTime.value}` : ''}`;
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      connectionStatus.value = 'connected';
      reconnectAttempts = 0;
      events.onConnected?.();
    };

    eventSource.onerror = () => {
      connectionStatus.value = 'reconnecting';
      const delay = getReconnectDelay();
      reconnectAttempts++;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectSSE();
      }, delay);
    };

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handleIncomingEvent(data);
        lastEventTime.value = data.timestamp || Date.now();
      } catch (err) {
        console.error('解析 SSE 事件失败:', e.data);
      }
    };
  }

  /**
   * 处理来自 fetch 流的事件（与 SSE 事件格式相同，统一处理）
   * App.vue 中 fetch 流的 SSE 事件也走这个方法
   */
  function handleStreamEvent(data: any) {
    if (data.type === 'token') {
      streamingAgents.value.add(data.agent);
      if (!streamBuffers.value.has(data.agent)) {
        streamBuffers.value.set(data.agent, '');
      }
      const buffer = (streamBuffers.value.get(data.agent) ?? '') + data.token;
      streamBuffers.value.set(data.agent, buffer);
    }
    if (data.type === 'done') {
      streamingAgents.value.delete(data.agent);
      streamBuffers.value.delete(data.agent);
    }
    handleIncomingEvent(data);
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  return {
    connectionStatus,
    streamingAgents,
    streamBuffers,
    connectSSE,
    disconnect,
    handleStreamEvent,
  };
}
