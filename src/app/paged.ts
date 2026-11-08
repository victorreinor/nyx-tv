// Lista paginada por cursor (keyset) que recarrega quando as dependências mudam
// (categoria, ordenação, dados atualizados) e busca a próxima página sob demanda.
import { createEffect, createSignal, on } from 'solid-js';
import type { Page } from '../data/types';

export function usePaged<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>, deps: () => unknown) {
  const [items, setItems] = createSignal<T[]>([]);
  const [total, setTotal] = createSignal(0);
  const [loaded, setLoaded] = createSignal(false);
  let next: string | null = null;
  let loading = false;
  let gen = 0;

  async function load(reset: boolean) {
    if (!reset && (loading || !next)) return;
    const mine = reset ? ++gen : gen;
    loading = true;
    try {
      const page = await fetchPage(reset ? null : next);
      if (mine !== gen) return;
      setItems(reset ? page.items : items().concat(page.items));
      setTotal(page.total);
      next = page.next;
      setLoaded(true);
    } catch {
      if (mine === gen) setLoaded(true);
    } finally {
      if (mine === gen) loading = false;
    }
  }

  createEffect(on(deps, () => load(true)));

  /** Troca itens já carregados sem buscar de novo (ex.: a estrela de favorito). */
  const update = (fn: (list: T[]) => T[]) => setItems(fn(items()));

  return { items, total, loaded, more: () => load(false), reload: () => load(true), update };
}
