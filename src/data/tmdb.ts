// TMDB à prova de falhas (roda no worker). Só ACRESCENTA informação: qualquer erro, demora
// ou falta de chave vira `null` e a tela segue com os dados do provedor.
//
// - limite de 4 s por consulta e no máximo 2 consultas ao mesmo tempo
// - cache no IndexedDB: 30 dias para respostas, 1 dia para falhas (não insiste)
// - filmes: o provedor manda o tmdb_id (busca exata); séries: busca por nome + ano
import { displayTitle, searchKey } from './normalize';
import { loadRecord, saveRecord } from './store';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const TIMEOUT_MS = 4000;
const MAX_PARALLEL = 2;
const TTL_OK = 30 * 86400 * 1000;
const TTL_FAIL = 86400 * 1000;

export interface TmdbPerson {
  name: string;
  character: string;
  photo: string;
}

export interface TmdbDetails {
  id: number;
  overview: string;
  genres: string[];
  runtime: number; // min
  certification: string; // classificação indicativa (BR)
  rating: number; // 0..10
  backdrop: string;
  cast: TmdbPerson[];
  trailer: string; // id do vídeo no YouTube
  recommendations: { title: string; original: string; year: number }[];
}

export interface TmdbEpisode {
  episode: number;
  name: string;
  overview: string;
  still: string;
  runtime: number;
}

let apiKey = '';
let lang = 'pt-BR';

export function configureTmdb(key: string, locale: string) {
  apiKey = (key || '').trim();
  lang = locale || 'pt-BR';
}

export function tmdbEnabled(): boolean {
  return apiKey.length >= 16;
}

// ---------- rede: limite de tempo e de concorrência ----------

let active = 0;
const waiting: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = waiting.shift();
    if (next) next();
  }
}

