// Atualização sem cabo, lado do app: confirma que a versão abriu bem e baixa a próxima em segundo plano.
// Quem decide qual versão abre (e volta atrás se travar) é o carregador, src/boot/loader.ts, que fica no .wgt.
// O GitHub Actions publica cada versão em GitHub Pages: update/manifest.json + update/<versão>/{app,worker}.js.
import { createSignal } from 'solid-js';
import { newer } from '../boot/ota';

export const DEFAULT_UPDATE_URL = 'https://victorreinor.github.io/nyx-tv/update/';
const TIMEOUT_MS = 20000;
const FILES = ['app.js', 'worker.js'] as const;

export interface Manifest {
  version: string;
  shell: string;
  files: Record<(typeof FILES)[number], { sha256: string; size: number }>;
}

export type UpdateStatus =
  | { kind: 'off' } // `bun run dev` ou sem carregador
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'ready'; v: string } // baixada: abre na próxima vez
  | { kind: 'reinstall'; v: string } // casca nova: só reinstalando o .wgt
  | { kind: 'error' };

const boot = window.NyxBoot;

function baseUrl(): string {
  const u = import.meta.env.VITE_UPDATE_URL || DEFAULT_UPDATE_URL;
  if (u === 'off') return '';
  return u.charAt(u.length - 1) === '/' ? u : u + '/';
}

const base = boot ? baseUrl() : '';
const pendingAtBoot = boot && base ? boot.pending() : undefined;
const [status, setStatus] = createSignal<UpdateStatus>(!boot || !base ? { kind: 'off' } : pendingAtBoot ? { kind: 'ready', v: pendingAtBoot } : { kind: 'idle' });
export const updateStatus = status;

/** Versão rodando e se veio pela internet. */
export const running = { version: boot ? boot.version : __APP_VERSION__, ota: !!(boot && boot.ota) };

/** Valida o manifest.json publicado. */
export function parseManifest(x: unknown): Manifest | undefined {
  const m = x as Manifest | null;
  if (!m || typeof m !== 'object' || typeof m.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.version) || typeof m.shell !== 'string' || !m.files) return undefined;
  for (const f of FILES) {
    const e = m.files[f];
    if (!e || typeof e.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha256) || typeof e.size !== 'number') return undefined;
  }
  return m;
}

export function hex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
  return s;
}

async function get(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Baixa e confere tamanho e SHA-256. Qualquer diferença descarta a versão. */
async function download(url: string, want: { sha256: string; size: number }): Promise<string> {
  const buf = await (await get(url)).arrayBuffer();
  if (buf.byteLength !== want.size) throw new Error('tamanho errado em ' + url);
  if (hex(await crypto.subtle.digest('SHA-256', buf)) !== want.sha256) throw new Error('hash errado em ' + url);
  return new TextDecoder().decode(buf);
}

let busy = false;

/** Procura versão nova e, se houver, baixa para abrir na próxima vez. Nunca lança erro. */
export async function checkForUpdate(): Promise<UpdateStatus> {
  if (!boot || !base || busy) return status();
  const s = status();
  if (s.kind === 'ready') return s;
  busy = true;
  setStatus({ kind: 'checking' });
  try {
    const m = parseManifest(await (await get(base + 'manifest.json?t=' + Date.now())).json());
    if (!m) throw new Error('manifest.json inválido');
    let next: UpdateStatus;
    if (!newer(m.version, boot.version)) next = { kind: 'current' };
    else if (m.shell !== boot.shell) next = { kind: 'reinstall', v: m.version };
    // já travou aqui uma vez: fica na atual até sair outra
    else if (!boot.wants(m.version)) next = { kind: 'current' };
    else {
      const dir = base + m.version + '/';
      const app = await download(dir + 'app.js', m.files['app.js']);
      const worker = await download(dir + 'worker.js', m.files['worker.js']);
      next = boot.stage(m.version, app, worker) ? { kind: 'ready', v: m.version } : { kind: 'error' };
    }
    setStatus(next);
  } catch (err) {
    console.warn('atualização: ' + String((err as Error).message || err));
    setStatus({ kind: 'error' });
  } finally {
    busy = false;
  }
  return status();
}

/** O app abriu bem: o carregador passa a confiar nesta versão. */
export function confirmBoot() {
  if (boot) boot.ok();
}

/** Recarrega para abrir a versão baixada (o carregador escolhe na hora). */
export function applyUpdate() {
  location.reload();
}

export const bootNotice = boot ? { fresh: boot.fresh ? boot.version : undefined, rolledBack: boot.rolledBack } : {};
