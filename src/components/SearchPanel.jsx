import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Search, X } from 'lucide-react';
import { PanelShell } from './InfoPanel.jsx';
import { api } from '../lib/api.js';
import { dateDMY, timeHM } from '../lib/format.js';

export default function SearchPanel({ chat, me, onClose, onJump, onQuery }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const input = useRef(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    setQ('');
    setResults(null);
  }, [chat.id]);

  useEffect(() => {
    onQuery(q.trim());
    if (!q.trim()) {
      setResults(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.search(chat.id, q.trim());
        if (!cancel) setResults(r.results);
      } finally {
        if (!cancel) setLoading(false);
      }
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, chat.id]);

  return (
    <PanelShell title="Pesquisar mensagens" onClose={onClose}>
      <div className="sticky top-0 z-10 bg-panel px-3 py-2">
        <div className="flex h-[35px] items-center gap-3 rounded-lg bg-search px-3">
          {loading ? <LoaderCircle size={16} className="animate-spin text-fg2" /> : <Search size={16} className="text-fg2" />}
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar..." className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg2" />
          {q && (
            <button onClick={() => setQ('')} className="text-fg2">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-full bg-panel">
        {!results && <div className="px-10 py-14 text-center text-[14px] text-fg2">Pesquisar mensagens com {chat.name}.</div>}
        {results && !results.length && <div className="px-10 py-14 text-center text-[14px] text-fg2">Nenhuma mensagem encontrada.</div>}
        {results?.map((r) => (
          <button key={r.i} onClick={() => onJump(r.i)} className="block w-full border-b border-divider px-5 py-3 text-left hover:bg-hover">
            <div className="text-[13px] text-fg2">
              {dateDMY(r.t)} {timeHM(r.t)}
            </div>
            <div className="mt-1 line-clamp-2 text-[14.5px] text-fg">
              {r.a && !(r.a === me) && <span className="text-fg2">{r.a}: </span>}
              {r.snippet.slice(0, r.pos)}
              <mark className="rounded-sm bg-transparent font-semibold text-wa">{r.snippet.slice(r.pos, r.pos + r.len)}</mark>
              {r.snippet.slice(r.pos + r.len)}
            </div>
          </button>
        ))}
        {results?.length >= 300 && <div className="py-4 text-center text-[12px] text-fg3">Mostrando os 300 resultados mais recentes</div>}
      </div>
    </PanelShell>
  );
}
