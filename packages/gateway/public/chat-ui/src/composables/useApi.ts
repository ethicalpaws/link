export function useApi() {
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

  async function deleteMessage(roomId: string, msgId: string) {
    return apiDelete(`/api/rooms/${roomId}/messages/${msgId}`);
  }

  return {
    apiGet,
    apiPost,
    apiDelete,
    deleteMessage,
  };
}
