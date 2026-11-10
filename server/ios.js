// Leitor do banco de dados do WhatsApp para iOS (ChatStorage.sqlite + Contacts.sqlite opcional).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const APPLE_EPOCH = 978307200; // 2001-01-01T00:00:00Z
const pad = (n) => String(n).padStart(2, '0');

function appleToLocalIso(sec) {
  if (sec == null) return null;
  const d = new Date((sec + APPLE_EPOCH) * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const baseJid = (jid) => (jid || '').split('@')[0].split('~')[0];
const isPhoneLike = (s) => /^\+?[\d\s‑\-().]+$/.test(s || '');

// Bancos anonimizados podem trazer datas truncadas (ZMESSAGEDATE/10000 como inteiro).
// Reconstrói cada uma dentro da sua janela de 10.000s, interpolando entre vizinhos exatos (na ordem ZSORT).
const BUCKET = 10000;
function fixTruncatedDates(rows) {
  const isTrunc = (v) => v != null && v > 0 && v < 1e7;
  const approx = rows.map((r) => isTrunc(r.ZMESSAGEDATE));
  if (!approx.some(Boolean)) return approx;
  let k = 0;
  let prevExact = -Infinity;
  while (k < rows.length) {
    if (!approx[k]) {
      if (rows[k].ZMESSAGEDATE != null) prevExact = rows[k].ZMESSAGEDATE;
      k++;
      continue;
    }
    let end = k;
    while (end + 1 < rows.length && approx[end + 1]) end++;
    let nextExact = Infinity;
    for (let j = end + 1; j < rows.length; j++)
      if (rows[j].ZMESSAGEDATE != null) {
        nextExact = rows[j].ZMESSAGEDATE;
        break;
      }
    const n = end - k + 1;
    const lo0 = rows[k].ZMESSAGEDATE * BUCKET;
    const hi0 = (rows[end].ZMESSAGEDATE + 1) * BUCKET;
    const L = Math.max(lo0, prevExact);
    const H = Math.min(hi0, nextExact);
    let last = -Infinity;
    for (let j = 0; j < n; j++) {
      const r = rows[k + j];
      const bLo = r.ZMESSAGEDATE * BUCKET;
      const bHi = bLo + BUCKET - 1;
      let est = H > L ? L + ((H - L) * (j + 1)) / (n + 1) : bLo;
      est = Math.min(Math.max(est, bLo, last), bHi);
      r.ZMESSAGEDATE = last = est;
    }
    prevExact = last;
    k = end + 1;
  }
  return approx;
}

export function isChatStorage(file) {
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    const ok = db.prepare("select 1 from sqlite_master where type='table' and name='ZWAMESSAGE'").get();
    db.close();
    return !!ok;
  } catch {
    return false;
  }
}

function hasTable(db, name) {
  return !!db.prepare("select 1 from sqlite_master where type='table' and name=?").get(name);
}
function columns(db, table) {
  return new Set(db.prepare(`pragma table_info("${table}")`).all().map((c) => c.name));
}

function indexFiles(root) {
  const map = new Map();
  const visit = (d, depth) => {
    if (depth > 10) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) visit(full, depth + 1);
      else {
        const k = e.name.toLowerCase();
        if (!map.has(k)) map.set(k, full);
        const stem = k.replace(/\.[^.]+$/, '');
        if (!map.has('stem:' + stem)) map.set('stem:' + stem, full);
      }
    }
  };
  visit(root, 0);
  return map;
}

const MEDIA_KIND = { 1: 'image', 2: 'video', 3: 'voice', 8: 'document', 11: 'gif', 15: 'sticker' };

function groupEventText(g, who, text, target) {
  const w = who || 'Alguém';
  switch (g) {
    case 1: return `${w} mudou o nome do grupo para "${text || ''}"`;
    case 2: return `${w} entrou`;
    case 3: return `${w} saiu`;
    case 4: return `${w} mudou a imagem deste grupo`;
    case 5: return `${w} apagou a imagem deste grupo`;
    case 7: return `${w} removeu ${target || 'um participante'}`;
    case 9: return `${w} adicionou ${target || 'um participante'}`;
    case 11: return `${w} criou o grupo`;
    case 12: return `${w} criou o grupo "${text || ''}"`;
    default: return text || 'Evento do grupo';
  }
}

