// Coleta arquivos (inclusive pastas inteiras) de um "drop" ou de um <input type=file> e envia ao servidor.

const IGNORE = /(^|\/)(\.|Thumbs\.db$|desktop\.ini$)/i;

function readAllEntries(dirReader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const next = () =>
      dirReader.readEntries((batch) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, path: prefix + file.name });
  } else if (entry.isDirectory) {
    const children = await readAllEntries(entry.createReader());
    for (const c of children) await walkEntry(c, `${prefix}${entry.name}/`, out);
  }
}

/** Arquivos de um evento de drop, preservando a estrutura das pastas soltas. */
export async function filesFromDrop(dataTransfer) {
  const out = [];
  const items = [...(dataTransfer.items || [])];
  const entries = items.map((it) => (it.kind === 'file' && it.webkitGetAsEntry ? it.webkitGetAsEntry() : null));
  if (entries.some(Boolean)) {
    for (const e of entries) if (e) await walkEntry(e, '', out);
  } else {
    for (const f of dataTransfer.files || []) out.push({ file: f, path: f.name });
  }
  return out.filter((f) => !IGNORE.test(f.path));
}

/** Arquivos de um <input type="file"> (com ou sem webkitdirectory). */
export function filesFromInput(fileList) {
  return [...fileList].map((f) => ({ file: f, path: f.webkitRelativePath || f.name })).filter((f) => !IGNORE.test(f.path));
}

/**
 * Envia os arquivos (4 em paralelo). onProgress({done, total, bytes, totalBytes, current})
 * Retorna {sent, skipped, failed: [{path, error}]}
 */
export async function uploadFiles(items, onProgress) {
  const totalBytes = items.reduce((n, it) => n + it.file.size, 0);
  const state = { done: 0, total: items.length, bytes: 0, totalBytes, current: '' };
  const result = { sent: 0, skipped: 0, failed: [] };
  const inflight = new Map();
  const report = () => onProgress?.({ ...state, bytes: state.bytes + [...inflight.values()].reduce((a, b) => a + b, 0) });

  const sendOne = (it) =>
    new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/upload?path=${encodeURIComponent(it.path)}`);
      xhr.upload.onprogress = (e) => {
        inflight.set(it, e.loaded);
        report();
      };
      xhr.onload = () => {
        inflight.delete(it);
        state.bytes += it.file.size;
        state.done++;
        if (xhr.status >= 200 && xhr.status < 300) {
          const r = JSON.parse(xhr.responseText || '{}');
          r.skipped ? result.skipped++ : result.sent++;
        } else {
          let msg = xhr.statusText;
          try {
            msg = JSON.parse(xhr.responseText).error || msg;
          } catch {}
          result.failed.push({ path: it.path, error: msg });
        }
        report();
        resolve();
      };
      xhr.onerror = () => {
        inflight.delete(it);
        state.done++;
        result.failed.push({ path: it.path, error: 'falha de rede' });
        report();
        resolve();
      };
      state.current = it.path;
      report();
      xhr.send(it.file);
    });

  // arquivos de mídia primeiro e bancos/conversas por último: a conversa já aparece com as mídias
  const isMain = (p) => /\.(sqlite|db|txt|zip)$/i.test(p) || /-(wal|shm)$/i.test(p);
  const queue = [...items].sort((a, b) => isMain(a.path) - isMain(b.path));
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) await sendOne(queue.shift());
  });
  await Promise.all(workers);
  return result;
}
