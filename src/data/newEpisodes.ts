// "Novo episódio" conferido: o provedor só diz que a série mudou (last_modified), e isso muda também
// por capa ou sinopse. Para as séries que você acompanha, o app compara a lista de episódios com a
// que você já conhecia e diz qual é o novo. Puro, testado em tests/newEpisodes.test.ts.
import type { Episode, SeriesInfo } from './types';

/** O que você conhecia da série: maior episódio (temporada × 1000 + episódio) e quantos existiam (0 = não sabe). */
export interface EpisodeRef {
  top: number;
  n: number;
}

/**
 * Resultado da conferência para um `series.added`.
 * count > 0: há `count` episódios novos, o primeiro é T`s` E`e` (s = 0: novo confirmado, mas sem saber qual).
 * count = 0: a mudança não foi episódio novo (sem selo). count = -1: sem referência para comparar (selo genérico).
 */
export interface NewEpisodes {
  added: number;
  count: number;
  s: number;
  e: number;
}

/** Ordem de episódio comparável entre temporadas (T2 E1 > T1 E9). */
export function episodeKey(e: { season?: number; episode?: number }): number {
  return (e.season || 0) * 1000 + (e.episode || 0);
}

/** Todos os episódios, temporada por temporada. */
export function flatEpisodes(info: SeriesInfo): Episode[] {
  const out: Episode[] = [];
  info.seasons.forEach((s) => s.episodes.forEach((e) => out.push(e)));
  return out;
}

export function episodeRef(episodes: Episode[]): EpisodeRef {
  let top = 0;
  for (const e of episodes) top = Math.max(top, episodeKey(e));
  return { top, n: episodes.length };
}

export function diffEpisodes(episodes: Episode[], ref: EpisodeRef | null, added: number): NewEpisodes {
  if (!ref || !ref.top) return { added, count: -1, s: 0, e: 0 };
  const fresh = episodes.filter((e) => episodeKey(e) > ref.top).sort((a, b) => episodeKey(a) - episodeKey(b));
  if (fresh.length) return { added, count: fresh.length, s: fresh[0].season, e: fresh[0].episode };
  // episódio entrou no meio (numeração antiga): novo, mas sem como dizer qual
  if (ref.n && episodes.length > ref.n) return { added, count: episodes.length - ref.n, s: 0, e: 0 };
  return { added, count: 0, s: 0, e: 0 };
}
