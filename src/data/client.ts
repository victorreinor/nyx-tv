// Cliente RPC do worker de dados (thread principal). Tipado a partir da própria API do worker.
import { unwrap } from 'solid-js/store';
import type { Api } from './worker';
import type { WorkerEvent } from './types';

type Result<K extends keyof Api> = Api[K] extends (...a: any[]) => infer R ? (R extends Promise<infer U> ? U : R) : never;

const worker = import.meta.env.DEV
  ? new Worker('/src/data/worker.ts', { type: 'module' })
  : new Worker('worker.js');

let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const listeners = new Set<(e: WorkerEvent) => void>();

worker.onmessage = (e: MessageEvent) => {
  const msg = e.data as { id?: number; result?: unknown; error?: string; event?: WorkerEvent };
  if (msg.event) {
    listeners.forEach((fn) => fn(msg.event!));
    return;
  }
  const p = pending.get(msg.id!);
  if (!p) return;
  pending.delete(msg.id!);
  if (msg.error !== undefined) p.reject(new Error(msg.error));
  else p.resolve(msg.result);
};

export function call<K extends keyof Api>(method: K, ...args: Parameters<Api[K]>): Promise<Result<K>> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    try {
      // Objetos de store do Solid são Proxy e não passam pelo postMessage (DataCloneError).
      worker.postMessage({ id, method, args: args.map((a) => (a && typeof a === 'object' ? unwrap(a) : a)) });
    } catch (err) {
      pending.delete(id);
      reject(err);
    }
  });
}

export function onWorkerEvent(fn: (e: WorkerEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Chamadas em que só a resposta mais recente importa (busca enquanto digita).
 * Respostas antigas são descartadas em vez de sobrescrever a tela.
 */
export function latest<K extends keyof Api>(method: K) {
  let last = 0;
  return async (...args: Parameters<Api[K]>): Promise<Result<K> | undefined> => {
    const mine = ++last;
    const res = await call(method, ...args);
    return mine === last ? res : undefined;
  };
}
