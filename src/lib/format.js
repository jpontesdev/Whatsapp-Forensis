const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const pad = (n) => String(n).padStart(2, '0');

export const toDate = (t) => (t ? new Date(t) : null);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (d) => Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

export function timeHM(t) {
  const d = toDate(t);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}

export function dateDMY(t) {
  const d = toDate(t);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

/** Horário mostrado na lista de conversas */
export function listTime(t) {
  const d = toDate(t);
  if (!d) return '';
  const n = daysAgo(d);
  if (n === 0) return timeHM(t);
  if (n === 1) return 'Ontem';
  if (n > 1 && n < 7) return WEEKDAYS[d.getDay()];
  return dateDMY(t);
}

/** Rótulo do separador de dia dentro da conversa */
export function dayLabel(t) {
  const d = toDate(t);
  if (!d) return '';
  const n = daysAgo(d);
  if (n === 0) return 'HOJE';
  if (n === 1) return 'ONTEM';
  if (n > 1 && n < 7) return WEEKDAYS[d.getDay()].toUpperCase();
  return dateDMY(t);
}

export function fullDate(t) {
  const d = toDate(t);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) + ' às ' + timeHM(t);
}

export function fileSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
}

export function duration(s) {
  if (s == null || !isFinite(s)) return '0:00';
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < (s || '').length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// cores usadas nos nomes dos participantes em grupos
const AUTHOR_COLORS = ['#e542a3', '#1f7aec', '#dfb610', '#029d00', '#8b7add', '#fe7c7f', '#ba33dc', '#59d368', '#b04632', '#fd85d4', '#8393ca', '#ff8f2c', '#3bdec3', '#b4876e', '#c90379', '#ef4b4f'];
export const authorColor = (name) => AUTHOR_COLORS[hashString(name) % AUTHOR_COLORS.length];

export function isMine(m, me) {
  if (m.fromMe) return true;
  if (m.type === 'system' || !m.a) return false;
  return !!me && m.a === me;
}

const KIND_LABEL = { image: 'Foto', video: 'Vídeo', gif: 'GIF', voice: 'Mensagem de voz', audio: 'Áudio', sticker: 'Figurinha', document: 'Documento', contact: 'Contato', media: 'Mídia' };
export const kindLabel = (k) => KIND_LABEL[k] || 'Arquivo';

/** Texto curto para a prévia na lista de conversas / busca */
export function previewText(m) {
  if (!m) return '';
  switch (m.type) {
    case 'text':
    case 'system':
      return m.text;
    case 'media':
      if (m.media.kind === 'voice' || m.media.kind === 'audio') return m.media.duration ? duration(m.media.duration) : kindLabel(m.media.kind);
      if (m.media.kind === 'document') return m.media.name;
      return m.text || kindLabel(m.media.kind);
    case 'omitted':
      return kindLabel(m.kind) + ' (não exportada)';
    case 'deleted':
      return m.mine || m.fromMe ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada';
    case 'location':
      return m.live ? 'Localização em tempo real' : 'Localização';
    case 'poll':
      return m.poll.question || 'Enquete';
    case 'contact':
      return m.contact?.name || 'Contato';
    default:
      return m.text || '';
  }
}
