import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import Sidebar, { Rail } from './components/Sidebar.jsx';
import ChatView from './components/ChatView.jsx';
import InfoPanel from './components/InfoPanel.jsx';
import SearchPanel from './components/SearchPanel.jsx';
import Lightbox from './components/Lightbox.jsx';
import ForensicPanel from './components/ForensicPanel.jsx';
import { DropOverlay, UploadToast } from './components/DropZone.jsx';
import { filesFromDrop, uploadFiles } from './lib/upload.js';
import { api } from './lib/api.js';

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

export default function App() {
  const [chats, setChats] = useState([]);
  const [resources, setResources] = useState('');
  const [error, setError] = useState(null);
  const [reloading, setReloading] = useState(false);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(location.search).get('chat') || store.get('wa-selected', null));
  const [theme, setTheme] = useState(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const [panel, setPanel] = useState(null); // 'info' | 'search' | null
  const [meMap, setMeMap] = useState(() => store.get('wa-me', {}));
  const [opened, setOpened] = useState({}); // conversas abertas nesta sessão (zera "não lidas")
  const [gallery, setGallery] = useState(null);
  const [lightbox, setLightbox] = useState(null); // {items, index}
  const [jump, setJump] = useState(null);
  const [highlight, setHighlight] = useState('');
  const [leftMode, setLeftMode] = useState(() => (new URLSearchParams(location.search).get('tool') === 'forensic' ? 'forensic' : 'chats')); // 'chats' | 'forensic'
  const [forensicHL, setForensicHL] = useState(null); // {chatId, values}

  const loadChats = useCallback(async (reload = false) => {
    setReloading(true);
    try {
      const r = await api.chats(reload);
      setChats(r.chats);
      setResources(r.resources);
      setError(null);
      return r.chats.length;
    } catch (e) {
      setError(e.message);
    } finally {
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // ---------- arrastar e soltar arquivos de conversa ----------
  const [dragging, setDragging] = useState(false);
  const [upProgress, setUpProgress] = useState(null);
  const [upResult, setUpResult] = useState(null);
  const uploading = !!upProgress;

  const handleFiles = useCallback(
    async (items) => {
      if (!items.length || uploading) return;
      setUpResult(null);
      setUpProgress({ done: 0, total: items.length, bytes: 0, totalBytes: items.reduce((n, i) => n + i.file.size, 0), current: '' });
      const before = chats.length;
      const result = await uploadFiles(items, setUpProgress);
      const after = await loadChats(true);
      setUpProgress(null);
      setUpResult({ ...result, chatsAdded: after != null ? after - before : null });
      if (!result.failed.length) setTimeout(() => setUpResult((r) => (r === null ? r : null)), 9000);
    },
    [chats.length, loadChats, uploading],
  );

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    const enter = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const items = await filesFromDrop(e.dataTransfer);
      handleFiles(items);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [handleFiles]);

  // link direto: ?chat=<id>&msg=<índice>
  useEffect(() => {
    const msg = new URLSearchParams(location.search).get('msg');
    if (msg != null && chats.length) setJump({ i: +msg, n: 0 });
  }, [chats.length]);

  const chat = useMemo(() => chats.find((c) => c.id === selectedId) || null, [chats, selectedId]);

  useEffect(() => {
    store.set('wa-selected', selectedId);
    setGallery(null);
    if (!selectedId) return;
    let cancel = false;
    api.gallery(selectedId).then((g) => !cancel && setGallery(g)).catch(() => {});
    return () => {
      cancel = true;
    };
  }, [selectedId]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    store.set('wa-theme', next);
  };

  const meOf = useCallback((c) => (c.meKnown ? null : c.id in meMap ? meMap[c.id] : c.meGuess), [meMap]);
  const unreadOf = useCallback((c) => (opened[c.id] ? 0 : c.unread || 0), [opened]);

  const select = useCallback((id) => {
    setSelectedId(id);
    setOpened((o) => ({ ...o, [id]: true }));
    setPanel((p) => (p === 'search' ? null : p));
    setJump(null);
    setHighlight('');
    setForensicHL(null);
  }, []);

  // resultado da busca forense: abre a conversa já rolada até a mensagem, com o valor destacado
  const openForensicResult = useCallback((r) => {
    setSelectedId(r.chatId);
    setOpened((o) => ({ ...o, [r.chatId]: true }));
    setPanel((p) => (p === 'search' ? null : p));
    setHighlight('');
    setForensicHL({ chatId: r.chatId, values: r.values });
    setJump({ i: r.i, n: Date.now() });
  }, []);

  const setMe = (name) => {
    const next = { ...meMap, [chat.id]: name };
    setMeMap(next);
    store.set('wa-me', next);
  };

  const openMedia = useCallback(
    (m) => {
      const items = gallery?.media || [];
      const idx = items.findIndex((g) => g.i === m.i);
      if (idx >= 0) setLightbox({ items, index: idx });
      else if (m.media?.rel) setLightbox({ items: [m], index: 0 });
    },
    [gallery],
  );

  const jumpTo = useCallback((i) => {
    setLightbox(null);
    setJump({ i, n: Date.now() });
    if (window.innerWidth < 1280) setPanel(null);
  }, []);

  const me = chat ? meOf(chat) : null;
  const totalMsgs = chats.reduce((n, c) => n + c.total, 0);

  return (
    <div className="flex h-full overflow-hidden bg-app">
      <Rail theme={theme} onToggleTheme={toggleTheme} chatsCount={chats.length} mode={leftMode} onMode={setLeftMode} />

      {/* barra lateral */}
      <div className={`flex h-full w-[30%] max-w-[500px] min-w-[340px] border-r border-divider max-lg:w-[40%] max-md:w-full max-md:max-w-none max-md:min-w-0 ${chat ? 'max-md:hidden' : ''}`}>
        {leftMode === 'forensic' ? (
          <ForensicPanel chats={chats} currentChatId={selectedId} onOpenResult={openForensicResult} onClose={() => setLeftMode('chats')} />
        ) : (
        <Sidebar
          onForensic={() => setLeftMode('forensic')}
          onFiles={handleFiles}
          dragging={dragging}
          uploading={uploading}
          chats={chats}
          selectedId={selectedId}
          onSelect={select}
          meOf={meOf}
          unreadOf={unreadOf}
          theme={theme}
          onToggleTheme={toggleTheme}
          onReload={() => loadChats(true)}
          reloading={reloading}
          resources={resources}
        />
        )}
      </div>

      {/* conversa */}
      <main className={`relative flex h-full min-w-0 flex-1 ${chat ? '' : 'max-md:hidden'}`}>
        {chat ? (
          <>
            <ChatView
              key={chat.id}
              chat={chat}
              me={me}
              jump={jump}
              highlight={panel === 'search' && highlight ? highlight : forensicHL?.chatId === chat.id ? forensicHL.values : ''}
              panelOpen={panel}
              onOpenInfo={() => setPanel((p) => (p === 'info' ? null : 'info'))}
              onOpenSearch={() => setPanel((p) => (p === 'search' ? null : 'search'))}
              onOpenMedia={openMedia}
              onBack={() => setSelectedId(null)}
            />
            {panel === 'info' && <InfoPanel chat={chat} me={me} onSetMe={setMe} onClose={() => setPanel(null)} onOpenMedia={openMedia} onJump={jumpTo} gallery={gallery} />}
            {panel === 'search' && <SearchPanel chat={chat} me={me} onClose={() => (setPanel(null), setHighlight(''))} onJump={jumpTo} onQuery={setHighlight} />}
          </>
        ) : (
          <Welcome chats={chats.length} messages={totalMsgs} error={error} />
        )}
      </main>

      {dragging && <DropOverlay />}
      <UploadToast progress={upProgress} result={upResult} onClose={() => setUpResult(null)} />

      {lightbox && chat && (
        <Lightbox chat={chat} items={lightbox.items} index={lightbox.index} onIndex={(index) => setLightbox((l) => ({ ...l, index }))} onClose={() => setLightbox(null)} onJump={jumpTo} />
      )}
    </div>
  );
}

function Welcome({ chats, messages, error }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center border-b-[6px] border-wa bg-header px-10 text-center">
      <svg viewBox="0 0 320 190" width="320" className="max-w-full" aria-hidden>
        <rect x="40" y="20" width="200" height="130" rx="10" fill="var(--panel)" stroke="var(--divider)" strokeWidth="3" />
        <rect x="52" y="32" width="176" height="106" rx="4" fill="var(--chat-bg)" />
        <rect x="62" y="44" width="80" height="16" rx="6" fill="var(--in)" />
        <rect x="128" y="68" width="88" height="16" rx="6" fill="var(--out)" />
        <rect x="62" y="92" width="110" height="16" rx="6" fill="var(--in)" />
        <rect x="150" y="116" width="66" height="14" rx="6" fill="var(--out)" />
        <path d="M20 150h240l-14 16H34z" fill="var(--divider)" />
        <rect x="236" y="60" width="64" height="112" rx="10" fill="var(--panel)" stroke="var(--divider)" strokeWidth="3" />
        <circle cx="268" cy="96" r="16" fill="var(--green)" />
        <path d="M261 96l5 5 9-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="248" y="124" width="40" height="6" rx="3" fill="var(--divider)" />
        <rect x="254" y="136" width="28" height="6" rx="3" fill="var(--divider)" />
      </svg>
      <h2 className="mt-8 text-[32px] font-light text-fg">Visualizador de WhatsApp</h2>
      <p className="mt-4 max-w-[460px] text-[14px] leading-[20px] text-fg2">
        {error ? (
          <span className="text-[#ea0038]">Não foi possível falar com o servidor ({error}). Ele está rodando?</span>
        ) : (
          <>
            Selecione uma conversa para ver as mensagens, fotos, áudios e documentos do seu backup.
            <br />
            {chats > 0 && `${chats} conversas · ${messages.toLocaleString('pt-BR')} mensagens carregadas.`}
          </>
        )}
      </p>
      <div className="mt-16 flex items-center gap-1.5 text-[13px] text-fg3">
        <Lock size={12} /> Tudo é processado localmente, nada é enviado para a internet
      </div>
    </div>
  );
}
