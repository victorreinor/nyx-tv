// Busca em memória: medida na TV em 10–35 ms para 31 mil títulos.
import { searchKey } from './normalize';

/**
 * Índices de `keys` que contêm todos os termos, do mais relevante ao menos.
 * Pontua por termo: começo do nome (3) > começo de palavra (2) > meio da palavra (1).
 * Empate: nome mais curto primeiro (o "exato" aparece antes).
 */
export function rankMatches(keys: string[], query: string, limit: number, accept?: (i: number) => boolean): number[] {
  const terms = searchKey(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  const hits: number[] = [];
  const scores: number[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    let score = 0;
    for (let t = 0; t < terms.length; t++) {
      const at = k.indexOf(terms[t]);
      if (at === -1) {
        score = -1;
        break;
      }
      score += at === 0 ? 3 : k.charCodeAt(at - 1) === 32 ? 2 : 1;
    }
    if (score > 0 && (!accept || accept(i))) {
      hits.push(i);
      scores[i] = score;
    }
  }
  hits.sort((a, b) => scores[b] - scores[a] || keys[a].length - keys[b].length || a - b);
  return hits.length > limit ? hits.slice(0, limit) : hits;
}
