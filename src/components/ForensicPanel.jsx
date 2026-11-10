import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CaseSensitive, Download, LoaderCircle, Regex, Search, ShieldCheck, X, Users, User, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api.js';
import { dateDMY, timeHM } from '../lib/format.js';

export function RBadge({ size = 22, active = false }) {
  return (
    <span
      className={`flex items-center justify-center rounded-[6px] font-black leading-none ${active ? 'bg-wa text-white' : 'border-2 border-current'}`}
      style={{ width: size, height: size, fontSize: size * 0.62, fontFamily: 'Georgia, "Times New Roman", serif' }}
    >
      R
    </span>
  );
}

const PAGE = 150;

function Snippet({ r }) {
  const out = [];
  let pos = 0;
  r.marks.forEach(([s, l], k) => {
    if (s < pos) return;
    if (s > pos) out.push(r.snippet.slice(pos, s));
    out.push(
      <mark key={k} className="rounded-sm bg-[#ffd279] px-[1px] font-medium text-[#111b21]">
        {r.snippet.slice(s, s + l)}
      </mark>,
    );
    pos = s + l;
  });
  out.push(r.snippet.slice(pos));
  return out;
}

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Conversa', 'Data', 'Hora', 'Horário aproximado', 'Autor', 'Valores encontrados', 'Trecho', 'Índice da mensagem'];
  const lines = rows.map((r) =>
    [r.chatName, dateDMY(r.t), timeHM(r.t), r.approx ? 'sim' : 'não', r.fromMe ? 'Você' : r.a || '', r.values.join(' | '), r.snippet, r.i].map(esc).join(';'),
  );
  return '﻿' + [head.map(esc).join(';'), ...lines].join('\r\n');
}

