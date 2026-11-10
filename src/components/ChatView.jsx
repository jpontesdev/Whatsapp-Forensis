import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, EllipsisVertical, LoaderCircle, Lock, Mic, Plus, Search, Smile } from 'lucide-react';
import Avatar from './Avatar.jsx';
import Message, { SystemMessage } from './Message.jsx';
import { api } from '../lib/api.js';
import { dayLabel, isMine } from '../lib/format.js';

const PAGE = 250;

export default function ChatView({ chat, me, jump, highlight, onOpenInfo, onOpenSearch, onOpenMedia, onBack, panelOpen }) {
  const [state, setState] = useState({ msgs: [], start: 0, end: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [flashI, setFlashI] = useState(null);
  const [showDown, setShowDown] = useState(false);
  const scroller = useRef(null);
  const content = useRef(null);
  const stick = useRef(true); // grudado no fim
  const anchor = useRef(null); // {i, offset} para preservar a posição
  const busy = useRef(false);
  const pendingScroll = useRef(null); // 'bottom' | {i}
  const reqId = useRef(0);

  const load = useCallback(
    async (params, mode) => {
      const id = ++reqId.current;
      busy.current = true;
      if (mode !== 'older' && mode !== 'newer') setLoading(true);
      try {
        const r = await api.messages(chat.id, { limit: PAGE, ...params });
        if (id !== reqId.current) return;
        setState((s) => {
          if (mode === 'older') return { msgs: [...r.messages, ...s.msgs], start: r.start, end: s.end, total: r.total };
          if (mode === 'newer') return { msgs: [...s.msgs, ...r.messages], start: s.start, end: r.end, total: r.total };
          return { msgs: r.messages, start: r.start, end: r.end, total: r.total };
        });
      } finally {
        if (id === reqId.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [chat.id],
  );

  // abrir conversa
  useEffect(() => {
    stick.current = true;
    anchor.current = null;
    pendingScroll.current = 'bottom';
    setState({ msgs: [], start: 0, end: 0, total: 0 });
    load({}, 'reset');
  }, [chat.id, load]);

  // pular para uma mensagem (busca, painel de mídia)
  useEffect(() => {
    if (!jump) return;
    const inWindow = state.msgs.length && jump.i >= state.start && jump.i < state.end;
    stick.current = false;
    pendingScroll.current = { i: jump.i };
    if (inWindow) scrollToPending();
    else load({ around: jump.i }, 'reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump]);

  const captureAnchor = () => {
    const c = scroller.current;
    if (!c) return;
    const top = c.getBoundingClientRect().top;
    const nodes = c.querySelectorAll('[data-i]');
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (r.bottom > top) {
        anchor.current = { i: n.dataset.i, offset: r.top - top };
        return;
      }
    }
  };

  const restoreAnchor = () => {
    const c = scroller.current;
    const a = anchor.current;
    if (!c || !a) return;
    const el = c.querySelector(`[data-i="${a.i}"]`);
    if (!el) return;
    const delta = el.getBoundingClientRect().top - c.getBoundingClientRect().top - a.offset;
    if (Math.abs(delta) > 0.5) c.scrollTop += delta;
  };

  function scrollToPending() {
    const c = scroller.current;
    const p = pendingScroll.current;
    if (!c || !p || !c.querySelector('[data-i]')) return false;
    if (p === 'bottom') {
      c.scrollTop = c.scrollHeight;
      pendingScroll.current = null;
      return true;
    }
    const el = c.querySelector(`[data-i="${p.i}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    pendingScroll.current = null;
    setFlashI(p.i);
    setTimeout(() => setFlashI(null), 2100);
    captureAnchor();
    return true;
  }

  // depois de renderizar novas mensagens
  useLayoutEffect(() => {
    if (scrollToPending()) return;
    if (stick.current) scroller.current && (scroller.current.scrollTop = scroller.current.scrollHeight);
    else restoreAnchor();
  }, [state]);

  // imagens que carregam mudam a altura: mantém o fim ou a âncora
  useEffect(() => {
    if (!content.current) return;
    const ro = new ResizeObserver(() => {
      const c = scroller.current;
      if (!c) return;
      if (stick.current) c.scrollTop = c.scrollHeight;
      else restoreAnchor();
    });
    ro.observe(content.current);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const c = scroller.current;
    if (!c) return;
    const fromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
    stick.current = fromBottom < 30 && state.end >= state.total;
    setShowDown(fromBottom > 400 || state.end < state.total);
    captureAnchor();
    if (busy.current) return;
    if (c.scrollTop < 600 && state.start > 0) load({ before: state.start }, 'older');
    else if (fromBottom < 600 && state.end < state.total) load({ after: state.end }, 'newer');
  };

  const goBottom = () => {
    if (state.end < state.total) {
      stick.current = true;
      pendingScroll.current = 'bottom';
      load({}, 'reset');
    } else {
      const c = scroller.current;
      c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    }
  };

  // agrupa por dia
  const days = useMemo(() => {
    const out = [];
    for (const m of state.msgs) {
      const key = (m.t || '').slice(0, 10);
      if (!out.length || out.at(-1).key !== key) out.push({ key, t: m.t, msgs: [] });
      out.at(-1).msgs.push(m);
    }
    return out;
  }, [state.msgs]);

  const subtitle = chat.isGroup
    ? (chat.participants || [])
        .slice(0, 30)
        .concat(chat.meKnown || me ? ['Você'] : [])
        .filter((p) => p !== me)
        .join(', ')
    : chat.about || 'clique para mostrar os dados do contato';

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* cabeçalho */}
      <header className="z-10 flex h-[59px] shrink-0 items-center gap-3 border-l border-divider bg-header px-4">
        {onBack && (
          <button onClick={onBack} className="-ml-2 text-icon md:hidden" title="Voltar">
            <ArrowLeft size={22} />
          </button>
        )}
        <button onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar src={chat.avatar} group={chat.isGroup} size={40} />
          <div className="min-w-0">
            <div className="truncate text-[16px] leading-[21px] text-fg">{chat.name}</div>
            <div className="truncate text-[13px] leading-[20px] text-fg2">{subtitle}</div>
          </div>
        </button>
        <div className="flex items-center gap-1 text-icon">
          <button onClick={onOpenSearch} className={`rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/5 ${panelOpen === 'search' ? 'bg-black/10 dark:bg-white/10' : ''}`} title="Pesquisar mensagens">
            <Search size={20} />
          </button>
          <button onClick={onOpenInfo} className={`rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/5 ${panelOpen === 'info' ? 'bg-black/10 dark:bg-white/10' : ''}`} title="Dados da conversa">
            <EllipsisVertical size={20} />
          </button>
        </div>
      </header>

      {/* mensagens */}
      <div className="chat-wallpaper relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="wa-scroll absolute inset-0 overflow-y-auto" style={{ overflowAnchor: 'none' }}>
          <div ref={content} className="relative pb-3">
            {state.start === 0 && !loading && (
              <div className="flex justify-center px-[5%] pt-3">
                <div className="bubble-shadow flex max-w-[480px] items-start gap-1.5 rounded-[7.5px] bg-enc px-3 py-[5px] text-center text-[12.5px] leading-[17px] text-enc-fg">
                  <Lock size={12} className="mt-[2px] shrink-0" />
                  Visualização local e somente leitura. Nenhuma mensagem sai do seu computador.
                </div>
              </div>
            )}
            {state.start > 0 && (
              <div className="flex justify-center py-3 text-fg2">
                <LoaderCircle className="animate-spin" size={22} />
              </div>
            )}
            {days.map((d) => (
              <section key={d.key + d.msgs[0].i}>
                <div className="pointer-events-none sticky top-2 z-[5] mt-3 mb-1 flex justify-center">
                  <span className="bubble-shadow rounded-[7.5px] bg-chip px-3 py-[5px] text-[12.5px] text-chip-fg">{dayLabel(d.t)}</span>
                </div>
                {d.msgs.map((m, k) => {
                  if (m.type === 'system') return <SystemMessage key={m.i} m={m} />;
                  const prev = d.msgs[k - 1];
                  const mine = isMine(m, me);
                  const first = !prev || prev.type === 'system' || isMine(prev, me) !== mine || (!mine && prev.a !== m.a);
                  return (
                    <Message
                      key={m.i}
                      m={m}
                      mine={mine}
                      first={first}
                      isGroup={chat.isGroup}
                      chatId={chat.id}
                      onOpenMedia={onOpenMedia}
                      highlight={highlight}
                      flash={flashI === m.i}
                      senderAvatar={mine ? null : chat.isGroup ? null : chat.avatar}
                    />
                  );
                })}
              </section>
            ))}
            {state.end < state.total && (
              <div className="flex justify-center py-3 text-fg2">
                <LoaderCircle className="animate-spin" size={22} />
              </div>
            )}
          </div>
        </div>
        {loading && !state.msgs.length && (
          <div className="absolute inset-0 flex items-center justify-center text-fg2">
            <LoaderCircle className="animate-spin" size={32} />
          </div>
        )}
        {showDown && (
          <button
            onClick={goBottom}
            className="fade-in absolute right-5 bottom-4 z-10 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-chip text-icon shadow-md"
            title="Ir para a mensagem mais recente"
          >
            <ChevronDown size={24} />
          </button>
        )}
      </div>

      {/* barra de digitação (somente leitura) */}
      <footer className="flex min-h-[62px] shrink-0 items-center gap-2 bg-header px-4 py-[5px] text-icon">
        <Plus size={24} className="opacity-60" />
        <Smile size={24} className="opacity-60" />
        <div className="mx-2 flex h-[42px] flex-1 cursor-not-allowed items-center rounded-lg bg-panel px-3 text-[15px] text-fg3 select-none">
          Somente leitura: este é um visualizador de backup
        </div>
        <Mic size={24} className="opacity-60" />
      </footer>
    </div>
  );
}
