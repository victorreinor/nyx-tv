// Progresso do player à prova de saída brusca (botão de outro app, Home, Sair, timer).
// O worker grava no IndexedDB com atraso e pode morrer junto com o app. Por isso o último
// progresso também vai para o localStorage, que é síncrono, e volta para o worker ao abrir a lista.
import { call } from '../data/client';
import type { Progress } from '../data/types';
import { activePlaylist } from './settings';

const KEY = 'nyx.progress';

interface Pending {
  pid: string;
  p: Progress;
}

function read(): Pending | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

function drop(updatedAt?: number) {
  try {
    const cur = read();
    if (cur && (updatedAt === undefined || cur.p.updatedAt === updatedAt)) localStorage.removeItem(KEY);
  } catch {
    // sem localStorage: segue só com o worker
  }
}

/** `now` = saindo do player: o worker grava no IndexedDB na hora, sem esperar o debounce. */
export function saveProgress(p: Progress, now: boolean) {
  const pl = activePlaylist();
  try {
    if (pl) localStorage.setItem(KEY, JSON.stringify({ pid: pl.id, p }));
  } catch {
    // cheio ou bloqueado: segue só com o worker
  }
  const done = call('saveProgress', p, now);
  if (now) done.then(() => drop(p.updatedAt)).catch(() => undefined);
}

/** Depois de abrir a lista: devolve ao worker o que pode não ter chegado ao IndexedDB. */
export async function restoreProgress() {
  const pending = read();
  const pl = activePlaylist();
  if (!pending || !pl || pending.pid !== pl.id) return;
  await call('saveProgress', pending.p, true).catch(() => undefined);
  drop(pending.p.updatedAt);
}

/** Configurações › Histórico: o que estava guardado aqui não pode voltar depois de apagar. */
export function dropPendingProgress() {
  drop();
}
