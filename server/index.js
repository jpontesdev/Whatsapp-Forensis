import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Worker } from 'node:worker_threads';
import { scan, getLibrary, summary, invalidateCaches, ROOT, RESOURCES } from './library.js';
import { PRESETS } from './forensic.js';

const PORT = +(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1'; // apenas local: são mensagens pessoais
const DIST = path.join(ROOT, 'dist');

fs.mkdirSync(RESOURCES, { recursive: true });

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

// ---------------- Envio de arquivos (área de arrastar e soltar) ----------------
// PUT /api/upload?path=<caminho relativo>  corpo = conteúdo bruto do arquivo
// Grava em resources/ preservando subpastas (ex.: Media/files/Image/x.jpg).
app.put('/api/upload', async (req, res) => {
  const rel = String(req.query.path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .map((p) => p.replace(/[<>:"|?*\x00-\x1f]/g, '_'))
    .join('/');
  if (!rel || rel.split('/').some((p) => p.startsWith('.'))) return res.status(400).json({ error: 'Caminho inválido' });
  let dest = path.resolve(RESOURCES, rel);
  if (!dest.startsWith(RESOURCES + path.sep)) return res.status(400).json({ error: 'Caminho inválido' });
  const size = +req.headers['content-length'] || null;

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // nunca sobrescreve: mesmo nome e mesmo tamanho = já existe; conteúdo diferente = "nome (1).ext"
  if (fs.existsSync(dest)) {
    if (size != null && fs.statSync(dest).size === size) {
      req.resume();
      return res.json({ path: rel, skipped: true });
    }
    const ext = path.extname(dest);
    const base = dest.slice(0, dest.length - ext.length);
    let n = 1;
    while (fs.existsSync(`${base} (${n})${ext}`)) n++;
    dest = `${base} (${n})${ext}`;
  }

  // grava num arquivo oculto temporário e renomeia no fim (a varredura ignora arquivos com ".")
  const tmp = path.join(path.dirname(dest), `.upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const out = fs.createWriteStream(tmp);
  const fail = (err) => {
    out.destroy();
    fs.rm(tmp, { force: true }, () => {});
    if (!res.headersSent) res.status(500).json({ error: err.message });
  };
  req.on('error', fail);
  out.on('error', fail);
  out.on('finish', () => {
    try {
      fs.renameSync(tmp, dest);
      lastScan = 0; // força nova varredura na próxima consulta
      invalidateCaches();
      res.json({ path: path.relative(RESOURCES, dest).split(path.sep).join('/'), skipped: false });
    } catch (err) {
      fail(err);
    }
  });
  req.pipe(out);
});

// ---------------- Busca forense (regex em todas as conversas) ----------------

// texto pesquisável de cada mensagem (texto, legenda, nome de arquivo, contato, enquete, prévia de link)
function searchableText(m) {
  const parts = [];
  if (m.text) parts.push(m.text);
  if (m.media?.name && m.media.kind === 'document') parts.push(m.media.name);
  if (m.contact) parts.push(m.contact.name, ...(m.contact.phones || []));
  if (m.poll) parts.push(m.poll.question, ...m.poll.options.map((o) => o.text));
  if (m.link) parts.push(m.link.title || '', m.link.summary || '');
  return parts.filter(Boolean).join('\n');
}

let corpusCache = { lib: null, corpus: null };
function getCorpus(lib) {
  if (corpusCache.lib === lib) return corpusCache.corpus;
  const corpus = [];
  lib.chats.forEach((c, ci) => {
    for (const m of c.messages) {
      const t = searchableText(m);
      if (t) corpus.push([ci, m.i, t]);
    }
  });
  corpusCache = { lib, corpus };
  return corpus;
}

const ACCENTS = { a: 'aáàâãä', e: 'eéèêë', i: 'iíìîï', o: 'oóòôõö', u: 'uúùûü', c: 'cç', n: 'nñ' };
function textToPattern(q) {
  return [...q.normalize('NFC')]
    .map((ch) => {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (ACCENTS[base]) return `[${ACCENTS[base]}${ACCENTS[base].toUpperCase()}]`;
      return ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    })
    .join('');
}

function makeSnippet(text, marks) {
  const first = marks[0][0];
  const lastEnd = marks.at(-1)[0] + marks.at(-1)[1];
  let from = Math.max(0, first - 70);
  let to = Math.min(text.length, Math.max(lastEnd, first + marks[0][1]) + 110);
  if (to - from > 320) to = from + 320;
  const prefix = from > 0 ? '…' : '';
  const snippet = prefix + text.slice(from, to).replace(/\n/g, ' ') + (to < text.length ? '…' : '');
  const shift = prefix.length - from;
  return {
    snippet,
    marks: marks.filter(([s, l]) => s >= from && s + l <= to).map(([s, l]) => [s + shift, l]),
  };
}

app.get('/api/forensic/presets', (req, res) => {
  res.json(Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, hint: p.hint, validate: !!p.validate, source: p.source })));
});

app.get('/api/forensic', (req, res) => {
  const lib = ensureScanned();
  const { preset, q = '', mode = 'text', cs = '0', validate = '1', chat } = req.query;
  let source, flags, validator = null, normalize = null;
  if (preset) {
    const p = PRESETS[preset];
    if (!p) return res.status(400).json({ error: 'Filtro desconhecido' });
    ({ source, flags } = p);
    validator = validate === '1' ? p.validate || null : null;
    normalize = p.normalize || null;
  } else {
    if (!String(q).trim()) return res.status(400).json({ error: 'Digite um termo ou expressão' });
    source = mode === 'regex' ? String(q) : textToPattern(String(q).trim());
    flags = 'g' + (cs === '1' ? '' : 'i');
    if (mode !== 'regex') normalize = 'lower';
  }
  try {
    new RegExp(source, flags);
  } catch (err) {
    return res.status(400).json({ error: 'Expressão regular inválida: ' + err.message });
  }

  let corpus = getCorpus(lib);
  if (chat) {
    const ci = lib.chats.findIndex((c) => c.id === chat);
    corpus = corpus.filter(([c]) => c === ci);
  }

  const t0 = Date.now();
  const worker = new Worker(new URL('./forensic-worker.js', import.meta.url), {
    workerData: { corpus, source, flags, validate: validator, normalize, limit: 3000 },
  });
  let done = false;
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    worker.terminate();
    res.status(408).json({ error: 'A expressão demorou demais (mais de 15 s) e foi interrompida. Tente um padrão mais específico.' });
  }, 15000);
  worker.once('error', (err) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    res.status(500).json({ error: err.message });
  });
  worker.once('message', (r) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    worker.terminate();
    const chatInfo = (ci) => {
      const c = lib.chats[ci];
      return { chatId: c.id, chatName: c.name, isGroup: c.isGroup };
    };
    const results = r.results.map(({ c, i, text, marks }) => {
      const m = lib.chats[c].messages[i];
      return { ...chatInfo(c), i, t: m.t, approx: !!m.approx, a: m.a || null, fromMe: !!m.fromMe, values: [...new Set(marks.map((x) => x[2]))], keys: [...new Set(marks.map((x) => x[3]))], ...makeSnippet(text, marks) };
    });
    // mais recentes primeiro
    results.sort((a, b) => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0));
    res.json({
      ms: Date.now() - t0,
      pattern: source,
      flags,
      totalMatches: r.totalMatches,
      totalMessages: r.totalMessages,
      chatCount: r.chatCount,
      truncated: r.totalMessages > results.length,
      results,
      uniques: r.uniques.slice(0, 2000).map((u) => ({ ...u, first: { ...chatInfo(u.first[0]), i: u.first[1] } })),
    });
  });
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
