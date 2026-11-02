// Paginação keyset: o cursor é a chave do último item (valor de ordenação + id),
// não um offset. Se o catálogo for atualizado no meio da rolagem, a próxima
// página continua do ponto certo, sem pular nem repetir itens.

export interface SortSpec<T> {
  value: (item: T) => number | string;
  id: (item: T) => number | string;
  /** 1 = crescente, -1 = decrescente (o desempate pelo id é sempre crescente). */
  dir: 1 | -1;
}

function cmp(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function compareBy<T>(spec: SortSpec<T>) {
  return (a: T, b: T) => spec.dir * cmp(spec.value(a), spec.value(b)) || cmp(spec.id(a), spec.id(b));
}

export function encodeCursor(value: number | string, id: number | string): string {
  return JSON.stringify([value, id]);
}

function decodeCursor(cursor: string): [number | string, number | string] | null {
  try {
    const v = JSON.parse(cursor);
    return Array.isArray(v) && v.length === 2 ? (v as [number | string, number | string]) : null;
  } catch {
    return null;
  }
}

export function keysetPage<T>(sorted: T[], spec: SortSpec<T>, cursor: string | null, limit: number): { items: T[]; next: string | null } {
  let start = 0;
  const c = cursor ? decodeCursor(cursor) : null;
  if (c) {
    // primeiro item estritamente depois do cursor (busca binária)
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const it = sorted[mid];
      const after = spec.dir * cmp(spec.value(it), c[0]) || cmp(spec.id(it), c[1]);
      if (after > 0) hi = mid;
      else lo = mid + 1;
    }
    start = lo;
  }
  const items = sorted.slice(start, start + limit);
  const last = items[items.length - 1];
  const next = last && start + limit < sorted.length ? encodeCursor(spec.value(last), spec.id(last)) : null;
  return { items, next };
}