function get(path: string, params: Record<string, string | number> = {}): Promise<any> {
  return limited(async () => {
    const qs = Object.keys(params)
      .map((k) => `&${k}=${encodeURIComponent(String(params[k]))}`)
      .join('');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API}${path}?api_key=${apiKey}&language=${lang}${qs}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`TMDB ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  });
}

// ---------- cache ----------

const memory = new Map<string, unknown>();

async function cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  const full = `tmdb:${lang}:${key}`;
  if (memory.has(full)) return memory.get(full) as T | null;
  const saved = await loadRecord<{ at: number; data: T | null }>('snap', full).catch(() => undefined);
  if (saved && Date.now() - saved.at < (saved.data ? TTL_OK : TTL_FAIL)) {
    memory.set(full, saved.data);
    return saved.data;
  }
  let data: T | null = null;
  try {
    data = await load();
  } catch {
    data = null; // timeout, rede, chave inválida: fica sem TMDB
  }
  memory.set(full, data);
  if (memory.size > 200) memory.delete(memory.keys().next().value as string);
  saveRecord('snap', full, { at: Date.now(), data }).catch(() => undefined);
  return data;
}

// ---------- conversão ----------

const img = (size: string, path: string | null | undefined) => (path ? IMG + size + path : '');

function pickTrailer(videos: any): string {
  const list: any[] = (videos && videos.results) || [];
  const yt = list.filter((v) => v.site === 'YouTube');
  const score = (v: any) => (v.type === 'Trailer' ? 2 : v.type === 'Teaser' ? 1 : 0) + (v.iso_639_1 === 'pt' ? 3 : 0);
  yt.sort((a, b) => score(b) - score(a));
  return yt[0] && (yt[0].type === 'Trailer' || yt[0].type === 'Teaser') ? String(yt[0].key) : '';
}

function details(d: any, kind: 'movie' | 'tv'): TmdbDetails {
  let certification = '';
  if (kind === 'movie') {
    const br = ((d.release_dates && d.release_dates.results) || []).find((r: any) => r.iso_3166_1 === 'BR');
    const c = br && (br.release_dates || []).find((x: any) => x.certification);
    certification = c ? String(c.certification) : '';
  } else {
    const br = ((d.content_ratings && d.content_ratings.results) || []).find((r: any) => r.iso_3166_1 === 'BR');
    certification = br ? String(br.rating || '') : '';
  }
  const recs: any[] = (d.recommendations && d.recommendations.results) || [];
  return {
    id: Number(d.id),
    overview: String(d.overview || ''),
    genres: ((d.genres || []) as any[]).map((g) => String(g.name)),
    runtime: Number(d.runtime || (d.episode_run_time && d.episode_run_time[0]) || 0),
    certification,
    rating: Number(d.vote_average || 0),
    backdrop: img('w1280', d.backdrop_path),
    cast: (((d.credits && d.credits.cast) || []) as any[]).slice(0, 15).map((c) => ({
      name: String(c.name || ''),
      character: String(c.character || ''),
      photo: img('w185', c.profile_path),
    })),
    trailer: pickTrailer(d.videos),
    recommendations: recs.slice(0, 30).map((r) => ({
      title: String(r.title || r.name || ''),
      original: String(r.original_title || r.original_name || ''),
      year: Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) || 0,
    })),
  };
}

// ---------- API ----------

/** Filme pelo tmdb_id do provedor; sem id, busca por título + ano. */
export function tmdbMovie(tmdbId: number, title: string, year: number): Promise<TmdbDetails | null> {
  if (!tmdbEnabled()) return Promise.resolve(null);
  return cached(`movie:${tmdbId || searchKey(title) + ':' + year}`, async () => {
    let id = tmdbId;
    if (!id) {
      const s = await get('/search/movie', year ? { query: displayTitle(title), year } : { query: displayTitle(title) });
      const hit = bestMatch((s && s.results) || [], title, year);
      if (!hit) return null;
      id = hit;
    }
    const d = await get(`/movie/${id}`, { append_to_response: 'credits,videos,recommendations,release_dates', include_video_language: 'pt,en,null' });
    return details(d, 'movie');
  });
}

/** Série por nome + ano. Confiança baixa (nome diferente) = sem TMDB, para não mostrar a série errada. */
export function tmdbSeries(title: string, year: number): Promise<TmdbDetails | null> {
  if (!tmdbEnabled()) return Promise.resolve(null);
  return cached(`tv:${searchKey(title)}:${year}`, async () => {
    const s = await get('/search/tv', year ? { query: displayTitle(title), first_air_date_year: year } : { query: displayTitle(title) });
    let id = bestMatch((s && s.results) || [], title, year);
    if (!id && year) {
      // o ano das séries no provedor costuma estar errado (ex.: ano do cadastro):
      // segunda tentativa aceita o nome exato (o TMDB já ordena por popularidade)
      const again = await get('/search/tv', { query: displayTitle(title) });
      id = bestMatch((again && again.results) || [], title, 0);
    }
    if (!id) return null;
    const d = await get(`/tv/${id}`, { append_to_response: 'credits,videos,recommendations,content_ratings', include_video_language: 'pt,en,null' });
    return details(d, 'tv');
  });
}

export function tmdbSeason(tvId: number, season: number): Promise<TmdbEpisode[] | null> {
  if (!tmdbEnabled() || !tvId) return Promise.resolve(null);
  return cached(`season:${tvId}:${season}`, async () => {
    const d = await get(`/tv/${tvId}/season/${season}`);
    return (((d && d.episodes) || []) as any[]).map((e) => ({
      episode: Number(e.episode_number),
      name: String(e.name || ''),
      overview: String(e.overview || ''),
      still: img('w300', e.still_path),
      runtime: Number(e.runtime || 0),
    }));
  });
}

/** Resultado da busca cujo nome (traduzido ou original) bate com o título, com ano próximo. */
export function bestMatch(results: any[], title: string, year: number): number {
  const want = searchKey(displayTitle(title));
  for (const r of results) {
    const names = [r.title, r.name, r.original_title, r.original_name].filter(Boolean).map((n: string) => searchKey(n));
    const y = Number(String(r.release_date || r.first_air_date || '').slice(0, 4)) || 0;
    if (names.indexOf(want) !== -1 && (!year || !y || Math.abs(y - year) <= 1)) return Number(r.id);
  }
  return 0;
}
