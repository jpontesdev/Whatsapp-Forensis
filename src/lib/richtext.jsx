import { Fragment } from 'react';

const URL = String.raw`(?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]!?*_~]`;
const TOKEN = new RegExp(
  [
    `(${URL})`,
    String.raw`(?<![\p{L}\p{N}*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}*])`,
    String.raw`(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}_])`,
    String.raw`(?<![\p{L}\p{N}~])~(?!\s)([^~\n]+?)(?<!\s)~(?![\p{L}\p{N}~])`,
    String.raw`\x60([^\x60\n]+)\x60`,
  ].join('|'),
  'gu',
);

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function hl(text, key, q) {
  if (!q) return <Fragment key={key}>{text}</Fragment>;
  const f = fold(text);
  const fq = fold(q);
  const parts = [];
  let pos = 0;
  let idx;
  // fold() preserva o comprimento para letras latinas acentuadas comuns
  while (fq && f.length === text.length && (idx = f.indexOf(fq, pos)) >= 0) {
    if (idx > pos) parts.push(text.slice(pos, idx));
    parts.push(
      <mark key={idx} className="rounded-sm bg-[#ffd279] text-[#111b21]">
        {text.slice(idx, idx + fq.length)}
      </mark>,
    );
    pos = idx + fq.length;
  }
  parts.push(text.slice(pos));
  return <Fragment key={key}>{parts}</Fragment>;
}

function inline(text, keyBase, highlight) {
  const out = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(hl(text.slice(last, m.index), `${keyBase}-${k++}`, highlight));
    const key = `${keyBase}-${k++}`;
    if (m[1]) {
      const href = m[1].startsWith('www.') ? 'https://' + m[1] : m[1];
      out.push(
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-link break-all hover:underline" onClick={(e) => e.stopPropagation()}>
          {m[1]}
        </a>,
      );
    } else if (m[2]) out.push(<strong key={key} className="font-semibold">{inline(m[2], key, highlight)}</strong>);
    else if (m[3]) out.push(<em key={key}>{inline(m[3], key, highlight)}</em>);
    else if (m[4]) out.push(<s key={key}>{inline(m[4], key, highlight)}</s>);
    else if (m[5]) out.push(<code key={key} className="rounded bg-card px-1 font-mono text-[13px]">{m[5]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(hl(text.slice(last), `${keyBase}-${k++}`, highlight));
  return out;
}

/** Texto com a formatação do WhatsApp: *negrito*, _itálico_, ~tachado~, ```mono```, `código` e links */
export function RichText({ text, highlight }) {
  if (!text) return null;
  const blocks = text.split(/```([\s\S]+?)```/g);
  return blocks.map((b, i) =>
    i % 2 ? (
      <code key={i} className="whitespace-pre-wrap font-mono text-[13px]">{b}</code>
    ) : (
      <Fragment key={i}>{inline(b, i, highlight)}</Fragment>
    ),
  );
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Emoji_Modifier}|‍|️|\s)+$/u;
/** Quantos emojis há numa mensagem composta só de emojis (0 se houver texto) */
export function emojiOnlyCount(text) {
  if (!text || text.length > 40 || !EMOJI_ONLY.test(text) || /^[\d#*\s]+$/.test(text)) return 0;
  const seg = new Intl.Segmenter('pt', { granularity: 'grapheme' });
  return [...seg.segment(text.replace(/\s/g, ''))].length;
}
