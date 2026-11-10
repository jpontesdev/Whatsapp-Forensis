// Parser de conversas exportadas do WhatsApp ("Exportar conversa").
// Suporta os formatos Android e iOS, em vários idiomas (pt, en, es, it, de, fr).

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const SPACES = /[   ]/g;

// [10/11/2026, 08:29:01] Nome: mensagem   (iOS)
const HEADER_IOS =
  /^\[(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})[,\s]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]\s?([\s\S]*)$/;
// 10/11/2026 08:29 - Nome: mensagem       (Android)
const HEADER_ANDROID =
  /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})[,\s]+(?:(?:às|at|a las|um|à)\s+)?(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\s*[-–]\s([\s\S]*)$/;

const ATTACH_WORDS =
  'attached|anexado|anexo|adjunto|allegato|angehängt|pièce jointe|joint|bijlage|ekli';
const IOS_ATTACH = new RegExp(`<\\s*(?:${ATTACH_WORDS})\\s*:\\s*([^<>]+?)\\s*>`, 'i');
const ANDROID_ATTACH =
  /^([^\n]+?\.[A-Za-z0-9]{1,8})(?:\s*•[^()\n]*)?\s+\(([^)\n]{3,40})\)\s*(?:\n([\s\S]*))?$/;
const ANDROID_ATTACH_PHRASES =
  /file attached|arquivo anexado|ficheiro anexado|archivo adjunto|fichier joint|datei angehängt|file allegato|bestand bijgevoegd|dosya ekli/i;

const OMITTED =
  /^<?\s*(media|mídia|midia|multimedia|multimídia|arquivo de mídia|archivo multimedia|image|imagem|imagen|video|vídeo|audio|áudio|sticker|figurinha|gif|document|documento|contact card|cartão de contato|tarjeta de contacto)\s+(omitted|oculta|oculto|omitida|omitido|ocultada|ocultado|omessi|omesso|weggelassen|omis)\s*>?$/i;
const OMITTED_SIMPLE = /^<\s*(media omitted|mídia oculta|arquivo de mídia oculto|multimedia omitido|media omessi|medien ausgeschlossen)\s*>$/i;

const DELETED =
  /^(this message was deleted|you deleted this message|mensagem apagada|esta mensagem foi apagada|essa mensagem foi apagada|você apagou esta mensagem|voce apagou esta mensagem|apagou esta mensagem|se eliminó este mensaje|eliminaste este mensaje|questo messaggio è stato eliminato|diese nachricht wurde gelöscht|ce message a été supprimé)\.?$/i;
const EDITED = /\s*<\s*(this message was edited|mensagem editada|se editó este mensaje|messaggio modificato|diese nachricht wurde bearbeitet|ce message a été modifié)\s*>\s*$/i;
const LOCATION = /^(?:location|localização|localizacao|local|ubicación|posizione|standort|position)\s*:\s*(https?:\/\/\S+)/i;
const LIVE_LOCATION = /^(live location shared|localização em tempo real compartilhada|ubicación en tiempo real compartida)/i;
const POLL = /^(?:poll|enquete|encuesta|sondaggio|umfrage|sondage)\s*:\s*\n?([\s\S]*)$/i;
const POLL_OPTION = /^(?:option|opção|opcao|opción|opzione)\s*:\s*(.*?)(?:\s*\((\d+)\s*[^)]*\))?\s*$/i;

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'bmp', 'avif']);
const VIDEO_EXT = new Set(['mp4', 'mov', '3gp', 'mkv', 'webm', 'm4v', 'avi']);
const AUDIO_EXT = new Set(['opus', 'ogg', 'oga', 'mp3', 'm4a', 'aac', 'wav', 'amr', 'flac']);

export function clean(s) {
  return s.replace(INVISIBLE, '').replace(SPACES, ' ');
}

