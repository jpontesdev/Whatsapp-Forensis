import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { parseChat, looksLikeChat, mediaKindFromFile } from './parser.js';
import { isChatStorage, loadChatStorage } from './ios.js';

export const ROOT = path.resolve(import.meta.dirname, '..');
const dirArg = process.argv.indexOf('--dir');
export const RESOURCES = path.resolve(dirArg > 0 ? process.argv[dirArg + 1] : process.env.WA_DIR || path.join(ROOT, 'resources'));
const CACHE = path.join(ROOT, '.cache', 'zips');
const CONFIG_FILE = path.join(ROOT, 'visualizador.config.json');

const NAME_PREFIX =
  /^(whatsapp chat with|whatsapp chat -|whatsapp chat|conversa do whatsapp com|conversa de whatsapp com|chat de whatsapp con|chat whatsapp con|chat di whatsapp con|whatsapp-chat mit|discussion whatsapp avec)\s*/i;
const AVATAR_NAMES = ['avatar', 'foto', 'perfil', 'profile', 'icon'];

const parseCache = new Map(); // txtPath -> {key, chat}
let library = { chats: [], byId: new Map() };

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function extractZip(zipPath) {
  const st = fs.statSync(zipPath);
  const rel = path.relative(RESOURCES, zipPath);
  const hash = crypto.createHash('sha1').update(rel + st.size + st.mtimeMs).digest('hex').slice(0, 10);
  const dest = path.join(CACHE, `${path.basename(zipPath, '.zip').replace(/[^\w.-]+/g, '_')}-${hash}`);
  if (!fs.existsSync(path.join(dest, '.ok'))) {
    fs.mkdirSync(dest, { recursive: true });
    const zip = new AdmZip(zipPath);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const out = path.resolve(dest, entry.entryName);
      if (!out.startsWith(dest + path.sep)) continue; // proteção contra zip-slip
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, entry.getData());
    }
    fs.writeFileSync(path.join(dest, '.ok'), '');
  }
  return dest;
}

function walk(dir, origin, out, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, origin, out, depth + 1);
    else if (/\.zip$/i.test(e.name)) {
      try {
        const dest = extractZip(full);
        walk(dest, { zip: full }, out, 0);
      } catch (err) {
        console.warn(`[zip] falha ao extrair ${full}:`, err.message);
      }
    } else if (/\.txt$/i.test(e.name)) out.push({ txt: full, origin });
    else if (/\.(sqlite|db)$/i.test(e.name) && !/^contacts/i.test(e.name)) out.push({ db: full });
  }
}

function listMedia(dir) {
  const map = new Map();
  const visit = (d, depth) => {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) visit(full, depth + 1);
      else if (!map.has(e.name.toLowerCase())) map.set(e.name.toLowerCase(), full);
    }
  };
  visit(dir, 0);
  return map;
}

