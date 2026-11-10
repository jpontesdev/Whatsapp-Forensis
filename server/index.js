import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { scan, getLibrary, summary, ROOT, RESOURCES } from './library.js';

const PORT = +(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1'; // apenas local: são mensagens pessoais
const DIST = path.join(ROOT, 'dist');

const app = express();
app.disable('x-powered-by');

let lastScan = 0;
function ensureScanned(force = false) {
  // reescaneia no máximo a cada 3s (arquivos já lidos ficam em cache por data de modificação)
  if (force || Date.now() - lastScan > 3000) {
    scan();
    lastScan = Date.now();
  }
  return getLibrary();
}

function getChat(req, res) {
  const chat = ensureScanned().byId.get(req.params.id);
  if (!chat) res.status(404).json({ error: 'Conversa não encontrada' });
  return chat;
}

app.get('/api/chats', (req, res) => {
  const lib = ensureScanned(req.query.reload === '1');
  res.json({ resources: RESOURCES, chats: lib.chats.map(summary) });
});

// Paginação: ?before=N | ?after=N | ?around=N  (&limit=L)
app.get('/api/chats/:id/messages', (req, res) => {
  const chat = getChat(req, res);
  if (!chat) return;
  const total = chat.messages.length;
  const limit = Math.min(Math.max(+req.query.limit || 300, 1), 2000);
  let start, end;
  if (req.query.around != null) {
    const c = Math.min(Math.max(+req.query.around, 0), total - 1);
    start = Math.max(0, c - Math.floor(limit / 2));
    end = Math.min(total, start + limit);
  } else if (req.query.after != null) {
    start = Math.min(Math.max(+req.query.after, 0), total);
    end = Math.min(total, start + limit);
  } else {
    end = req.query.before != null ? Math.min(Math.max(+req.query.before, 0), total) : total;
    start = Math.max(0, end - limit);
  }
  res.json({ start, end, total, messages: chat.messages.slice(start, end) });
});

app.get('/api/chats/:id/gallery', (req, res) => {
  const chat = getChat(req, res);
  if (!chat) return;
  const pick = (i) => {
    const m = chat.messages[i];
    return { i, t: m.t, a: m.a, fromMe: m.fromMe, text: m.text, media: m.media };
  };
  res.json({
    media: chat.mediaItems.map(pick),
    docs: chat.docItems.map(pick),
    links: chat.linkItems.map((l) => ({ ...l, t: chat.messages[l.i].t, a: chat.messages[l.i].a, fromMe: chat.messages[l.i].fromMe })),
  });
});

app.get('/api/chats/:id/search', (req, res) => {
  const chat = getChat(req, res);
  if (!chat) return;
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(String(req.query.q || '').trim());
  if (!q) return res.json({ results: [] });
  const results = [];
  for (let k = chat.messages.length - 1; k >= 0 && results.length < 300; k--) {
    const m = chat.messages[k];
    const hay = m.text || m.media?.name || '';
    const pos = fold(hay).indexOf(q);
    if (pos >= 0) {
      const from = Math.max(0, pos - 40);
      results.push({ i: m.i, t: m.t, a: m.a, snippet: (from ? '…' : '') + hay.slice(from, pos + q.length + 80), pos: pos - from + (from ? 1 : 0), len: q.length });
    }
  }
  res.json({ results });
});

// Arquivos de mídia (com suporte a Range para áudio/vídeo)
app.use('/media', (req, res) => {
  const [, id, ...parts] = req.path.split('/');
  const chat = ensureScanned().byId.get(id);
  if (!chat) return res.status(404).end();
  let rel;
  try {
    rel = parts.map(decodeURIComponent).join('/');
  } catch {
    return res.status(400).end();
  }
  const full = path.resolve(chat.dir, rel);
  if (!full.startsWith(chat.dir + path.sep) || !fs.existsSync(full)) return res.status(404).end();
  if (req.query.download === '1') return res.download(full, path.basename(full));
  res.sendFile(full, { maxAge: '1d', dotfiles: 'deny' });
});

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  const lib = ensureScanned(true);
  console.log(`\n  Pasta de dados: ${RESOURCES}`);
  console.log(`  Conversas encontradas: ${lib.chats.length}`);
  console.log(`  API em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (fs.existsSync(DIST) && !process.env.VITE_DEV) console.log(`  Abra: http://localhost:${PORT}\n`);
});