export function mediaKindFromFile(file) {
  const base = file.split(/[\\/]/).pop();
  const ext = (base.split('.').pop() || '').toLowerCase();
  if (ext === 'webp') return /STK-|STICKER/i.test(base) || !/IMG-|PHOTO/i.test(base) ? 'sticker' : 'image';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return /GIF/i.test(base) ? 'gif' : 'video';
  if (AUDIO_EXT.has(ext)) return /^PTT-|-AUDIO-|^AUDIO-|\.opus$/i.test(base) ? 'voice' : 'audio';
  if (ext === 'vcf') return 'contact';
  return 'document';
}

function omittedKind(word) {
  const w = word.toLowerCase();
  if (/image|imagem|imagen/.test(w)) return 'image';
  if (/vídeo|video/.test(w)) return 'video';
  if (/audio|áudio/.test(w)) return 'voice';
  if (/sticker|figurinha/.test(w)) return 'sticker';
  if (/gif/.test(w)) return 'gif';
  if (/document/.test(w)) return 'document';
  if (/contact|contato|contacto/.test(w)) return 'contact';
  return 'media';
}

/** Quick check: does this text look like a WhatsApp export? */
export function looksLikeChat(text) {
  const lines = text.split(/\r?\n/).slice(0, 40);
  let hits = 0;
  for (const raw of lines) {
    const l = clean(raw).trimStart();
    if (HEADER_IOS.test(l) || HEADER_ANDROID.test(l)) hits++;
  }
  return hits >= 1;
}

/**
 * @param {string} text  conteúdo do .txt
 * @param {(name:string)=>({rel:string,size:number}|null)} resolveMedia
 */
export function parseChat(text, resolveMedia) {
  const lines = text.split(/\r?\n/);
  const raw = [];
  let format = null;
  let ampmSeen = false;

  for (const line of lines) {
    // remove apenas os marcadores invisíveis do início; o resto é preservado
    const head = line.replace(/^[‎‏﻿\s]+/, '').replace(SPACES, ' ');
    let m = HEADER_IOS.exec(head);
    let fmt = 'ios';
    if (!m) {
      m = HEADER_ANDROID.exec(head);
      fmt = 'android';
    }
    if (m) {
      format ??= fmt;
      if (m[7]) ampmSeen = true;
      raw.push({ d: [m[1], m[2], m[3]], time: [+m[4], +m[5], +(m[6] || 0), m[7] || null], rest: m[8] });
    } else if (raw.length) {
      raw[raw.length - 1].rest += '\n' + line;
    }
  }

  const order = detectDateOrder(raw.map((r) => r.d), ampmSeen);
  const messages = [];
  const participants = new Map();

  for (const r of raw) {
    const t = toIso(r.d, r.time, order);
    const msg = classify(r.rest, format, resolveMedia);
    msg.i = messages.length;
    msg.t = t;
    if (msg.a) participants.set(msg.a, (participants.get(msg.a) || 0) + 1);
    messages.push(msg);
  }

  return { format, messages, participants: [...participants.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n) };
}

function detectDateOrder(dates, ampmSeen) {
  let firstBig = false, secondBig = false;
  for (const [a, b] of dates) {
    if (a.length === 4) return 'ymd';
    if (+a > 12) firstBig = true;
    if (+b > 12) secondBig = true;
  }
  if (firstBig && !secondBig) return 'dmy';
  if (secondBig && !firstBig) return 'mdy';
  return ampmSeen ? 'mdy' : 'dmy';
}

const pad = (n) => String(n).padStart(2, '0');

