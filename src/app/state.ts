// Estado global pequeno: versão dos dados (telas recarregam quando muda), sincronização e avisos.
import { createSignal } from 'solid-js';
import { call, onWorkerEvent } from '../data/client';
import type { Stats, SyncPhase } from '../data/types';
import { activePlaylist, filters } from './settings';

export const [dataVersion, setDataVersion] = createSignal(0);
/** Último canal sintonizado no player (a grade volta para ele no Voltar). */
export const [lastChannel, setLastChannel] = createSignal<string | null>(null);
export const [stats, setStats] = createSignal<Stats | null>(null);
export const [sync, setSync] = createSignal<{ running: boolean; phase: SyncPhase; pct: number; error: string }>({
  running: false,
  phase: 'categories',
  pct: 0,
  error: '',
});

const [toastMsg, setToastMsg] = createSignal<{ text: string; id: number } | null>(null);
export { toastMsg };
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, ms = 2600) {
  clearTimeout(toastTimer);
  setToastMsg({ text, id: Date.now() });
  toastTimer = setTimeout(() => setToastMsg(null), ms);
}

onWorkerEvent((e) => {
  if (e.type === 'progress') setSync({ running: e.phase !== 'done', phase: e.phase, pct: e.pct, error: '' });
  else if (e.type === 'updated') {
    setStats(e.stats);
    setDataVersion(dataVersion() + 1);
  } else if (e.type === 'error') setSync({ ...sync(), running: false, error: e.message });
});

/** Abre a lista ativa no worker. Retorna se já havia cache (abre na hora). */
export async function openActive(): Promise<boolean> {
  const p = activePlaylist();
  if (!p) return false;
  const res = await call('open', p, filters(), import.meta.env.DEV);
  setStats(res.stats);
  setDataVersion(dataVersion() + 1);
  return res.hasData;
}

export async function runSync(): Promise<void> {
  setSync({ running: true, phase: 'categories', pct: 1, error: '' });
  try {
    const st = await call('sync');
    setStats(st);
    setSync({ running: false, phase: 'done', pct: 100, error: '' });
    setDataVersion(dataVersion() + 1);
  } catch (err) {
    setSync({ running: false, phase: 'done', pct: 0, error: String((err as Error).message || err) });
    throw err;
  }
}

export function applyFilters() {
  call('setFilters', filters()).then(() => setDataVersion(dataVersion() + 1));
}
