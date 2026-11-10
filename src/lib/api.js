async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export const api = {
  chats: (reload) => get(`/api/chats${reload ? '?reload=1' : ''}`),
  messages: (id, params) => get(`/api/chats/${id}/messages?${new URLSearchParams(params)}`),
  gallery: (id) => get(`/api/chats/${id}/gallery`),
  search: (id, q) => get(`/api/chats/${id}/search?q=${encodeURIComponent(q)}`),
};

export const mediaUrl = (chatId, rel) => (rel ? `/media/${chatId}/${rel.split('/').map(encodeURIComponent).join('/')}` : null);
export const downloadUrl = (chatId, rel) => mediaUrl(chatId, rel) + '?download=1';
