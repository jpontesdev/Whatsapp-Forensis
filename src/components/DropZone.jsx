import { useRef } from 'react';
import { CircleCheck, FilePlus2, FolderUp, LoaderCircle, TriangleAlert, Upload, X } from 'lucide-react';
import { fileSize } from '../lib/format.js';
import { filesFromInput } from '../lib/upload.js';

/** Região tracejada para soltar/selecionar arquivos de conversa. */
export function DropArea({ onFiles, dragging, compact = false, busy = false }) {
  const filesInput = useRef(null);
  const dirInput = useRef(null);
  const pick = (e) => {
    const items = filesFromInput(e.target.files);
    e.target.value = '';
    if (items.length) onFiles(items);
  };

  return (
    <div
      onClick={() => !busy && filesInput.current?.click()}
      className={`group cursor-pointer rounded-xl border-2 border-dashed text-center transition ${
        dragging ? 'border-wa bg-pill' : 'border-fg3/40 hover:border-wa hover:bg-hover'
      } ${compact ? 'mx-3 my-3 px-3 py-3' : 'mx-4 my-4 px-5 py-8'} ${busy ? 'pointer-events-none opacity-60' : ''}`}
      title="Clique para escolher arquivos ou arraste-os para cá"
    >
      <input ref={filesInput} type="file" multiple hidden onChange={pick} accept=".sqlite,.db,.txt,.zip,.opus,.aac,.ogg,.mp3,.m4a,.wav,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.3gp,.pdf,.vcf,*/*" />
      <input ref={dirInput} type="file" hidden webkitdirectory="" directory="" onChange={pick} />
      {compact ? (
        <div className="flex items-center justify-center gap-2 text-[13px] text-fg2">
          <Upload size={16} className={dragging ? 'text-wa' : ''} />
          <span>
            Arraste conversas aqui ou{' '}
            <span className="text-wa group-hover:underline">escolha arquivos</span>
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dirInput.current?.click();
            }}
            className="ml-1 rounded p-1 text-fg2 hover:bg-active hover:text-wa"
            title="Enviar uma pasta inteira (ex.: backup com Media/)"
          >
            <FolderUp size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${dragging ? 'bg-wa text-white' : 'bg-search text-wa'}`}>
            <Upload size={26} />
          </div>
          <div className="mt-3 text-[15px] font-medium text-fg">{dragging ? 'Solte para adicionar' : 'Arraste os arquivos de conversa para cá'}</div>
          <div className="mt-1.5 text-[12.5px] leading-[18px] text-fg2">
            iPhone: <b>ChatStorage.sqlite</b> + pasta <b>Media</b>
            <br />
            Exportações: <b>.txt</b> com as mídias, ou <b>.zip</b>
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-wa px-3.5 py-1.5 text-[13px] font-medium text-white">
              <FilePlus2 size={15} /> Escolher arquivos
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dirInput.current?.click();
              }}
              className="flex items-center gap-1.5 rounded-full border border-wa px-3.5 py-1.5 text-[13px] font-medium text-wa hover:bg-pill"
            >
              <FolderUp size={15} /> Escolher pasta
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Sobreposição exibida ao arrastar arquivos sobre a janela. */
export function DropOverlay() {
  return (
    <div className="fade-in pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-6">
      <div className="flex w-full max-w-[520px] flex-col items-center rounded-2xl border-[3px] border-dashed border-wa bg-panel px-8 py-12 text-center shadow-2xl">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-wa text-white">
          <Upload size={32} />
        </div>
        <div className="mt-4 text-[20px] font-medium text-fg">Solte para adicionar ao visualizador</div>
        <div className="mt-2 text-[13.5px] text-fg2">Arquivos e pastas são copiados para a pasta de dados, mantendo a estrutura (ex.: Media/).</div>
      </div>
    </div>
  );
}

/** Aviso com o progresso do envio, no canto inferior. */
export function UploadToast({ progress, result, onClose }) {
  if (!progress && !result) return null;
  const pct = progress ? Math.round((progress.bytes / Math.max(1, progress.totalBytes)) * 100) : 100;
  return (
    <div className="fade-in fixed bottom-5 left-5 z-[55] w-[360px] max-w-[calc(100vw-40px)] rounded-xl bg-panel p-4 shadow-2xl ring-1 ring-divider">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {result ? (
            result.failed.length ? <TriangleAlert size={20} className="text-[#e8a33d]" /> : <CircleCheck size={20} className="text-wa" />
          ) : (
            <LoaderCircle size={20} className="animate-spin text-wa" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {result ? (
            <>
              <div className="text-[14.5px] font-medium text-fg">Arquivos adicionados</div>
              <div className="mt-0.5 text-[13px] text-fg2">
                {result.sent} enviados{result.skipped ? ` · ${result.skipped} já existiam` : ''}
                {result.failed.length ? ` · ${result.failed.length} com erro` : ''}
                {result.chatsAdded != null && ` · ${result.chatsAdded >= 0 ? '+' : ''}${result.chatsAdded} conversas`}
              </div>
              {result.failed.slice(0, 3).map((f) => (
                <div key={f.path} className="mt-1 truncate text-[12px] text-[#ea0038]" title={f.error}>
                  {f.path}: {f.error}
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="flex justify-between text-[14.5px] font-medium text-fg">
                <span>Enviando arquivos…</span>
                <span className="text-wa">{pct}%</span>
              </div>
              <div className="mt-0.5 text-[12.5px] text-fg2">
                {progress.done} de {progress.total} · {fileSize(progress.bytes)} de {fileSize(progress.totalBytes)}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-search">
                <div className="h-full rounded-full bg-wa transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 truncate text-[11.5px] text-fg3">{progress.current}</div>
            </>
          )}
        </div>
        {result && (
          <button onClick={onClose} className="text-fg2 hover:text-fg" title="Fechar">
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