export function loadChatStorage(dbFile, resourcesRoot) {
  const t0 = Date.now();
  const dir = path.dirname(dbFile);
  const db = new DatabaseSync(dbFile, { readOnly: true });
  const files = indexFiles(dir);
  const relOf = (full) => path.relative(dir, full).split(path.sep).join('/');

  const resolve = (p) => {
    if (!p) return null;
    const clean = p.replace(/^\/+/, '');
    for (const cand of [path.join(dir, clean), path.join(dir, 'Message', clean)]) {
      if (cand.startsWith(dir) && fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    }
    const b = path.basename(clean).toLowerCase();
    return files.get(b) || null;
  };
  const resolveStem = (p) => {
    if (!p) return null;
    return resolve(p) || files.get('stem:' + path.basename(p).toLowerCase().replace(/\.[^.]+$/, '')) || null;
  };

  // ---- contatos (opcional) ----
  const statusByBase = new Map();
  const contactsFile = fs.readdirSync(dir).find((f) => /^contacts.*\.sqlite$/i.test(f));
  if (contactsFile) {
    try {
      const cdb = new DatabaseSync(path.join(dir, contactsFile), { readOnly: true });
      if (hasTable(cdb, 'ZWASTATUS')) {
        for (const r of cdb.prepare('select ZWHATSAPPID, ZTEXT from ZWASTATUS where ZTEXT is not null').all())
          statusByBase.set(baseJid(r.ZWHATSAPPID), r.ZTEXT);
      }
      cdb.close();
    } catch (err) {
      console.warn('[ios] Contacts.sqlite ignorado:', err.message);
    }
  }

  // ---- nomes ----
  const pushByBase = new Map();
  if (hasTable(db, 'ZWAPROFILEPUSHNAME'))
    for (const r of db.prepare('select ZJID, ZPUSHNAME from ZWAPROFILEPUSHNAME').all()) if (r.ZPUSHNAME) pushByBase.set(baseJid(r.ZJID), r.ZPUSHNAME);

  const pictureByBase = new Map();
  if (hasTable(db, 'ZWAPROFILEPICTUREITEM'))
    for (const r of db.prepare('select ZJID, ZPATH from ZWAPROFILEPICTUREITEM where ZPATH is not null').all()) {
      const f = resolveStem(r.ZPATH) || resolveStem(r.ZPATH + '.jpg') || resolveStem(r.ZPATH + '.thumb');
      if (f) pictureByBase.set(baseJid(r.ZJID), relOf(f));
    }

  const members = new Map(); // Z_PK -> {name, push, jid, admin, active, session}
  const membersBySession = new Map();
  for (const r of db.prepare('select Z_PK, ZCHATSESSION, ZCONTACTNAME, ZFIRSTNAME, ZMEMBERJID, ZISADMIN, ZISACTIVE from ZWAGROUPMEMBER').all()) {
    const push = pushByBase.get(baseJid(r.ZMEMBERJID)) || null;
    const name = r.ZCONTACTNAME || r.ZFIRSTNAME || (push ? `~ ${push}` : '+' + baseJid(r.ZMEMBERJID));
    const m = { name, push: isPhoneLike(name) ? push : null, jid: r.ZMEMBERJID, admin: !!r.ZISADMIN, active: !!r.ZISACTIVE };
    members.set(r.Z_PK, m);
    if (!membersBySession.has(r.ZCHATSESSION)) membersBySession.set(r.ZCHATSESSION, []);
    membersBySession.get(r.ZCHATSESSION).push(m);
  }
  const findMemberByJid = (session, jid) => {
    const b = baseJid(jid);
    return (membersBySession.get(session) || []).find((m) => baseJid(m.jid) === b);
  };

  // ---- grupos ----
  const groupInfo = new Map();
  if (hasTable(db, 'ZWAGROUPINFO'))
    for (const g of db.prepare('select ZCHATSESSION, ZCREATIONDATE, ZCREATORJID, ZPICTUREPATH from ZWAGROUPINFO').all()) groupInfo.set(g.ZCHATSESSION, g);

  // ---- prévias de link ----
  const linkData = new Map();
  if (hasTable(db, 'ZWAMESSAGEDATAITEM'))
    for (const r of db.prepare('select ZMESSAGE, ZTITLE, ZSUMMARY, ZCONTENT1, ZTHUMBNAILPATH from ZWAMESSAGEDATAITEM').all()) linkData.set(r.ZMESSAGE, r);

  const sessCols = columns(db, 'ZWACHATSESSION');
  const sessions = db
    .prepare(
      `select Z_PK, ZSESSIONTYPE, ZCONTACTJID, ZPARTNERNAME, ZUNREADCOUNT, ZARCHIVED,
              ${sessCols.has('ZHIDDEN') ? 'ZHIDDEN' : '0 as ZHIDDEN'}, ${sessCols.has('ZREMOVED') ? 'ZREMOVED' : '0 as ZREMOVED'}
       from ZWACHATSESSION`,
    )
    .all();

  const msgCols = columns(db, 'ZWAMESSAGE');
  const opt = (c, alias = c) => (msgCols.has(c) ? `m.${c} as ${alias}` : `null as ${alias}`);
  const stmt = db.prepare(`
    select m.Z_PK, m.ZISFROMME, m.ZMESSAGETYPE, m.ZGROUPEVENTTYPE, m.ZMESSAGESTATUS, m.ZTEXT, m.ZMESSAGEDATE,
           m.ZGROUPMEMBER, m.ZFROMJID, m.ZPUSHNAME, ${opt('ZSTARRED')}, ${opt('ZFLAGS')},
           mi.ZMEDIALOCALPATH, mi.ZTHUMBNAILLOCALPATH, mi.ZFILESIZE, mi.ZMOVIEDURATION, mi.ZTITLE as MTITLE,
           mi.ZLATITUDE, mi.ZLONGITUDE, mi.ZVCARDNAME, mi.ZVCARDSTRING, mi.ZMEDIAURL, mi.ZAUTHORNAME
    from ZWAMESSAGE m left join ZWAMEDIAITEM mi on mi.Z_PK = m.ZMEDIAITEM
    where m.ZCHATSESSION = ?
    order by ${msgCols.has('ZSORT') ? 'm.ZSORT,' : 'm.ZMESSAGEDATE,'} m.Z_PK`);

  const dbId = crypto.createHash('sha1').update(path.relative(resourcesRoot, dbFile)).digest('hex').slice(0, 6);
  const chats = [];

  for (const s of sessions) {
    if (s.ZREMOVED) continue;
    const rows = stmt.all(s.Z_PK);
    if (!rows.length) continue;
    const approx = fixTruncatedDates(rows);
    const isGroup = s.ZSESSIONTYPE === 1 || /@g\.us$/.test(s.ZCONTACTJID || '');
    const partner = s.ZPARTNERNAME || pushByBase.get(baseJid(s.ZCONTACTJID)) || '+' + baseJid(s.ZCONTACTJID);
    const messages = [];
    const authors = new Map();

    for (const [k, r] of rows.entries()) {
      const fromMe = !!r.ZISFROMME;
      const msg = { t: appleToLocalIso(r.ZMESSAGEDATE) };
      if (approx[k]) msg.approx = true;
      if (fromMe) msg.fromMe = true;
      else if (isGroup) {
        const mem = members.get(r.ZGROUPMEMBER);
        msg.a = mem?.name || r.ZPUSHNAME || pushByBase.get(baseJid(r.ZFROMJID)) || 'Desconhecido';
        if (mem?.push) msg.push = mem.push;
      } else msg.a = partner;

      const type = r.ZMESSAGETYPE;
      if (type === 6 || type === 10) {
        msg.type = 'system';
        delete msg.fromMe;
        const who = r.ZGROUPMEMBER ? members.get(r.ZGROUPMEMBER)?.name : fromMe ? 'Você' : null;
        delete msg.a;
        delete msg.push;
        if (type === 6) {
          const target = /@/.test(r.ZTEXT || '') ? findMemberByJid(s.Z_PK, r.ZTEXT)?.name || '+' + baseJid(r.ZTEXT) : null;
          msg.text = groupEventText(r.ZGROUPEVENTTYPE, who, r.ZTEXT, target);
        } else if (r.ZGROUPEVENTTYPE === 1) {
          msg.text = 'As mensagens enviadas para esta conversa e as ligações agora estão protegidas com a criptografia de ponta a ponta.';
          msg.lock = true;
        } else if (r.ZGROUPEVENTTYPE === 2) {
          msg.text = isGroup && who ? `O código de segurança de ${who} mudou.` : `O código de segurança de ${partner} mudou.`;
          msg.lock = true;
        } else msg.text = r.ZTEXT || 'Mensagem do sistema';
      } else if (type === 0) {
        msg.type = 'text';
        msg.text = r.ZTEXT || '';
      } else if (type === 7) {
        msg.type = 'text';
        msg.text = r.ZTEXT || r.ZMEDIAURL || '';
        const ld = linkData.get(r.Z_PK);
        const thumb = resolve(ld?.ZTHUMBNAILPATH);
        msg.link = {
          url: r.ZMEDIAURL || ld?.ZCONTENT1 || r.ZTEXT,
          title: r.MTITLE || ld?.ZTITLE || null,
          summary: ld?.ZSUMMARY || null,
          thumb: thumb ? relOf(thumb) : null,
        };
      } else if (type === 5) {
        msg.type = 'location';
        msg.coords = [r.ZLATITUDE, r.ZLONGITUDE];
        msg.url = `https://maps.google.com/?q=${r.ZLATITUDE},${r.ZLONGITUDE}`;
        if (r.MTITLE) msg.text = r.MTITLE;
      } else if (type === 4) {
        msg.type = 'contact';
        const tels = [...(r.ZVCARDSTRING || '').matchAll(/^TEL[^:\n]*:(.+)$/gim)].map((x) => x[1].trim());
        msg.contact = { name: r.ZVCARDNAME || 'Contato', phones: tels, vcard: r.ZVCARDSTRING || null };
      } else if (type === 14) {
        msg.type = 'deleted';
        msg.mine = fromMe;
      } else if (MEDIA_KIND[type] || r.ZMEDIALOCALPATH) {
        const full = resolve(r.ZMEDIALOCALPATH);
        const thumb = resolve(r.ZTHUMBNAILLOCALPATH);
        const name = type === 8 && r.MTITLE ? r.MTITLE : path.basename(r.ZMEDIALOCALPATH || r.ZMEDIAURL || 'arquivo');
        msg.type = 'media';
        msg.media = {
          name,
          kind: MEDIA_KIND[type] || 'document',
          ext: (path.extname(r.ZMEDIALOCALPATH || name).slice(1) || '').toLowerCase(),
          rel: full ? relOf(full) : null,
          thumb: thumb && thumb !== full ? relOf(thumb) : null,
          size: full ? fs.statSync(full).size : r.ZFILESIZE || null,
          duration: r.ZMOVIEDURATION || null,
        };
        if (r.MTITLE && type !== 8) msg.text = r.MTITLE;
      } else {
        msg.type = 'text';
        msg.text = r.ZTEXT || `[mensagem não suportada: tipo ${type}]`;
      }

      if (msg.fromMe && msg.type !== 'system') {
        const st = r.ZMESSAGESTATUS;
        msg.status = st === 1 ? 'pending' : st === 2 || st === 0 ? 'sent' : st === 3 || st === 4 || st === 6 ? 'delivered' : st === 5 || st === 8 ? 'read' : null;
        if (st === 5 && type === 3) msg.status = 'played';
      }
      if (r.ZSTARRED) msg.starred = true;
      if (msg.a) authors.set(msg.a, (authors.get(msg.a) || 0) + 1);
      msg.i = messages.length;
      messages.push(msg);
    }

    const memberList = isGroup ? (membersBySession.get(s.Z_PK) || []).filter((m) => m.active) : [];
    const gi = groupInfo.get(s.Z_PK);
    let avatar = pictureByBase.get(baseJid(s.ZCONTACTJID)) || null;
    if (!avatar && gi?.ZPICTUREPATH) {
      const f = resolveStem(gi.ZPICTUREPATH);
      if (f) avatar = relOf(f);
    }

    chats.push({
      id: `${dbId}-${s.Z_PK}`,
      name: partner,
      dir,
      source: path.relative(resourcesRoot, dbFile),
      format: 'ios-db',
      isGroup,
      avatar,
      jid: s.ZCONTACTJID,
      about: isGroup ? null : statusByBase.get(baseJid(s.ZCONTACTJID)) || null,
      unread: s.ZUNREADCOUNT || 0,
      archived: !!s.ZARCHIVED,
      createdAt: gi ? appleToLocalIso(gi.ZCREATIONDATE) : null,
      members: memberList.map((m) => ({ name: m.name, push: m.push, admin: m.admin })),
      participants: isGroup ? memberList.map((m) => m.name) : [partner],
      meKnown: true,
      meGuess: null,
      messages,
    });
  }
  db.close();
  console.log(`[ios] ${path.basename(dbFile)}: ${chats.length} conversas, ${chats.reduce((n, c) => n + c.messages.length, 0)} mensagens em ${Date.now() - t0}ms`);
  return chats;
}
