import { ref } from 'vue';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export function useConnection() {
  const connectionStatus = ref<ConnectionStatus>('disconnected');
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastEventTime = 0;

  function connect(
    onMessage: (data: any) => void,
    onStatusChange?: (status: ConnectionStatus) => void
  ) {
    disconnect();

    const url = `/api/events${lastEventTime ? `?since=${lastEventTime}` : ''}`;
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      connectionStatus.value = 'connected';
      onStatusChange?.('connected');
    };

    eventSource.onerror = () => {
      connectionStatus.value = 'reconnecting';
      onStatusChange?.('reconnecting');
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect(onMessage, onStatusChange);
      }, 3000);
    };

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        lastEventTime = data.timestamp || Date.now();
        onMessage(data);
      } catch (err) {
        console.error('解析事件失败:', e.data);
      }
    };
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

  function setDisconnected() {
    connectionStatus.value = 'disconnected';
  }

  return {
    connectionStatus,
    connect,
    disconnect,
    setDisconnected,
  };
}
