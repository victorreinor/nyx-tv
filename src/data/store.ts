// IndexedDB em blocos grandes. Medido na TV: 31.854 filmes gravam em ~0,44 s e leem em ~0,3 s
// (um registro por item levava 22 s). Roda só no worker.

const DB_NAME = 'nyx';
const DB_VERSION = 1;
const CHUNK = 4000;

type StoreName = 'snap' | 'user';

let dbPromise: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const d = open.result;
        if (!d.objectStoreNames.contains('snap')) d.createObjectStore('snap');
        if (!d.objectStoreNames.contains('user')) d.createObjectStore('user');
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }
  return dbPromise;
}

/** Dois hashes de 32 bits (FNV-1a e outro multiplicador) + tamanho, alimentados aos pedaços. */
function hasher() {
  let h1 = 0x811c9dc5;
  let h2 = 0x9747b28c;
  let len = 0;
  return {
    add(s: string) {
      let a = h1;
      let b = h2;
      for (let j = 0; j < s.length; j++) {
        const c = s.charCodeAt(j);
        a = Math.imul(a ^ c, 0x01000193);
        b = Math.imul(b ^ c, 0x5bd1e995);
      }
      h1 = a;
      h2 = b;
      len += s.length;
    },
    done: () => len + ':' + (h1 >>> 0).toString(36) + ':' + (h2 >>> 0).toString(36),
  };
}

/**
 * Assinatura do conteúdo. Mesma assinatura = mesmo conteúdo, então não precisa regravar.
 * Hash em blocos para não montar um texto de 8 MB.
 */
export function fingerprint(rows: unknown[]): string {
  const h = hasher();
  for (let i = 0; i < rows.length; i += CHUNK) h.add(JSON.stringify(rows.slice(i, i + CHUNK)));
  return rows.length + ':' + h.done();
}

/** Assinatura de um texto (ex.: o XMLTV como veio do provedor). */
export function hashText(s: string): string {
  const h = hasher();
  h.add(s);
  return h.done();
}

/**
 * Grava uma lista grande em blocos de 4000 itens numa única transação. Se o conteúdo é igual ao
 * salvo, não regrava: cada regravação deixa a versão velha no disco da TV até o app reabrir
 * (medido: 15 → 41 MB apertando "Baixar a lista de novo" 3×, com os dados iguais). Devolve se gravou.
 */
export async function saveChunks(pid: string, name: string, rows: unknown[]): Promise<boolean> {
  const sig = fingerprint(rows);
  const d = await db();
  const tx = d.transaction('snap', 'readwrite');
  const st = tx.objectStore('snap');
  const metaKey = `${pid}:${name}`;
  const old = (await req(st.get(metaKey))) as { sig?: string } | undefined;
  if (old && old.sig === sig) {
    await done(tx);
    return false;
  }
  const prefix = metaKey + ':';
  st.delete(IDBKeyRange.bound(prefix, prefix + '￿'));
  let n = 0;
  for (let i = 0; i < rows.length; i += CHUNK) st.put(rows.slice(i, i + CHUNK), prefix + String(n++).padStart(4, '0'));
  st.put({ chunks: n, savedAt: Date.now(), sig }, metaKey);
  await done(tx);
  return true;
}

export async function loadChunks<T>(pid: string, name: string): Promise<T[] | null> {
  const d = await db();
  const tx = d.transaction('snap');
  const st = tx.objectStore('snap');
  const meta = await req(st.get(`${pid}:${name}`));
  if (!meta) return null;
  const prefix = `${pid}:${name}:`;
  const chunks = (await req(st.getAll(IDBKeyRange.bound(prefix, prefix + '￿')))) as T[][];
  const out: T[] = [];
  for (const c of chunks) for (let i = 0; i < c.length; i++) out.push(c[i]);
  return out;
}

export async function saveRecord(store: StoreName, key: string, value: unknown): Promise<void> {
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await done(tx);
}

export async function loadRecord<T>(store: StoreName, key: string): Promise<T | undefined> {
  const d = await db();
  return (await req(d.transaction(store).objectStore(store).get(key))) as T | undefined;
}

/** Apaga tudo de uma lista (ao remover a lista nas configurações). */
export async function deletePlaylistData(pid: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['snap', 'user'], 'readwrite');
  const range = IDBKeyRange.bound(`${pid}:`, `${pid}:￿`);
  tx.objectStore('snap').delete(range);
  tx.objectStore('snap').delete(pid);
  tx.objectStore('user').delete(pid);
  await done(tx);
}

/** Percorre as chaves que começam com `prefix` e apaga as que `expired` aprovar. Devolve quantas saíram. */
export async function pruneRecords(store: StoreName, prefix: string, expired: (value: unknown) => boolean): Promise<number> {
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  const cur = tx.objectStore(store).openCursor(IDBKeyRange.bound(prefix, prefix + '￿'));
  let removed = 0;
  cur.onsuccess = () => {
    const c = cur.result;
    if (!c) return;
    if (expired(c.value)) {
      c.delete();
      removed++;
    }
    c.continue();
  };
  await done(tx);
  return removed;
}

export async function estimateUsageMB(): Promise<number> {
  const nav = navigator as Navigator & { storage?: { estimate?: () => Promise<{ usage?: number }> } };
  if (!nav.storage || !nav.storage.estimate) return 0;
  const e = await nav.storage.estimate();
  return Math.round((e.usage || 0) / 1048576);
}
