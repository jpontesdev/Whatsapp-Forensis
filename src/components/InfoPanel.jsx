import { useEffect, useState } from 'react';
import { ChevronRight, Download, FileText, Link2, LoaderCircle, Play, UserCheck, X, Headphones, Contact } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { api, downloadUrl, mediaUrl } from '../lib/api.js';
import { authorColor, dateDMY, fileSize, fullDate } from '../lib/format.js';

export function PanelShell({ title, onClose, children }) {
  return (
    <aside className="slide-in flex h-full w-[30%] max-w-[460px] min-w-[340px] flex-col border-l border-divider bg-panel max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:w-[400px] max-xl:shadow-2xl max-sm:w-full max-sm:min-w-0">
      <header className="flex h-[59px] shrink-0 items-center gap-6 bg-header px-5">
        <button onClick={onClose} className="text-icon" title="Fechar">
          <X size={22} />
        </button>
        <span className="text-[16px] text-fg">{title}</span>
      </header>
      <div className="wa-scroll min-h-0 flex-1 overflow-y-auto bg-app">{children}</div>
    </aside>
  );
}

function Section({ children, className = '' }) {
  return <div className={`mb-2.5 bg-panel px-[30px] py-4 shadow-[0_1px_3px_rgba(11,20,26,0.08)] ${className}`}>{children}</div>;
}

