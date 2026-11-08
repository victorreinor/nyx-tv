// Cliente da API Xtream Codes (player_api.php) e conversão para o modelo do app.
import {
  channelGroupKey,
  cleanChannelName,
  detectQuality,
  isAdultCategory,
  QUALITY_RANK,
  searchKey,
  toNumber,
  yearOf,
} from './normalize';
import type { Category, Channel, Episode, Kind, Movie, MovieInfo, PlaylistConfig, Series, SeriesInfo } from './types';

type Raw = Record<string, any>;

let viaProxy = false;
/** No navegador do Mac o provedor não manda CORS: as chamadas passam pelo proxy do Vite. */
export function useDevProxy(on: boolean) {
  viaProxy = on;
}

/** No dev, passa pelo proxy do Vite (o provedor não manda CORS). */
const proxied = (url: string) => (viaProxy ? '/__proxy?url=' + encodeURIComponent(url) : url);

export async function fetchText(url: string, timeoutMs = 60000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(proxied(url), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJSON<T = any>(url: string, timeoutMs?: number): Promise<T> {
  const text = await fetchText(url, timeoutMs);
  try {
    return JSON.parse(text);
  } catch {
    // servidor fora costuma responder 200 com uma página HTML: diz isso em vez de "Unexpected token <"
    throw new Error(/^\s*</.test(text) ? 'o servidor devolveu uma página (HTML) em vez de dados' : 'resposta inválida do servidor');
  }
}

export interface ProbeResult {
  /** 0 = não chegou resposta. */
  status: number;
  ms: number;
  timedOut: boolean;
  error: string;
  type: string;
  bytes: number;
  /** Primeiro byte (TS começa com 0x47); -1 = vazio. */
  first: number;
  /** Começo do corpo como texto (até `textMax`). */
  text: string;
  /** Endereço final, depois de redirecionamentos (HLS resolve os segmentos por ele). */
  url: string;
}

/**
 * Teste de rede que nunca lança erro: lê no máximo `maxBytes` e fecha a conexão.
 * Stream ao vivo não termina; por isso lê só o começo (e libera a conexão da conta na hora).
 */
export async function probe(url: string, timeoutMs: number, maxBytes: number, opts: { textMax?: number; range?: boolean } = {}): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  const out: ProbeResult = { status: 0, ms: 0, timedOut: false, error: '', type: '', bytes: 0, first: -1, text: '', url };
  const chunks: Uint8Array[] = [];
  try {
    const headers: Record<string, string> = opts.range ? { Range: `bytes=0-${maxBytes - 1}` } : {};
    const res = await fetch(proxied(url), { signal: ctrl.signal, headers });
    if (viaProxy && res.headers.get('x-proxy-error')) throw new Error((await res.text()).slice(0, 120));
    out.status = res.status;
    out.type = res.headers.get('content-type') || '';
    out.url = (viaProxy ? res.headers.get('x-final-url') : res.url) || url;
    if (res.body) {
      const reader = res.body.getReader();
      const textMax = opts.textMax || 2048;
      while (out.bytes < maxBytes) {
        const r = await reader.read();
        if (r.done || !r.value) break;
        if (out.first < 0 && r.value.length) out.first = r.value[0];
        // só o começo vira texto; o resto só é contado
        if (out.bytes < textMax) chunks.push(r.value);
        out.bytes += r.value.length;
      }
      reader.cancel().catch(() => undefined);
    }
  } catch (err) {
    out.timedOut = ctrl.signal.aborted;
    out.error = String((err as Error).message || err);
  } finally {
    clearTimeout(timer);
    out.ms = Date.now() - t0;
    ctrl.abort();
  }
  out.text = decodeStart(chunks, opts.textMax || 2048);
  return out;
}

function decodeStart(chunks: Uint8Array[], max: number): string {
  let size = 0;
  for (const c of chunks) size += c.length;
  const buf = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const c of chunks) {
    if (at >= buf.length) break;
    const part = c.subarray(0, buf.length - at);
    buf.set(part, at);
    at += part.length;
  }
  return new TextDecoder().decode(buf);
}

function base(p: PlaylistConfig): string {
  return String(p.host || '').replace(/\/+$/, '');
}

export function apiUrl(p: PlaylistConfig, action?: string, extra = ''): string {
  const auth = `username=${encodeURIComponent(p.username || '')}&password=${encodeURIComponent(p.password || '')}`;
  return `${base(p)}/player_api.php?${auth}${action ? '&action=' + action : ''}${extra}`;
}

export function xmltvUrl(p: PlaylistConfig): string {
  return `${base(p)}/xmltv.php?username=${encodeURIComponent(p.username || '')}&password=${encodeURIComponent(p.password || '')}`;
}

export function liveUrl(p: PlaylistConfig, streamId: number, format: 'ts' | 'm3u8'): string {
  return `${base(p)}/live/${p.username}/${p.password}/${streamId}.${format}`;
}

export function movieUrl(p: PlaylistConfig, id: number, ext: string): string {
  return `${base(p)}/movie/${p.username}/${p.password}/${id}.${ext || 'mp4'}`;
}

export function episodeUrl(p: PlaylistConfig, id: string, ext: string): string {
  return `${base(p)}/series/${p.username}/${p.password}/${id}.${ext || 'mp4'}`;
}

/** IDs de categoria do Xtream se repetem entre tipos: prefixamos com l:/m:/s:. */
export function mapCategories(raw: Raw[], kind: Kind): Category[] {
  return (raw || []).map((c) => ({
    id: kind[0] + ':' + String(c.category_id),
    name: String(c.category_name || '').trim(),
    kind,
    count: 0,
    adult: isAdultCategory(String(c.category_name || '')),
  }));
}

