/**
 * useRooms — 房间管理 Composable
 *
 * 职责：房间 CRUD、消息加载、当前房间状态。
 * 从 App.vue 中提取。
 */
import { ref } from 'vue';
import type { Ref } from 'vue';
import type { Room } from '../types';

export interface RoomApi {
  deleteMessage: (roomId: string, msgId: string) => Promise<void>;
}

export function useRooms(currentRoomId: Ref<string>, api: RoomApi) {
  const rooms = ref<Room[]>([]);
  const isLoadingRoom = ref(false);

  // ============================================================
  // API
  // ============================================================
  async function apiGet(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function apiPost(url: string, body: any) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function apiDelete(url: string) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ============================================================
  // 房间 CRUD
  // ============================================================
  async function loadRooms() {
    try {
      const data = await apiGet('/api/rooms');
      rooms.value = data || [];
    } catch (e) {
      console.error('加载房间失败:', e);
    }
  }

  async function createRoom(name: string): Promise<Room | null> {
    try {
      const room = await apiPost('/api/rooms', { name });
      rooms.value.push(room);
      return room;
    } catch (e) {
      console.error('创建房间失败:', e);
      return null;
    }
  }

  async function deleteRoom(roomId: string): Promise<boolean> {
    if (rooms.value.length <= 1) return false;
    try {
      await apiDelete(`/api/rooms/${roomId}`);
      rooms.value = rooms.value.filter(r => r.id !== roomId);
      return true;
    } catch (e) {
      console.error('删除房间失败:', e);
      return false;
    }
  }

  // ============================================================
  // 消息加载
  // ============================================================
  async function loadRoom(roomId: string): Promise<any[]> {
    isLoadingRoom.value = true;
    try {
      const data = await apiGet(`/api/rooms/${roomId}`);
      return (data.history || []).map((m: any, i: number) => ({
        id: m.id || `loaded-${i}-${Date.now()}`,
        role: m.role === 'assistant' ? 'agent' : (m.role === 'user' ? 'user' : m.role),
        agentId: m.name || m.agentId,
        agentName: m.name || undefined,
        agentEmoji: undefined,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
        status: 'sent'
      }));
    } catch (e) {
      console.error('加载房间失败:', e);
      return [];
    } finally {
      isLoadingRoom.value = false;
    }
  }

  // 更新房间最后消息预览（发送消息后调用）
  function updateRoomPreview(roomId: string, role: string, name: string | null, content: string) {
    const room = rooms.value.find(r => r.id === roomId);
    if (room) {
      room.lastMessage = { role, name, content };
      room.updatedAt = new Date().toISOString();
    }
  }

  // ============================================================
  // 房间切换
  // ============================================================
  async function switchRoom(roomId: string, onSwitch?: (msgs: any[]) => void) {
    if (roomId === currentRoomId.value) return;
    currentRoomId.value = roomId;
    const msgs = await loadRoom(roomId);
    onSwitch?.(msgs);
    return msgs;
  }

  return {
    rooms,
    isLoadingRoom,
    loadRooms,
    createRoom,
    deleteRoom,
    loadRoom,
    switchRoom,
    updateRoomPreview,
  };
}
