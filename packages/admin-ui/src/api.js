// 统一 API 封装
const BASE = ''

async function request(url, opts) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg
    try { msg = JSON.parse(text).error || res.statusText } catch { msg = text || res.statusText }
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (url, body) => request(url, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
}
