import { memo, useMemo, useState } from 'react';
import { Archive, ArrowLeft, Ban, Camera, FileText, Film, Image as ImageIcon, MapPin, Mic, Moon, RefreshCw, Search, Sun, User, X, ChartNoAxesColumn, Star, Lock } from 'lucide-react';
import Avatar from './Avatar.jsx';
import Status from './Status.jsx';
import { RBadge } from './ForensicPanel.jsx';
import { DropArea } from './DropZone.jsx';
import { isMine, listTime, previewText } from '../lib/format.js';

const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function PreviewIcon({ m }) {
  const cls = 'mr-1 inline shrink-0 align-[-3px]';
  if (m.type === 'deleted') return <Ban size={15} className={cls} />;
  if (m.type === 'location') return <MapPin size={15} className={cls} />;
  if (m.type === 'contact') return <User size={15} className={cls} />;
  if (m.type === 'poll') return <ChartNoAxesColumn size={15} className={cls} />;
  if (m.type !== 'media') return null;
  const k = m.media.kind;
  if (k === 'image') return <Camera size={15} className={cls} />;
  if (k === 'video' || k === 'gif') return <Film size={15} className={cls} />;
  if (k === 'voice' || k === 'audio') return <Mic size={15} className={`${cls} ${m.fromMe ? '' : 'text-wa'}`} />;
  if (k === 'document') return <FileText size={15} className={cls} />;
  if (k === 'sticker') return <ImageIcon size={15} className={cls} />;
  return null;
}

const ChatItem = memo(function ChatItem({ chat, me, active, unread, onSelect }) {
  const m = chat.last;
  const mine = m && isMine(m, me);
  const author = m && chat.isGroup && !mine && m.a ? m.a.split(' ')[0] : null;
  return (
    <button onClick={() => onSelect(chat.id)} className={`group flex h-[72px] w-full items-center text-left ${active ? 'bg-active' : 'hover:bg-hover'}`}>
      <div className="px-[13px]">
        <Avatar src={chat.avatar} group={chat.isGroup} size={49} />
      </div>
      <div className="flex h-full min-w-0 flex-1 flex-col justify-center border-b border-divider pr-[15px] group-last:border-b-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[17px] leading-[21px] text-fg">{chat.name}</span>
          <span className={`shrink-0 text-[12px] ${unread ? 'font-medium text-badge' : 'text-fg2'}`}>{m ? listTime(m.t) : ''}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[14px] leading-[20px] text-fg2">
            {mine && m.type !== 'system' && <Status status={m.status || 'read'} className="mr-0.5 align-[-4px]" />}
            {author && <span>{author}: </span>}
            {m && <PreviewIcon m={m} />}
            <span className={m?.type === 'deleted' ? 'italic' : ''}>{m ? previewText(m) : 'Sem mensagens'}</span>
          </span>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-badge px-1.5 text-[12px] font-medium text-white dark:text-[#111b21]">{unread}</span>
          )}
        </div>
      </div>
    </button>
  );
});

