import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download, MessageSquareText, X, Play } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { downloadUrl, mediaUrl } from '../lib/api.js';
import { fullDate } from '../lib/format.js';

/** Visualizador de fotos e vídeos em tela cheia, com navegação entre as mídias da conversa. */
export default function Lightbox({ chat, items, index, onIndex, onClose, onJump }) {
  const item = items[index];
  const strip = useRef(null);

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, items.length, onClose, onIndex]);

  useEffect(() => {
    strip.current?.querySelector(`[data-k="${index}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [index]);

  if (!item) return null;
  const src = mediaUrl(chat.id, item.media.rel);
  const isVideo = item.media.kind === 'video' || item.media.kind === 'gif';
  const who = item.fromMe ? 'Você' : item.a || chat.name;

  return (
    <div className="fade-in fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--overlay)', color: 'var(--overlay-text)' }}>
      <header className="flex h-[60px] shrink-0 items-center gap-3 px-4">
        <Avatar src={item.fromMe ? null : chat.avatar} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px]">{who}</div>
          <div className="text-[13px] opacity-70">{fullDate(item.t)}</div>
        </div>
        <button onClick={() => onJump(item.i)} className="rounded-full p-2.5 hover:bg-black/10 dark:hover:bg-white/10" title="Ir para a mensagem">
          <MessageSquareText size={22} />
        </button>
        <a href={downloadUrl(chat.id, item.media.rel)} className="rounded-full p-2.5 hover:bg-black/10 dark:hover:bg-white/10" title="Baixar">
          <Download size={22} />
        </a>
        <button onClick={onClose} className="rounded-full p-2.5 hover:bg-black/10 dark:hover:bg-white/10" title="Fechar (Esc)">
          <X size={24} />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 py-4 max-sm:px-2" onClick={onClose}>
        {index > 0 && (
          <button onClick={(e) => (e.stopPropagation(), onIndex(index - 1))} className="absolute left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20" title="Anterior">
            <ChevronLeft size={26} />
          </button>
        )}
        <div className="flex h-full max-w-full flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {isVideo ? (
            <video key={src} src={src} controls autoPlay loop={item.media.kind === 'gif'} className="max-h-full max-w-full rounded shadow-lg" />
          ) : (
            <img key={src} src={src} alt="" className="max-h-full max-w-full rounded object-contain shadow-lg" />
          )}
          {item.text && <div className="mt-3 max-w-[700px] text-center text-[15px] whitespace-pre-wrap">{item.text}</div>}
        </div>
        {index < items.length - 1 && (
          <button onClick={(e) => (e.stopPropagation(), onIndex(index + 1))} className="absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20" title="Próxima">
            <ChevronRight size={26} />
          </button>
        )}
      </div>

      {items.length > 1 && (
        <div ref={strip} className="wa-scroll flex h-[96px] shrink-0 items-center gap-2 overflow-x-auto border-t border-black/10 px-4 dark:border-white/10">
          {items.map((it, k) => {
            const s = mediaUrl(chat.id, it.media.rel);
            const v = it.media.kind === 'video' || it.media.kind === 'gif';
            return (
              <button key={it.i} data-k={k} onClick={() => onIndex(k)} className={`relative h-[66px] w-[66px] shrink-0 overflow-hidden rounded transition ${k === index ? 'ring-4 ring-wa' : 'opacity-70 hover:opacity-100'}`}>
                {v ? (
                  it.media.thumb ? <img src={mediaUrl(chat.id, it.media.thumb)} alt="" className="h-full w-full object-cover" /> : <video src={s + '#t=0.5'} preload="metadata" muted className="h-full w-full object-cover" />
                ) : (
                  <img src={s} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
                {v && <Play size={18} className="absolute inset-0 m-auto text-white drop-shadow" fill="currentColor" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