function chatNameFrom(txtPath, origin) {
  let base = path.basename(txtPath, path.extname(txtPath)).replace(/\s*\(\d+\)$/, '');
  if (/^_?chat$/i.test(base) || /^whatsapp$/i.test(base)) {
    base = origin?.zip ? path.basename(origin.zip, path.extname(origin.zip)) : path.basename(path.dirname(txtPath));
  }
  return base.replace(NAME_PREFIX, '').replace(/\s*\(\d+\)$/, '').trim() || base;
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function buildChat(txtPath, origin) {
  const st = fs.statSync(txtPath);
  const key = `${st.size}-${st.mtimeMs}`;
  const cached = parseCache.get(txtPath);
  if (cached?.key === key) return cached.chat;

  const text = fs.readFileSync(txtPath, 'utf8');
  if (!looksLikeChat(text)) {
    parseCache.set(txtPath, { key, chat: null });
    return null;
  }
  const dir = path.dirname(txtPath);
  const media = listMedia(dir);
  const resolveMedia = (name) => {
    const full = media.get(name.toLowerCase());
    if (!full) return null;
    return { rel: path.relative(dir, full).split(path.sep).join('/'), size: fs.statSync(full).size };
  };

  const t0 = Date.now();
  const parsed = parseChat(text, resolveMedia);
  const name = chatNameFrom(txtPath, origin);
  const relId = path.relative(RESOURCES, origin?.zip || txtPath) + '|' + path.basename(txtPath);
  const id = crypto.createHash('sha1').update(relId).digest('hex').slice(0, 12);

  const systemText = parsed.messages.filter((m) => m.type === 'system').map((m) => m.text).join('\n');
  const isGroup =
    parsed.participants.length > 2 ||
    /created group|criou o grupo|criou este grupo|added|adicionou|creó el grupo|añadió|left$|saiu$/im.test(systemText);

  // avatar opcional: avatar.jpg, foto.png ou <nome do txt>.jpg na pasta da conversa
  let avatar = null;
  for (const [lower, full] of media) {
    const b = lower.replace(/\.(jpe?g|png|webp)$/, '');
    if (b !== lower && (AVATAR_NAMES.includes(b) || b === path.basename(txtPath, '.txt').toLowerCase())) {
      avatar = path.relative(dir, full).split(path.sep).join('/');
      break;
    }
  }

  const chat = {
    id,
    name,
    dir,
    txt: txtPath,
    source: path.relative(RESOURCES, origin?.zip || txtPath),
    format: parsed.format,
    isGroup,
    avatar,
    participants: parsed.participants,
    messages: parsed.messages,
  };
  addIndexes(chat);
  console.log(`[chat] ${name}: ${parsed.messages.length} mensagens (${parsed.format}) em ${Date.now() - t0}ms`);
  parseCache.set(txtPath, { key, chat });
  return chat;
}

// índices auxiliares para o painel de detalhes (mídia, docs, links)
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
function addIndexes(chat) {
  chat.mediaItems = [];
  chat.docItems = [];
  chat.linkItems = [];
  for (const m of chat.messages) {
    if (m.type === 'media' && m.media.rel) {
      const k = m.media.kind;
      if (k === 'image' || k === 'video' || k === 'gif') chat.mediaItems.push(m.i);
      else if (k === 'document' || k === 'audio' || k === 'contact') chat.docItems.push(m.i);
    }
    if (m.text && (m.type === 'text' || m.type === 'media')) {
      for (const u of m.text.match(URL_RE) || []) chat.linkItems.push({ i: m.i, url: u });
    }
  }
}

const dbCache = new Map(); // dbPath -> {key, chats}
function loadDb(file) {
  const st = fs.statSync(file);
  const key = `${st.size}-${st.mtimeMs}`;
  const cached = dbCache.get(file);
  if (cached?.key === key) return cached.chats;
  let chats = [];
  if (isChatStorage(file)) {
    chats = loadChatStorage(file, RESOURCES);
    chats.forEach(addIndexes);
  }
  dbCache.set(file, { key, chats });
  return chats;
}

export function scan() {
  const found = [];
  if (fs.existsSync(RESOURCES)) walk(RESOURCES, null, found);
  const chats = [];
  const dbChats = [];
  for (const { txt, origin, db } of found) {
    try {
      if (db) dbChats.push(...loadDb(db));
      else {
        const c = buildChat(txt, origin);
        if (c) chats.push(c);
      }
    } catch (err) {
      console.warn(`[chat] falha ao ler ${txt || db}:`, err.message);
    }
  }

  // Descobre quem é "você": config > nome presente em várias conversas > o outro lado de 1:1
  const config = readConfig();
  const myNames = new Set([].concat(config.me || config.eu || []).map(norm));
  const freq = new Map();
  for (const c of chats) for (const p of c.participants) freq.set(p, (freq.get(p) || 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const globalMe = ranked.length && ranked[0][1] >= 2 && (ranked.length === 1 || ranked[1][1] < ranked[0][1]) ? ranked[0][0] : null;

  for (const c of chats) {
    let me = c.participants.find((p) => myNames.has(norm(p))) || null;
    if (!me && globalMe && c.participants.includes(globalMe)) me = globalMe;
    if (!me && !c.isGroup && c.participants.length === 2) {
      const others = c.participants.filter((p) => norm(p) !== norm(c.name));
      if (others.length === 1) me = others[0];
    }
    if (!me && !c.isGroup && c.participants.length === 1 && norm(c.participants[0]) !== norm(c.name)) me = c.participants[0];
    c.meGuess = me;
  }

  chats.push(...dbChats);
  chats.sort((a, b) => (lastTime(b) > lastTime(a) ? 1 : -1));
  library = { chats, byId: new Map(chats.map((c) => [c.id, c])) };
  return library;
}

const lastTime = (c) => c.messages.at(-1)?.t || '';

export function getLibrary() {
  return library;
}

/** Descarta os caches (usado após envio de arquivos: novas mídias mudam a resolução de caminhos). */
export function invalidateCaches() {
  parseCache.clear();
  dbCache.clear();
}

export function summary(c) {
  const last = [...c.messages].reverse().find((m) => m.type !== 'system') || c.messages.at(-1) || null;
  return {
    id: c.id,
    name: c.name,
    source: c.source,
    format: c.format,
    isGroup: c.isGroup,
    avatar: c.avatar ? `/media/${c.id}/${c.avatar.split("/").map(encodeURIComponent).join("/")}` : null,
    participants: c.participants,
    meGuess: c.meGuess,
    meKnown: !!c.meKnown,
    unread: c.unread || 0,
    archived: !!c.archived,
    about: c.about || null,
    jid: c.jid || null,
    createdAt: c.createdAt || null,
    members: c.members || null,
    total: c.messages.length,
    counts: { media: c.mediaItems.length, docs: c.docItems.length, links: c.linkItems.length },
    first: c.messages[0]?.t || null,
    last,
  };
}

export { mediaKindFromFile };
