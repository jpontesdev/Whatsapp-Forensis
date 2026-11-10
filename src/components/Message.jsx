import { useState } from 'react';
import { Ban, Download, FileText, ImageOff, Lock, MapPin, Play, Star, Video, VideoOff, Film, Image as ImageIcon, Mic, Sticker, ExternalLink, X, Phone } from 'lucide-react';
import Avatar from './Avatar.jsx';
import AudioPlayer from './AudioPlayer.jsx';
import Status from './Status.jsx';
import { RichText, emojiOnlyCount } from '../lib/richtext.jsx';
import { authorColor, duration, fileSize, fullDate, kindLabel, timeHM } from '../lib/format.js';
import { downloadUrl, mediaUrl } from '../lib/api.js';

/* ---------- partes comuns ---------- */

function Tail({ mine }) {
  return mine ? (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -right-2" style={{ color: 'var(--out)' }}>
      <path fill="currentColor" d="M0 0h5.2C7.4 0 8.1 1.6 6.8 3.3L0 12.5z" />
    </svg>
  ) : (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -left-2" style={{ color: 'var(--in)' }}>
      <path fill="currentColor" d="M8 0H2.8C.6 0-.1 1.6 1.2 3.3L8 12.5z" />
    </svg>
  );
}

function Meta({ m, mine, overlay = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-[3px] whitespace-nowrap text-[11px] leading-[15px] ${overlay ? 'text-white/90' : 'text-meta'} ${className}`}
      title={fullDate(m.t) + (m.approx ? ' (horário aproximado)' : '')}
    >
      {m.starred && <Star size={11} fill="currentColor" strokeWidth={0} />}
      {m.edited && <span className="mr-0.5">Editada</span>}
      {m.approx ? '~' : ''}
      {timeHM(m.t)}
      {mine && <Status status={m.status || 'read'} className={overlay && m.status !== 'read' && m.status !== 'played' ? 'text-white' : ''} />}
    </span>
  );
}

function metaWidth(m, mine) {
  return 38 + (mine ? 20 : 0) + (m.edited ? 44 : 0) + (m.starred ? 14 : 0) + (m.approx ? 6 : 0);
}

/* ---------- conteúdos ---------- */

function TextBody({ m, mine, highlight }) {
  const emojis = emojiOnlyCount(m.text);
  if (emojis && emojis <= 3) {
    return (
      <div className="pb-1">
        <div className={`${emojis === 1 ? 'text-[48px] leading-[56px]' : 'text-[36px] leading-[44px]'}`}>{m.text}</div>
        <div className="flex justify-end">
          <Meta m={m} mine={mine} />
        </div>
      </div>
    );
  }
  return (
    <div className="whitespace-pre-wrap break-words">
      <RichText text={m.text} highlight={highlight} />
      <span className="inline-block" style={{ width: metaWidth(m, mine) }} />
    </div>
  );
}

function LinkPreview({ link, chatId }) {
  let domain = '';
  try {
    domain = new URL(link.url).hostname.replace(/^www\./, '');
  } catch {}
  if (!link.title && !link.summary) return null;
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className="mb-1 flex overflow-hidden rounded-md bg-card hover:opacity-90" onClick={(e) => e.stopPropagation()}>
      {link.thumb && <img src={mediaUrl(chatId, link.thumb)} alt="" className="h-[88px] w-[88px] shrink-0 object-cover" />}
      <div className="min-w-0 px-2.5 py-2">
        {link.title && <div className="line-clamp-2 text-[13.5px] font-medium text-fg">{link.title}</div>}
        {link.summary && <div className="line-clamp-2 mt-0.5 text-[12.5px] text-fg2">{link.summary}</div>}
        {domain && <div className="mt-0.5 text-[12px] text-fg3">{domain}</div>}
      </div>
    </a>
  );
}

function MissingBox({ icon: Icon, label, size, dur, h = 220 }) {
  return (
    <div className="relative flex w-[330px] max-w-full flex-col items-center justify-center gap-2 rounded-md bg-placeholder text-fg2" style={{ height: h }}>
      <Icon size={40} strokeWidth={1.4} />
      <span className="px-6 text-center text-[13px]">{label}</span>
      {(size || dur) && (
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[12px] text-white">
          <Download size={13} /> {dur ? duration(dur) : ''} {dur && size ? '·' : ''} {fileSize(size)}
        </span>
      )}
    </div>
  );
}

function ImageBody({ m, chatId, onOpen }) {
  const [ratio, setRatio] = useState(null);
  const src = mediaUrl(chatId, m.media.rel);
  const w = 330;
  const h = ratio ? Math.min(338, Math.max(110, w / Math.max(ratio, 0.6))) : 250;
  if (!src) return <MissingBox icon={ImageOff} label="Imagem não incluída no backup" size={m.media.size} />;
  return (
    <button onClick={() => onOpen(m)} className="relative block w-[330px] max-w-full cursor-pointer overflow-hidden rounded-md bg-placeholder" style={{ height: h }}>
      <img
        src={src}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
        onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
      />
    </button>
  );
}

function VideoBody({ m, chatId, onOpen }) {
  const src = mediaUrl(chatId, m.media.rel);
  const poster = mediaUrl(chatId, m.media.thumb);
  if (!src) return <MissingBox icon={VideoOff} label="Vídeo não incluído no backup" size={m.media.size} dur={m.media.duration} />;
  return (
    <button onClick={() => onOpen(m)} className="relative block h-[250px] w-[330px] max-w-full overflow-hidden rounded-md bg-black">
      {poster ? (
        <img src={poster} alt="" className="h-full w-full object-cover" />
      ) : (
        <video src={src + '#t=0.5'} preload="metadata" muted playsInline className="h-full w-full object-cover" />
      )}
      <span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white">
        <Play size={28} fill="currentColor" strokeWidth={0} className="ml-1" />
      </span>
      <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[11px] text-white drop-shadow">
        {m.media.kind === 'gif' ? 'GIF' : <Video size={14} />} {m.media.duration ? duration(m.media.duration) : ''}
      </span>
    </button>
  );
}

const DOC_COLORS = { pdf: '#e2574c', doc: '#2a7cd6', docx: '#2a7cd6', xls: '#1f9d55', xlsx: '#1f9d55', csv: '#1f9d55', ppt: '#e8743b', pptx: '#e8743b', zip: '#8a8f94', rar: '#8a8f94', txt: '#8a8f94' };

function DocBody({ m, chatId }) {
  const ext = (m.media.ext || 'arq').toLowerCase();
  const src = mediaUrl(chatId, m.media.rel);
  const name = m.media.name.replace(/^\d{8}-/, '');
  const Wrapper = src ? 'a' : 'div';
  return (
    <Wrapper
      {...(src ? { href: src, target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={(e) => e.stopPropagation()}
      className="flex w-[330px] max-w-full items-center gap-3 rounded-md bg-card px-3 py-3 hover:opacity-90"
    >
      <div className="relative flex h-10 w-[30px] shrink-0 items-end justify-center rounded-[3px] pb-1 text-[8px] font-bold uppercase text-white" style={{ background: DOC_COLORS[ext] || '#5f7d8c' }}>
        <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-bl-[3px] bg-white/40" />
        {ext.slice(0, 4)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[14px] break-all text-fg">{name}</div>
        <div className="mt-0.5 text-[12px] text-fg2">
          {ext.toUpperCase()} {m.media.size ? `· ${fileSize(m.media.size)}` : ''} {!src && '· não incluído no backup'}
        </div>
      </div>
      {src && (
        <a href={downloadUrl(chatId, m.media.rel)} onClick={(e) => e.stopPropagation()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-fg3/40 text-fg2" title="Baixar">
          <Download size={18} />
        </a>
      )}
    </Wrapper>
  );
}

function parseVcard(v) {
  return [...(v || '').matchAll(/^TEL[^:\n]*:(.+)$/gim)].map((x) => x[1].trim());
}

function ContactBody({ name, phones, vcard, fileSrc }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(phones || null);
  const [card, setCard] = useState(vcard || null);
  const show = async (e) => {
    e.stopPropagation();
    if (!loaded && fileSrc) {
      try {
        const txt = await (await fetch(fileSrc)).text();
        setCard(txt);
        setLoaded(parseVcard(txt));
      } catch {
        setLoaded([]);
      }
    }
    setOpen(true);
  };
  const save = (e) => {
    e.stopPropagation();
    const blob = new Blob([card || `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nEND:VCARD`], { type: 'text/vcard' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.vcf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="w-[300px] max-w-full">
      <div className="flex items-center gap-3 px-1 pt-1 pb-3">
        <Avatar size={42} />
        <span className="text-[15px] font-medium text-fg">{name}</span>
      </div>
      <div className="-mx-[7px] border-t border-black/10 dark:border-white/10">
        <button onClick={show} className="w-full pt-2.5 text-center text-[14px] font-medium text-[var(--link)]">
          Ver contato
        </button>
      </div>
      {open && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => (e.stopPropagation(), setOpen(false))}>
          <div className="w-[340px] rounded-lg bg-panel p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[16px] font-medium">Contato</span>
              <button onClick={() => setOpen(false)} className="text-icon">
                <X size={20} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <Avatar size={52} />
              <span className="text-[17px]">{name}</span>
            </div>
            <div className="mt-4 space-y-2">
              {(loaded || []).length ? (
                loaded.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 text-[15px] text-fg">
                    <Phone size={16} className="text-fg2" /> {p}
                  </div>
                ))
              ) : (
                <div className="text-[14px] text-fg2">Nenhum telefone no cartão.</div>
              )}
            </div>
            <button onClick={save} className="mt-5 w-full rounded-full bg-wa py-2 text-[14px] font-medium text-white">
              Salvar .vcf
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LocationBody({ m }) {
  return (
    <a href={m.url || '#'} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block w-[270px] max-w-full overflow-hidden rounded-md">
      <div
        className="relative flex h-[150px] items-center justify-center"
        style={{
          background:
            'linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(135deg,#e6efd9,#d8e6f0 60%,#f2ead3)',
        }}
      >
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 270 150" preserveAspectRatio="none">
          <path d="M-10 110 C60 90 90 120 150 80 S240 40 290 60" stroke="#fff" strokeWidth="9" fill="none" />
          <path d="M70 -10 C80 50 60 90 90 160" stroke="#fff" strokeWidth="6" fill="none" />
          <path d="M180 -10 L200 160" stroke="#fbe7a1" strokeWidth="7" fill="none" />
        </svg>
        <MapPin size={38} className="relative -mt-4 text-[#ea4335] drop-shadow" fill="#ea4335" stroke="#a52714" />
      </div>
      <div className="bg-card px-2 py-1.5 text-[12.5px] text-fg2">
        {m.live ? 'Localização em tempo real' : m.coords ? `${m.coords[0].toFixed(5)}, ${m.coords[1].toFixed(5)}` : 'Localização'}
        <ExternalLink size={12} className="ml-1 inline" />
      </div>
    </a>
  );
}

function PollBody({ m }) {
  const total = m.poll.options.reduce((n, o) => n + o.votes, 0) || 1;
  return (
    <div className="w-[320px] max-w-full px-1 pt-1">
      <div className="text-[15px] font-semibold text-fg">{m.poll.question}</div>
      <div className="mb-2 text-[12.5px] text-fg2">Selecione uma opção</div>
      {m.poll.options.map((o, i) => (
        <div key={i} className="mb-2.5">
          <div className="flex items-center gap-2 text-[14px]">
            <span className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-fg3/60" />
            <span className="flex-1">{o.text}</span>
            <span className="text-[13px] text-fg2">{o.votes}</span>
          </div>
          <div className="mt-1 ml-[26px] h-[6px] rounded-full bg-black/10 dark:bg-white/10">
            <div className="h-full rounded-full bg-wa" style={{ width: `${(o.votes / total) * 100}%` }} />
          </div>
        </div>
      ))}
      <div className="-mx-[7px] mt-1 border-t border-black/10 pt-2 text-center text-[14px] font-medium text-[var(--link)] dark:border-white/10">Ver votos</div>
    </div>
  );
}

const OMIT_ICON = { image: ImageIcon, video: Film, gif: Film, voice: Mic, sticker: Sticker, document: FileText };

/* ---------- mensagem ---------- */

export function SystemMessage({ m }) {
  return (
    <div data-i={m.i} className="my-2 flex justify-center px-[5%]">
      <div
        className={`bubble-shadow flex max-w-[85%] items-start gap-1.5 rounded-[7.5px] px-3 py-[5px] text-center text-[12.5px] leading-[17px] ${m.lock ? 'bg-enc text-enc-fg' : 'bg-chip text-chip-fg'}`}
        title={fullDate(m.t)}
      >
        {m.lock && <Lock size={12} className="mt-[2px] shrink-0" />}
        <span>{m.text}</span>
      </div>
    </div>
  );
}

export default function Message({ m, mine, first, isGroup, chatId, onOpenMedia, highlight, flash, senderAvatar }) {
  const kind = m.media?.kind;
  const isSticker = m.type === 'media' && kind === 'sticker' && m.media.rel;
  const visual = m.type === 'media' && (kind === 'image' || kind === 'video' || kind === 'gif');
  const showName = isGroup && !mine && first;
  const pad = visual ? 'p-[3px]' : m.type === 'media' && kind === 'document' ? 'p-[3px]' : 'px-[7px] pt-[6px] pb-[8px]';

  let body;
  if (m.type === 'text') {
    body = (
      <>
        {m.link && <LinkPreview link={m.link} chatId={chatId} />}
        <TextBody m={m} mine={mine} highlight={highlight} />
      </>
    );
  } else if (m.type === 'deleted') {
    body = (
      <div className="flex items-center gap-1.5 text-fg2 italic">
        <Ban size={15} />
        {m.mine || mine ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'}
        <span className="inline-block" style={{ width: metaWidth(m, mine) - 20 }} />
      </div>
    );
  } else if (m.type === 'omitted') {
    const Icon = OMIT_ICON[m.kind] || ImageOff;
    body = (
      <div className="flex items-center gap-1.5 text-fg2 italic">
        <Icon size={15} /> {kindLabel(m.kind)} não incluída na exportação
        <span className="inline-block" style={{ width: metaWidth(m, mine) - 20 }} />
      </div>
    );
  } else if (m.type === 'location') {
    body = (
      <>
        <LocationBody m={m} />
        {m.text && (
          <div className="mt-1 px-1 whitespace-pre-wrap break-words">
            <RichText text={m.text} highlight={highlight} />
            <span className="inline-block" style={{ width: metaWidth(m, mine) }} />
          </div>
        )}
      </>
    );
  } else if (m.type === 'poll') {
    body = <PollBody m={m} />;
  } else if (m.type === 'contact') {
    body = <ContactBody name={m.contact.name} phones={m.contact.phones} vcard={m.contact.vcard} />;
  } else if (m.type === 'media') {
    if (kind === 'image') body = <ImageBody m={m} chatId={chatId} onOpen={onOpenMedia} />;
    else if (kind === 'video' || kind === 'gif') body = <VideoBody m={m} chatId={chatId} onOpen={onOpenMedia} />;
    else if (kind === 'voice' || kind === 'audio')
      body = <AudioPlayer src={mediaUrl(chatId, m.media.rel)} knownDuration={m.media.duration} mine={mine} voice={kind === 'voice'} avatarSrc={senderAvatar} title={m.media.name} />;
    else if (kind === 'contact')
      body = <ContactBody name={m.media.name.replace(/\.vcf$/i, '')} fileSrc={mediaUrl(chatId, m.media.rel)} />;
    else if (kind === 'sticker' && !m.media.rel) body = <MissingBox icon={Sticker} label="Figurinha não incluída no backup" h={150} />;
    else if (!isSticker) body = <DocBody m={m} chatId={chatId} />;
    if (m.text && kind !== 'voice' && kind !== 'audio')
      body = (
        <>
          {body}
          <div className="px-1 pt-1 pb-[5px] whitespace-pre-wrap break-words">
            <RichText text={m.text} highlight={highlight} />
            <span className="inline-block" style={{ width: metaWidth(m, mine) }} />
          </div>
        </>
      );
  }

  const overlayMeta = visual && !m.text;
  const isAudio = m.type === 'media' && (kind === 'voice' || kind === 'audio');
  const metaInline = m.type === 'text' && emojiOnlyCount(m.text) > 0 && emojiOnlyCount(m.text) <= 3;

  return (
    <div data-i={m.i} className={`flex px-[4%] xl:px-[63px] ${first ? 'mt-3' : 'mt-[2px]'} ${mine ? 'justify-end' : 'justify-start'} ${flash ? 'flash' : ''}`}>
      {isSticker ? (
        <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
          {showName && <SenderName m={m} />}
          <button onClick={() => onOpenMedia(m)}>
            <img src={mediaUrl(chatId, m.media.rel)} alt="Figurinha" className="h-[190px] w-[190px] object-contain" loading="lazy" />
          </button>
          <span className="mt-0.5 rounded-full bg-chip px-2 py-0.5">
            <Meta m={m} mine={mine} />
          </span>
        </div>
      ) : (
        <div
          className={`bubble-shadow relative max-w-[min(65%,560px)] rounded-[7.5px] text-[14.2px] leading-[19px] text-fg max-md:max-w-[85%] ${mine ? 'bg-out' : 'bg-in'} ${
            first ? (mine ? 'rounded-tr-none' : 'rounded-tl-none') : ''
          } ${pad} ${visual || kind === 'document' ? 'w-[336px]' : ''}`}
        >
          {first && <Tail mine={mine} />}
          {showName && <SenderName m={m} className={visual || kind === 'document' ? 'px-1 pt-0.5 pb-1' : ''} />}
          {body}
          {!metaInline && (
            <div
              className={`absolute ${
                overlayMeta
                  ? 'right-[7px] bottom-[6px] rounded-full bg-gradient-to-t from-black/50 to-black/20 px-1.5'
                  : isAudio && mine
                    ? 'right-[72px] bottom-[6px]'
                    : 'right-[7px] bottom-[3px]'
              }`}
            >
              <Meta m={m} mine={mine} overlay={overlayMeta} />
            </div>
          )}
          {m.type === 'media' && kind === 'document' && <div className="h-[16px]" />}
        </div>
      )}
    </div>
  );
}

function SenderName({ m, className = '' }) {
  return (
    <div className={`mb-0.5 flex items-baseline gap-2 text-[12.8px] leading-[18px] ${className}`}>
      <span className="truncate font-medium" style={{ color: authorColor(m.a) }}>
        {m.a}
      </span>
      {m.push && <span className="truncate text-[12px] text-fg2">~ {m.push}</span>}
    </div>
  );
}