export default function InfoPanel({ chat, me, onSetMe, onClose, onOpenMedia, onJump, gallery }) {
  const [tab, setTab] = useState(null);
  const counts = chat.counts || {};
  const totalShared = (counts.media || 0) + (counts.docs || 0) + (counts.links || 0);

  useEffect(() => setTab(null), [chat.id]);

  if (tab) {
    return (
      <PanelShell title="Mídia, links e docs" onClose={() => setTab(null)}>
        <div className="sticky top-0 z-10 flex bg-panel">
          {[
            ['media', 'Mídia'],
            ['docs', 'Docs'],
            ['links', 'Links'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 border-b-[3px] py-3.5 text-[14px] ${tab === k ? 'border-wa text-wa' : 'border-transparent text-fg2'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="min-h-full bg-panel p-4">
          {!gallery ? (
            <div className="flex justify-center py-10 text-fg2">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : (
            <SharedList tab={tab} gallery={gallery} chat={chat} onOpenMedia={onOpenMedia} onJump={onJump} />
          )}
        </div>
      </PanelShell>
    );
  }

  const preview = gallery?.media.slice(-3).reverse() || [];

  return (
    <PanelShell title={chat.isGroup ? 'Dados do grupo' : 'Dados do contato'} onClose={onClose}>
      <Section className="flex flex-col items-center pt-7 pb-5 text-center">
        <Avatar src={chat.avatar} group={chat.isGroup} size={200} />
        <div className="mt-4 text-[22px] leading-tight text-fg">{chat.name}</div>
        <div className="mt-1 text-[15px] text-fg2">
          {chat.isGroup ? `Grupo · ${(chat.members?.length || chat.participants.length) + (chat.meKnown ? 1 : 0)} participantes` : chat.jid ? '+' + chat.jid.split('@')[0].split('~')[0] : 'Conversa exportada'}
        </div>
      </Section>

      {(chat.about || chat.createdAt) && (
        <Section>
          <div className="text-[14px] text-fg2">{chat.isGroup ? 'Criado em' : 'Recado'}</div>
          <div className="mt-1 text-[15px] text-fg">{chat.isGroup ? fullDate(chat.createdAt) : chat.about}</div>
        </Section>
      )}

      <Section>
        <button onClick={() => totalShared && setTab('media')} className="flex w-full items-center justify-between text-[14px] text-fg2">
          <span>Mídia, links e docs</span>
          <span className="flex items-center gap-1">
            {totalShared} <ChevronRight size={18} />
          </span>
        </button>
        {preview.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {preview.map((g) => (
              <Thumb key={g.i} g={g} chat={chat} onClick={() => onOpenMedia(g)} />
            ))}
          </div>
        )}
      </Section>

      <Section>
        <div className="text-[14px] text-fg2">Conversa</div>
        <div className="mt-2 space-y-1 text-[14px] text-fg">
          <div>{chat.total.toLocaleString('pt-BR')} mensagens</div>
          {chat.first && (
            <div className="text-fg2">
              De {dateDMY(chat.first)} a {dateDMY(chat.last?.t)}
            </div>
          )}
          <div className="text-[12px] break-all text-fg3">Fonte: {chat.source}</div>
        </div>
      </Section>

      {!chat.meKnown && (
        <Section>
          <div className="flex items-center gap-2 text-[14px] text-fg2">
            <UserCheck size={16} /> Quem é você nesta conversa?
          </div>
          <p className="mt-1 text-[12.5px] text-fg3">Arquivos exportados não indicam o dono. Suas mensagens aparecem em verde, à direita.</p>
          <select value={me || ''} onChange={(e) => onSetMe(e.target.value || null)} className="mt-3 w-full rounded-md border border-divider bg-panel px-3 py-2 text-[14px] text-fg outline-none">
            <option value="">— Ninguém (só leitura) —</option>
            {chat.participants.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Section>
      )}

      {chat.isGroup && (
        <Section className="px-0">
          <div className="px-[30px] pb-2 text-[14px] text-fg2">{(chat.members?.length || chat.participants.length) + (chat.meKnown ? 1 : 0)} participantes</div>
          {chat.meKnown && <MemberRow name="Você" />}
          {(chat.members || chat.participants.map((name) => ({ name }))).map((m) => (
            <MemberRow key={m.name} name={m.name} push={m.push} admin={m.admin} you={m.name === me} />
          ))}
        </Section>
      )}
    </PanelShell>
  );
}

function MemberRow({ name, push, admin, you }) {
  return (
    <div className="flex h-[62px] items-center gap-4 px-[30px] hover:bg-hover">
      <Avatar size={40} />
      <div className="min-w-0 flex-1 border-b border-divider py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[16px] text-fg">{you ? 'Você' : name}</span>
          {admin && <span className="shrink-0 rounded bg-pill px-1.5 py-0.5 text-[11px] text-pill-fg">Admin do grupo</span>}
        </div>
        {push && <div className="truncate text-[13px] text-fg2">~ {push}</div>}
      </div>
    </div>
  );
}

function Thumb({ g, chat, onClick }) {
  const src = mediaUrl(chat.id, g.media.rel);
  const isVideo = g.media.kind === 'video' || g.media.kind === 'gif';
  return (
    <button onClick={onClick} className="relative aspect-square overflow-hidden rounded bg-placeholder">
      {isVideo ? (
        g.media.thumb ? <img src={mediaUrl(chat.id, g.media.thumb)} className="h-full w-full object-cover" alt="" /> : <video src={src + '#t=0.5'} preload="metadata" muted className="h-full w-full object-cover" />
      ) : (
        <img src={src} loading="lazy" className="h-full w-full object-cover" alt="" />
      )}
      {isVideo && <Play size={22} className="absolute inset-0 m-auto text-white drop-shadow" fill="currentColor" />}
    </button>
  );
}

function SharedList({ tab, gallery, chat, onOpenMedia, onJump }) {
  if (tab === 'media') {
    if (!gallery.media.length) return <Empty text="Nenhuma mídia disponível" />;
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {gallery.media
          .slice()
          .reverse()
          .map((g) => (
            <Thumb key={g.i} g={g} chat={chat} onClick={() => onOpenMedia(g)} />
          ))}
      </div>
    );
  }
  if (tab === 'docs') {
    if (!gallery.docs.length) return <Empty text="Nenhum documento" />;
    return (
      <div className="space-y-2">
        {gallery.docs
          .slice()
          .reverse()
          .map((g) => {
            const Icon = g.media.kind === 'audio' ? Headphones : g.media.kind === 'contact' ? Contact : FileText;
            return (
              <div key={g.i} className="flex items-center gap-3 rounded-lg bg-card p-3">
                <Icon size={28} className="shrink-0 text-fg2" />
                <button onClick={() => onJump(g.i)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[14px] text-fg">{g.media.name.replace(/^\d{8}-/, '')}</div>
                  <div className="text-[12px] text-fg2">
                    {fileSize(g.media.size)} · {dateDMY(g.t)}
                  </div>
                </button>
                <a href={downloadUrl(chat.id, g.media.rel)} className="text-icon" title="Baixar">
                  <Download size={18} />
                </a>
              </div>
            );
          })}
      </div>
    );
  }
  if (!gallery.links.length) return <Empty text="Nenhum link" />;
  return (
    <div className="space-y-2">
      {gallery.links
        .slice()
        .reverse()
        .map((l, k) => (
          <div key={k} className="flex gap-3 rounded-lg bg-card p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-black/5 text-fg2 dark:bg-white/5">
              <Link2 size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[14px] text-link hover:underline">
                {l.url}
              </a>
              <button onClick={() => onJump(l.i)} className="text-[12px] text-fg2 hover:underline">
                <span style={{ color: l.a ? authorColor(l.a) : undefined }}>{l.a || 'Você'}</span> · {dateDMY(l.t)} · ir para a mensagem
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}

function Empty({ text }) {
  return <div className="py-16 text-center text-[14px] text-fg2">{text}</div>;
}