export default function ForensicPanel({ chats, currentChatId, onOpenResult, onClose }) {
  const [presets, setPresets] = useState([]);
  const [active, setActive] = useState(null); // id do filtro ou 'custom'
  const [q, setQ] = useState('');
  const [regexMode, setRegexMode] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [validate, setValidate] = useState(true);
  const [scope, setScope] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('hits');
  const [valueFilter, setValueFilter] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState(null);
  const req = useRef(0);

  useEffect(() => {
    api
      .presets()
      .then((p) => {
        setPresets(p);
        const initial = new URLSearchParams(location.search).get('preset');
        if (initial && p.some((x) => x.id === initial)) runPresetRef.current?.(initial);
      })
      .catch(() => {});
  }, []);
  const runPresetRef = useRef(null);

  const run = async (params, id, label) => {
    const n = ++req.current;
    setActive(id);
    setLoading(true);
    setError(null);
    setValueFilter(null);
    setShown(PAGE);
    setTab('hits');
    try {
      const r = await api.forensic({ ...params, ...(scope ? { chat: scope } : {}) });
      if (n === req.current) setData({ ...r, label });
    } catch (e) {
      if (n === req.current) {
        setError(e.message);
        setData(null);
      }
    } finally {
      if (n === req.current) setLoading(false);
    }
  };

  const PRESET_LABELS = { cpf: 'CPF', cnpj: 'CNPJ', phone: 'Telefone', rg: 'RG', date: 'Datas', email: 'E-mail', money: 'Valores R$' };
  const runPreset = (id) => run({ preset: id, validate: validate ? '1' : '0' }, id, presets.find((p) => p.id === id)?.label || PRESET_LABELS[id] || id);
  runPresetRef.current = runPreset;
  const runCustom = () => q.trim() && run({ q, mode: regexMode ? 'regex' : 'text', cs: caseSensitive ? '1' : '0' }, 'custom', regexMode ? `/${q}/` : `"${q.trim()}"`);

  // refaz a busca quando muda o escopo ou a validação
  useEffect(() => {
    if (!active) return;
    if (active === 'custom') runCustom();
    else runPreset(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, validate]);

  const hits = useMemo(() => {
    if (!data) return [];
    return valueFilter ? data.results.filter((r) => r.keys.includes(valueFilter.key)) : data.results;
  }, [data, valueFilter]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(hits)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `busca-forense-${(data.label || 'resultado').replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const activePreset = presets.find((p) => p.id === active);
  const sortedChats = useMemo(() => [...chats].sort((a, b) => a.name.localeCompare(b.name, 'pt')), [chats]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-panel">
      <header className="flex h-[59px] shrink-0 items-center gap-4 px-4">
        <button onClick={onClose} className="text-icon" title="Voltar para as conversas">
          <ArrowLeft size={22} />
        </button>
        <div className="flex items-center gap-2 text-wa">
          <RBadge size={24} active />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] leading-tight font-bold text-fg">Busca forense</h1>
          <div className="text-[12px] text-fg2">Expressões regulares em todas as mensagens</div>
        </div>
      </header>

      {/* filtros rápidos */}
      <div className="px-3 pb-2">
        <div className="mb-1.5 px-1 text-[12px] font-medium tracking-wide text-wa uppercase">Filtros rápidos</div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => runPreset(p.id)}
              title={`${p.hint}\n\nRegex: ${p.source}`}
              className={`rounded-full px-3 py-[5px] text-[14px] transition ${active === p.id ? 'bg-pill text-pill-fg ring-1 ring-wa/40' : 'bg-search text-fg2 hover:bg-active'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* termo customizado */}
      <div className="px-3 pb-2">
        <div className={`flex h-[38px] items-center gap-2 rounded-lg bg-search pr-1 pl-3 ${active === 'custom' ? 'ring-1 ring-wa/50' : ''}`}>
          {regexMode ? <Regex size={16} className="shrink-0 text-wa" /> : <Search size={16} className="shrink-0 text-fg2" />}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runCustom()}
            placeholder={regexMode ? 'Expressão regular, ex.: senha|pix\\s*\\d+' : 'Palavra-chave ou termo'}
            spellCheck={false}
            className={`min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg2 ${regexMode ? 'font-mono text-[13px]' : ''}`}
          />
          {q && (
            <button onClick={() => setQ('')} className="text-fg2" title="Limpar">
              <X size={15} />
            </button>
          )}
          <button
            onClick={() => setRegexMode((v) => !v)}
            title="Usar expressão regular (sintaxe JavaScript)"
            className={`rounded px-1.5 py-1 font-mono text-[12px] font-bold ${regexMode ? 'bg-wa text-white' : 'text-fg2 hover:bg-active'}`}
          >
            .*
          </button>
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            title="Diferenciar maiúsculas e minúsculas"
            className={`rounded p-1 ${caseSensitive ? 'bg-wa text-white' : 'text-fg2 hover:bg-active'}`}
          >
            <CaseSensitive size={18} />
          </button>
          <button onClick={runCustom} disabled={!q.trim()} className="rounded-md bg-wa px-3 py-1 text-[13px] font-medium text-white disabled:opacity-40">
            Buscar
          </button>
        </div>
      </div>

      {/* opções */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-divider px-4 pb-2.5 text-[13px] text-fg2">
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="max-w-[230px] min-w-0 rounded-md border border-divider bg-panel px-2 py-1 text-[13px] text-fg outline-none">
          <option value="">Todas as conversas ({chats.length})</option>
          {currentChatId && <option value={currentChatId}>Somente a conversa aberta</option>}
          <optgroup label="Conversa específica">
            {sortedChats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </select>
        <label className={`flex cursor-pointer items-center gap-1.5 ${activePreset?.validate ? '' : 'opacity-50'}`} title="Descarta CPF/CNPJ com dígito verificador inválido, telefones com DDD inexistente e datas impossíveis">
          <input type="checkbox" checked={validate} onChange={(e) => setValidate(e.target.checked)} className="accent-[var(--green)]" />
          <ShieldCheck size={14} /> Validar dígitos
        </label>
      </div>

      {/* status */}
      {(data || loading || error) && (
        <div className="border-b border-divider px-4 py-2 text-[12.5px]">
          {loading ? (
            <span className="flex items-center gap-2 text-fg2">
              <LoaderCircle size={14} className="animate-spin" /> Varrendo mensagens…
            </span>
          ) : error ? (
            <span className="flex items-start gap-2 text-[#ea0038]">
              <TriangleAlert size={14} className="mt-[2px] shrink-0" /> {error}
            </span>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-fg2">
                <b className="text-fg">{data.totalMatches.toLocaleString('pt-BR')}</b> ocorrências de <b className="text-fg">{data.label}</b> em{' '}
                {data.totalMessages.toLocaleString('pt-BR')} mensagens · {data.chatCount} conversas · {data.ms} ms
              </span>
              {hits.length > 0 && (
                <button onClick={exportCsv} className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-wa hover:bg-hover" title="Exportar resultados para CSV (Excel)">
                  <Download size={14} /> CSV
                </button>
              )}
            </div>
          )}
          {data?.truncated && !loading && <div className="mt-0.5 text-[11.5px] text-fg3">Lista limitada às primeiras {data.results.length.toLocaleString('pt-BR')} mensagens; refine a busca ou escolha uma conversa.</div>}
        </div>
      )}

      {/* abas */}
      {data && !loading && data.totalMatches > 0 && (
        <div className="flex shrink-0 border-b border-divider">
          {[
            ['hits', `Ocorrências (${(valueFilter ? hits.length : data.totalMessages).toLocaleString('pt-BR')})`],
            ['uniques', `Valores únicos (${data.uniques.length.toLocaleString('pt-BR')})`],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 border-b-[3px] py-2.5 text-[13.5px] ${tab === k ? 'border-wa text-wa' : 'border-transparent text-fg2 hover:text-fg'}`}>
              {l}
            </button>
          ))}
        </div>
      )}

      <div className="wa-scroll min-h-0 flex-1 overflow-y-auto">
        {!data && !loading && !error && (
          <div className="px-8 py-10 text-center text-[13.5px] leading-[20px] text-fg2">
            Escolha um filtro rápido ou digite um termo para varrer <b>todas</b> as conversas carregadas.
            <br />
            <br />
            Clique num resultado para abrir a conversa exatamente na mensagem, com o trecho destacado.
          </div>
        )}

        {data && !loading && data.totalMatches === 0 && <div className="px-8 py-12 text-center text-[14px] text-fg2">Nenhuma ocorrência encontrada.</div>}

        {data && !loading && tab === 'hits' && (
          <>
            {valueFilter && (
              <div className="flex items-center gap-2 bg-hover px-4 py-2 text-[13px] text-fg2">
                Filtrando por <span className="rounded bg-[#ffd279] px-1.5 font-mono text-[#111b21]">{valueFilter.value}</span>
                <button onClick={() => setValueFilter(null)} className="ml-auto text-fg2 hover:text-fg" title="Remover filtro">
                  <X size={16} />
                </button>
              </div>
            )}
            {hits.slice(0, shown).map((r) => {
              const id = `${r.chatId}:${r.i}`;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setSelected(id);
                    onOpenResult(r);
                  }}
                  className={`block w-full border-b border-divider px-4 py-2.5 text-left ${selected === id ? 'bg-active' : 'hover:bg-hover'}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[14.5px] text-fg">
                      {r.isGroup ? <Users size={13} className="shrink-0 text-fg3" /> : <User size={13} className="shrink-0 text-fg3" />}
                      <span className="truncate">{r.chatName}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-fg2" title={r.approx ? 'Horário aproximado' : ''}>
                      {dateDMY(r.t)} {r.approx ? '~' : ''}
                      {timeHM(r.t)}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[13.5px] leading-[19px] break-words text-fg2">
                    <span className="text-fg">{r.fromMe ? 'Você' : r.a || 'Sistema'}: </span>
                    <Snippet r={r} />
                  </div>
                </button>
              );
            })}
            {hits.length > shown && (
              <button onClick={() => setShown((n) => n + PAGE)} className="w-full py-3 text-[13.5px] font-medium text-wa hover:bg-hover">
                Mostrar mais ({(hits.length - shown).toLocaleString('pt-BR')} restantes)
              </button>
            )}
          </>
        )}

        {data && !loading && tab === 'uniques' && (
          <div>
            {data.uniques.map((u) => (
              <button
                key={u.key}
                onClick={() => {
                  setValueFilter(u);
                  setTab('hits');
                  setShown(PAGE);
                }}
                className="flex w-full items-center gap-3 border-b border-divider px-4 py-2.5 text-left hover:bg-hover"
                title="Ver as mensagens com este valor"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-fg">{u.value}</span>
                <span className="shrink-0 text-[12px] text-fg2">
                  {u.chats} {u.chats === 1 ? 'conversa' : 'conversas'}
                </span>
                <span className="flex h-5 min-w-6 shrink-0 items-center justify-center rounded-full bg-pill px-1.5 text-[12px] font-medium text-pill-fg">{u.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