function toIso([a, b, c], [h, mi, s, ampm], order) {
  let y, mo, d;
  if (order === 'ymd') [y, mo, d] = [+a, +b, +c];
  else if (order === 'mdy') [mo, d, y] = [+a, +b, +c];
  else [d, mo, y] = [+a, +b, +c];
  if (y < 100) y += 2000;
  if (ampm) {
    const pm = /p/i.test(ampm);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}`;
}

function classify(rest, format, resolveMedia) {
  let author = null;
  let body = rest;
  const am = /^([^:\n]{1,80}?): ([\s\S]*)$/.exec(rest) || /^([^:\n]{1,80}?):$/.exec(rest);
  if (am) {
    const cand = clean(am[1]).trim();
    // mensagens de sistema com ":" no meio (ex.: mudou o assunto para "a: b")
    if (cand && !/["“”«»]/.test(cand)) {
      author = cand;
      body = am[2] ?? '';
    }
  }

  const startsInvisible = /^[‎‏]/.test(body);
  let text = clean(body).replace(/\s+$/, '');
  const msg = { a: author };

  if (!author) {
    msg.type = 'system';
    msg.text = text;
    return msg;
  }

  const ed = EDITED.exec(text);
  if (ed) {
    msg.edited = true;
    text = text.slice(0, ed.index);
  }

  // Anexos (iOS): <attached: 00000012-PHOTO-2023-...jpg>
  let im = IOS_ATTACH.exec(text);
  if (im) {
    const file = im[1].trim();
    let caption = (text.slice(0, im.index) + text.slice(im.index + im[0].length)).trim();
    const kind = mediaKindFromFile(file);
    if (kind === 'document' && /•/.test(caption)) caption = '';
    return withMedia(msg, file, kind, caption, resolveMedia);
  }
  // Anexos (Android): IMG-20230101-WA0001.jpg (arquivo anexado)
  const an = ANDROID_ATTACH.exec(text);
  if (an) {
    const file = an[1].trim();
    const found = resolveMedia(file);
    if (ANDROID_ATTACH_PHRASES.test(an[2]) || found) {
      return withMedia(msg, file, mediaKindFromFile(file), (an[3] || '').trim(), resolveMedia);
    }
  }

  const om = OMITTED.exec(text);
  if (om || OMITTED_SIMPLE.test(text)) {
    msg.type = 'omitted';
    msg.kind = om ? omittedKind(om[1]) : 'media';
    return msg;
  }
  if (DELETED.test(text.trim())) {
    msg.type = 'deleted';
    msg.mine = /^(you|você|voce|eliminaste)/i.test(text.trim());
    return msg;
  }
  const loc = LOCATION.exec(text.trim());
  if (loc) {
    msg.type = 'location';
    msg.url = loc[1];
    const q = /[?&](?:q|query)=(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/.exec(loc[1]) || /@(-?\d+\.?\d*),(-?\d+\.?\d*)/.exec(loc[1]);
    if (q) msg.coords = [+q[1], +q[2]];
    const extra = text.trim().slice(loc[0].length).trim();
    if (extra) msg.text = extra;
    return msg;
  }
  if (LIVE_LOCATION.test(text.trim())) {
    msg.type = 'location';
    msg.live = true;
    return msg;
  }
  const poll = POLL.exec(text.trim());
  if (poll) {
    const ls = poll[1].split('\n').map((l) => l.trim()).filter(Boolean);
    const options = [];
    let question = '';
    for (const l of ls) {
      const o = POLL_OPTION.exec(l);
      if (o) options.push({ text: o[1], votes: o[2] ? +o[2] : 0 });
      else if (!options.length) question += (question ? ' ' : '') + l;
    }
    if (options.length) {
      msg.type = 'poll';
      msg.poll = { question, options };
      return msg;
    }
  }

  // iOS marca eventos (chamadas perdidas, criptografia etc.) com um caractere invisível
  if (format === 'ios' && startsInvisible) {
    msg.type = 'system';
    msg.text = text;
    msg.a = null;
    msg.by = author;
    return msg;
  }

  msg.type = 'text';
  msg.text = text;
  return msg;
}

function withMedia(msg, file, kind, caption, resolveMedia) {
  const found = resolveMedia(file);
  msg.type = 'media';
  msg.media = {
    name: file,
    kind,
    ext: (file.split('.').pop() || '').toLowerCase(),
    rel: found ? found.rel : null,
    size: found ? found.size : null,
  };
  if (caption) msg.text = caption;
  return msg;
}