function categoryIds(x: Raw, prefix: string): string[] {
  const ids = Array.isArray(x.category_ids) && x.category_ids.length ? x.category_ids : [x.category_id];
  return ids.filter((v: unknown) => v !== null && v !== undefined && v !== '').map((v: unknown) => prefix + String(v));
}

/** Agrupa as variantes SD/HD/FHD/4K (e fontes reserva) do mesmo canal. */
export function groupChannels(raw: Raw[], adultCats: Set<string>): Channel[] {
  const groups = new Map<string, Channel>();
  for (const x of raw || []) {
    const name = String(x.name || '').trim();
    if (!name) continue;
    const key = channelGroupKey(name) || searchKey(name);
    const cats = categoryIds(x, 'l:');
    let ch = groups.get(key);
    if (!ch) {
      ch = {
        id: key,
        num: toNumber(x.num, 99999),
        name: cleanChannelName(name) || name,
        logo: String(x.stream_icon || ''),
        epgId: String(x.epg_channel_id || ''),
        categories: [],
        variants: [],
        adult: false,
        key: searchKey(cleanChannelName(name) || name),
      };
      groups.set(key, ch);
    }
    ch.num = Math.min(ch.num, toNumber(x.num, 99999));
    if (!ch.logo && x.stream_icon) ch.logo = String(x.stream_icon);
    if (!ch.epgId && x.epg_channel_id) ch.epgId = String(x.epg_channel_id);
    for (const c of cats) if (ch.categories.indexOf(c) === -1) ch.categories.push(c);
    if (cats.some((c) => adultCats.has(c))) ch.adult = true;
    ch.variants.push({ streamId: toNumber(x.stream_id), quality: detectQuality(name), name });
  }
  const list = Array.from(groups.values());
  for (const ch of list) ch.variants.sort((a, b) => QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality]);
  return list.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));
}

export function mapMovies(raw: Raw[], adultCats: Set<string>): Movie[] {
  const out: Movie[] = [];
  for (const x of raw || []) {
    const name = String(x.name || x.title || '').trim();
    if (!name) continue;
    const cats = categoryIds(x, 'm:');
    out.push({
      id: toNumber(x.stream_id),
      name,
      poster: String(x.stream_icon || ''),
      year: toNumber(x.year) || yearOf(name),
      rating: toNumber(x.rating_5based) || toNumber(x.rating) / 2,
      added: toNumber(x.added),
      categories: cats,
      ext: String(x.container_extension || 'mp4'),
      adult: cats.some((c) => adultCats.has(c)),
      key: searchKey(name),
    });
  }
  return out;
}

export function mapSeries(raw: Raw[], adultCats: Set<string>): Series[] {
  const out: Series[] = [];
  for (const x of raw || []) {
    const name = String(x.name || x.title || '').trim();
    if (!name) continue;
    const cats = categoryIds(x, 's:');
    const backdrop = Array.isArray(x.backdrop_path) ? x.backdrop_path[0] : x.backdrop_path;
    out.push({
      id: toNumber(x.series_id),
      name,
      poster: String(x.cover || ''),
      backdrop: String(backdrop || ''),
      year: yearOf(x.release_date || x.releaseDate || x.year || name),
      rating: toNumber(x.rating_5based) || toNumber(x.rating) / 2,
      added: toNumber(x.last_modified),
      categories: cats,
      plot: String(x.plot || ''),
      genre: String(x.genre || ''),
      adult: cats.some((c) => adultCats.has(c)),
      key: searchKey(name),
    });
  }
  return out;
}

export async function fetchSeriesInfo(p: PlaylistConfig, series: Series): Promise<SeriesInfo> {
  const d = await fetchJSON<Raw>(apiUrl(p, 'get_series_info', `&series_id=${series.id}`), 30000);
  const eps: Raw = (d && d.episodes) || {};
  const seasons = Object.keys(eps)
    .map((k) => {
      const list: Raw[] = Array.isArray(eps[k]) ? eps[k] : [];
      const episodes: Episode[] = list.map((e, i) => {
        const info: Raw = e.info || {};
        return {
          id: String(e.id),
          season: toNumber(e.season, toNumber(k)),
          episode: toNumber(e.episode_num, i + 1),
          title: String(e.title || info.name || ''),
          ext: String(e.container_extension || 'mp4'),
          duration: toNumber(info.duration_secs),
          plot: String(info.plot || ''),
          image: String(info.movie_image || info.cover_big || ''),
        };
      });
      episodes.sort((a, b) => a.episode - b.episode);
      return { season: toNumber(k), episodes };
    })
    .filter((s) => s.episodes.length)
    .sort((a, b) => a.season - b.season);
  const info: Raw = (d && d.info) || {};
  const backdrop = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path;
  return {
    series: {
      ...series,
      plot: String(info.plot || series.plot),
      genre: String(info.genre || series.genre),
      backdrop: String(backdrop || series.backdrop),
    },
    seasons,
  };
}

export async function fetchMovieInfo(p: PlaylistConfig, movie: Movie): Promise<MovieInfo> {
  const d = await fetchJSON<Raw>(apiUrl(p, 'get_vod_info', `&vod_id=${movie.id}`), 30000);
  const info: Raw = (d && d.info) || {};
  const backdrop = Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path;
  return {
    movie,
    plot: String(info.plot || info.description || ''),
    cast: String(info.cast || info.actors || ''),
    director: String(info.director || ''),
    genre: String(info.genre || ''),
    duration: toNumber(info.duration_secs),
    backdrop: String(backdrop || ''),
    tmdbId: toNumber(info.tmdb_id || info.tmdb),
    trailer: String(info.youtube_trailer || ''),
  };
}