export default function Sidebar({ onForensic, onFiles, dragging, uploading, chats, selectedId, onSelect, meOf, unreadOf, theme, onToggleTheme, onReload, reloading, resources }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = chats.filter((c) => c.archived).length;
  const list = useMemo(() => {
    const fq = fold(q.trim());
    return chats.filter((c) => {
      if (!fq && !!c.archived !== showArchived) return false;
      if (filter === 'groups' && !c.isGroup) return false;
      if (filter === 'unread' && !unreadOf(c)) return false;
      if (fq && !fold(c.name).includes(fq) && !fold(c.last?.text).includes(fq)) return false;
      return true;
    });
  }, [chats, q, filter, showArchived, unreadOf]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-panel">
      {/* cabeçalho */}
      <header className="flex h-[59px] shrink-0 items-center justify-between px-4">
        {showArchived ? (
          <div className="flex items-center gap-6">
            <button onClick={() => setShowArchived(false)} className="text-icon">
              <ArrowLeft size={22} />
            </button>
            <span className="text-[16px] font-medium">Arquivadas</span>
          </div>
        ) : (
          <h1 className="text-[22px] font-bold text-fg">Conversas</h1>
        )}
        <div className="flex items-center gap-1 text-icon">
          <button onClick={onForensic} className="rounded-full p-2 hover:bg-black/5 lg:hidden dark:hover:bg-white/5" title="Busca forense (regex)">
            <RBadge size={19} />
          </button>
          <button onClick={onReload} className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/5" title="Recarregar a pasta de dados">
            <RefreshCw size={19} className={reloading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onToggleTheme} className="rounded-full p-2 hover:bg-black/5 lg:hidden dark:hover:bg-white/5" title="Alternar tema">
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>

      {/* busca */}
      <div className="px-3 pb-2">
        <div className="flex h-[35px] items-center gap-3 rounded-lg bg-search px-3">
          <Search size={16} className="shrink-0 text-fg2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar ou começar uma nova conversa"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg2"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-fg2">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* filtros */}
      <div className="flex gap-2 px-3 pb-2">
        {[
          ['all', 'Tudo'],
          ['unread', 'Não lidas'],
          ['groups', 'Grupos'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-[5px] text-[14px] ${filter === k ? 'bg-pill text-pill-fg' : 'bg-search text-fg2 hover:bg-active'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* lista */}
      <div className="wa-scroll min-h-0 flex-1 overflow-y-auto">
        {!showArchived && archivedCount > 0 && !q && (
          <button onClick={() => setShowArchived(true)} className="flex h-[49px] w-full items-center gap-6 px-[25px] text-left hover:bg-hover">
            <Archive size={19} className="text-wa" />
            <span className="flex-1 text-[16px]">Arquivadas</span>
            <span className="pr-1 text-[12px] text-wa">{archivedCount}</span>
          </button>
        )}
        {list.map((c) => (
          <ChatItem key={c.id} chat={c} me={meOf(c)} active={c.id === selectedId} unread={unreadOf(c)} onSelect={onSelect} />
        ))}
        {!list.length && chats.length > 0 && <div className="px-8 py-10 text-center text-[14px] text-fg2">Nenhuma conversa encontrada.</div>}
        {!chats.length ? (
          <>
            <DropArea onFiles={onFiles} dragging={dragging} busy={uploading} />
            <div className="px-8 pb-4 text-center text-[12px] leading-[17px] text-fg3">
              Os arquivos são copiados para <code className="rounded bg-search px-1 break-all">{resources}</code>. Você também pode colocá-los lá manualmente e clicar em recarregar.
            </div>
          </>
        ) : (
          !q && !showArchived && <DropArea onFiles={onFiles} dragging={dragging} busy={uploading} compact />
        )}
        <div className="flex items-center justify-center gap-1.5 py-6 text-[12px] text-fg3">
          <Lock size={11} /> Suas mensagens pessoais ficam somente neste computador
        </div>
      </div>
    </div>
  );
}

export function Rail({ theme, onToggleTheme, chatsCount, mode, onMode }) {
  const item = (active) => `relative flex h-10 w-10 items-center justify-center rounded-full text-icon ${active ? 'bg-black/10 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}`;
  return (
    <nav className="flex w-[64px] shrink-0 flex-col items-center justify-between border-r border-divider bg-rail py-3 max-lg:hidden">
      <div className="flex flex-col items-center gap-2">
        <button onClick={() => onMode('chats')} className={item(mode === 'chats')} title={`Conversas (${chatsCount})`}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16v11H9l-5 4z" />
            <path d="M8 9h8M8 12h5" />
          </svg>
        </button>
        <button onClick={() => onMode('forensic')} className={`${item(mode === 'forensic')} ${mode === 'forensic' ? 'text-wa' : ''}`} title="Busca forense (regex)">
          <RBadge size={22} active={mode === 'forensic'} />
        </button>
      </div>
      <button onClick={onToggleTheme} className="flex h-10 w-10 items-center justify-center rounded-full text-icon hover:bg-black/5 dark:hover:bg-white/5" title="Alternar tema claro/escuro">
        {theme === 'dark' ? <Sun size={21} /> : <Moon size={21} />}
      </button>
    </nav>
  );
}
