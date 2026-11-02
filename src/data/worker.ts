// Worker de dados: dono do catálogo, da grade, do IndexedDB e da rede com o provedor.
// A UI conversa só por RPC (src/data/client.ts) e recebe páginas pequenas.
import { Catalog } from './catalog';
import { parseXmltv } from './epg';
import { parseM3u } from './m3u';
import { deletePlaylistData, estimateUsageMB, loadChunks, saveChunks } from './store';
import type {
  Category,
  Channel,
  Episode,
  Filters,
  Kind,
  Movie,
  MovieInfo,
  PlaylistConfig,
  PlaySource,
  Program,
  Progress,
  Quality,
  Series,
  SeriesInfo,
  SortKey,
  Stats,
  WorkerEvent,
} from './types';
import { UserStore } from './user';
import { configureTmdb, tmdbEnabled, tmdbMovie, tmdbSeason, tmdbSeries } from './tmdb';
import type { TmdbView } from './types';
import * as xc from './xtream';

const ctx = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null };

const CATALOG_TTL = 12 * 3600 * 1000;
const EPG_TTL = 6 * 3600 * 1000;

const user = new UserStore();
const catalog = new Catalog(user);
let playlist: PlaylistConfig | null = null;
let syncing: Promise<Stats> | null = null;
const seriesInfoCache = new Map<number, SeriesInfo>();
const movieInfoCache = new Map<number, MovieInfo>();
const MAX_INFO = 40;

/** Guarda no cache com limite: o item mais antigo sai primeiro. */
function remember<K, V>(map: Map<K, V>, key: K, value: V) {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_INFO) map.delete(map.keys().next().value as K);
}

// programas que já passaram saem da memória a cada hora
setInterval(() => catalog.pruneEpg(), 3600 * 1000);

function emit(e: WorkerEvent) {
  ctx.postMessage({ event: e });
}

function current(): PlaylistConfig {
  if (!playlist) throw new Error('nenhuma lista aberta');
  return playlist;
}

interface Meta {
  catalogAt: number;
  epgAt: number;
}

async function saveMeta(pid: string) {
  const meta: Meta = { catalogAt: catalog.catalogAt, epgAt: catalog.epgAt };
  await saveChunks(pid, 'meta', [meta]);
}

async function loadSnapshot(pid: string): Promise<boolean> {
  const [meta, channels, movies, series, categories] = await Promise.all([
    loadChunks<Meta>(pid, 'meta'),
    loadChunks<Channel>(pid, 'live'),
    loadChunks<Movie>(pid, 'movies'),
    loadChunks<Series>(pid, 'series'),
    loadChunks<Category>(pid, 'categories'),
  ]);
  if (!meta || !meta[0] || !channels || !movies || !series || !categories) return false;
  const episodes = await loadChunks<[number, Episode[]]>(pid, 'episodes');
  catalog.setCatalog({ channels, movies, series, categories, m3uEpisodes: episodes ? new Map(episodes) : null, at: meta[0].catalogAt });
  const epg = await loadChunks<[string, Program[]]>(pid, 'epg');
  if (epg) catalog.setEpg(new Map(epg), meta[0].epgAt);
  return true;
}

async function saveCatalog(pid: string) {
  await saveChunks(pid, 'live', catalog.channels);
  await saveChunks(pid, 'movies', catalog.movies);
  await saveChunks(pid, 'series', catalog.series);
  await saveChunks(pid, 'categories', catalog.categories);
  if (catalog.m3uEpisodes) await saveChunks(pid, 'episodes', Array.from(catalog.m3uEpisodes.entries()));
  await saveMeta(pid);
}

async function syncXtream(p: PlaylistConfig) {
  emit({ type: 'progress', phase: 'categories', pct: 5 });
  const [lc, vc, sc] = await Promise.all([
    xc.fetchJSON(xc.apiUrl(p, 'get_live_categories')),
    xc.fetchJSON(xc.apiUrl(p, 'get_vod_categories')),
    xc.fetchJSON(xc.apiUrl(p, 'get_series_categories')),
  ]);
  const categories = [...xc.mapCategories(lc, 'live'), ...xc.mapCategories(vc, 'movie'), ...xc.mapCategories(sc, 'series')];
  const adult = new Set(categories.filter((c) => c.adult).map((c) => c.id));

  let pct = 10;
  const step = (phase: 'live' | 'movies' | 'series') => {
    pct += 22;
    emit({ type: 'progress', phase, pct });
  };
  emit({ type: 'progress', phase: 'live', pct });
  const [channels, movies, series] = await Promise.all([
    xc.fetchJSON(xc.apiUrl(p, 'get_live_streams'), 120000).then((r) => (step('live'), xc.groupChannels(r, adult))),
    xc.fetchJSON(xc.apiUrl(p, 'get_vod_streams'), 180000).then((r) => (step('movies'), xc.mapMovies(r, adult))),
    xc.fetchJSON(xc.apiUrl(p, 'get_series'), 180000).then((r) => (step('series'), xc.mapSeries(r, adult))),
  ]);
  catalog.setCatalog({ channels, movies, series, categories, at: Date.now() });
  emit({ type: 'progress', phase: 'saving', pct: 80 });
  await saveCatalog(p.id);
  emit({ type: 'updated', stats: catalog.stats() });
}

async function syncM3u(p: PlaylistConfig) {
  emit({ type: 'progress', phase: 'live', pct: 10 });
  const text = await xc.fetchText(String(p.url), 300000);
  emit({ type: 'progress', phase: 'movies', pct: 50 });
  const m = parseM3u(text);
  catalog.setCatalog({ channels: m.live, movies: m.movies, series: m.series, categories: m.categories, m3uEpisodes: m.episodes, at: Date.now() });
  if (!p.epgUrl && m.epgUrl) p.epgUrl = m.epgUrl;
  emit({ type: 'progress', phase: 'saving', pct: 80 });
  await saveCatalog(p.id);
  emit({ type: 'updated', stats: catalog.stats() });
}

async function syncEpg(p: PlaylistConfig) {
  const url = p.type === 'xtream' ? xc.xmltvUrl(p) : p.epgUrl;
  if (!url) return;
  emit({ type: 'progress', phase: 'epg', pct: 88 });
  const xml = await xc.fetchText(url, 180000);
  const now = Date.now() / 1000;
  const map = parseXmltv(xml, { from: now - 3 * 3600, to: now + 8 * 86400 });
  catalog.setEpg(map, Date.now());
  await saveChunks(p.id, 'epg', Array.from(map.entries()));
  await saveMeta(p.id);
  emit({ type: 'progress', phase: 'done', pct: 100 });
  emit({ type: 'updated', stats: catalog.stats() });
}

function runSync(what: 'all' | 'epg'): Promise<Stats> {
  if (syncing) return syncing;
  const p = current();
  syncing = (async () => {
    if (what === 'all') await (p.type === 'xtream' ? syncXtream(p) : syncM3u(p));
    try {
      await syncEpg(p);
    } catch (err) {
      emit({ type: 'error', message: 'epg: ' + String((err as Error).message || err) });
    }
    return catalog.stats();
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

function background(what: 'all' | 'epg') {
  runSync(what).catch((err) => emit({ type: 'error', message: String((err as Error).message || err) }));
}

const api = {
  /** Abre a lista: lê o cache (rápido) e agenda atualização se estiver velho. */
  async open(p: PlaylistConfig, filters: Filters, dev: boolean): Promise<{ hasData: boolean; stats: Stats }> {
    xc.useDevProxy(dev);
    catalog.setFilters(filters);
    if (playlist && playlist.id === p.id && catalog.hasData) {
      playlist = p;
      return { hasData: true, stats: catalog.stats() };
    }
    playlist = p;
    seriesInfoCache.clear();
    movieInfoCache.clear();
    catalog.setCatalog({ channels: [], movies: [], series: [], categories: [], at: 0 });
    catalog.setEpg(new Map(), 0);
    await user.load(p.id);
    const had = await loadSnapshot(p.id).catch(() => false);
    const st = catalog.stats();
    if (had && Date.now() - st.catalogAt > CATALOG_TTL) background('all');
    else if (had && Date.now() - st.epgAt > EPG_TTL) background('epg');
    return { hasData: had, stats: st };
  },

  sync(): Promise<Stats> {
    return runSync('all');
  },

  /** Testa a lista antes de salvar (Xtream: login na API; M3U: baixa o começo do arquivo). */
  async check(p: PlaylistConfig, dev: boolean): Promise<{ ok: boolean; message: string }> {
    xc.useDevProxy(dev);
    if (p.type === 'xtream') return xc.checkAccount(p);
    try {
      const text = await xc.fetchText(String(p.url), 60000);
      return text.indexOf('#EXTM3U') !== -1 || text.indexOf('#EXTINF') !== -1 ? { ok: true, message: 'ok' } : { ok: false, message: 'm3u' };
    } catch (err) {
      return { ok: false, message: String((err as Error).message || err) };
    }
  },

  isSyncing(): boolean {
    return !!syncing;
  },

  stats(): Stats {
    return catalog.stats();
  },

  setFilters(f: Filters) {
    catalog.setFilters(f);
  },

  categories(kind: Kind, includeHidden = false) {
    return catalog.categoriesOf(kind, includeHidden);
  },

  page(kind: Kind, category: string, sort: SortKey, cursor: string | null, limit: number) {
    return catalog.page(kind, category, sort, cursor, limit);
  },

  guide(category: string, cursor: string | null, limit: number, from: number, to: number) {
    return catalog.guide(category, cursor, limit, from, to);
  },

  miniGuide(category: string, channelId: string, from: number, to: number) {
    return catalog.miniGuide(category, channelId, from, to);
  },

  channelRow(id: string, from: number, to: number) {
    return catalog.channelRow(id, from, to);
  },

  nowNext(id: string) {
    return catalog.nowNext(id);
  },

  neighbor(id: string, category: string, step: number) {
    return catalog.neighborChannel(id, category, step);
  },

  search(q: string, limit: number) {
    return catalog.search(q, limit);
  },

  home() {
    return catalog.home();
  },

  card(kind: Kind, id: string) {
    const it = catalog.lookup(kind, id);
    return it ? catalog.card(kind, it) : null;
  },

  async movieInfo(id: number): Promise<MovieInfo | null> {
    const movie = catalog.movieById.get(id);
    if (!movie) return null;
    const cached = movieInfoCache.get(id);
    if (cached) return cached;
    const p = current();
    const info: MovieInfo =
      p.type === 'xtream'
        ? await xc.fetchMovieInfo(p, movie).catch(() => ({ movie, plot: '', cast: '', director: '', genre: '', duration: 0, backdrop: '', tmdbId: 0, trailer: '' }))
        : { movie, plot: '', cast: '', director: '', genre: '', duration: 0, backdrop: '', tmdbId: 0, trailer: '' };
    remember(movieInfoCache, id, info);
    return info;
  },

  async seriesInfo(id: number): Promise<SeriesInfo | null> {
    const series = catalog.seriesById.get(id);
    if (!series) return null;
    const cached = seriesInfoCache.get(id);
    if (cached) return cached;
    const p = current();
    let info: SeriesInfo;
    if (p.type === 'xtream') {
      info = await xc.fetchSeriesInfo(p, series);
    } else {
      const eps = (catalog.m3uEpisodes && catalog.m3uEpisodes.get(id)) || [];
      const bySeason = new Map<number, Episode[]>();
      eps.forEach((e) => bySeason.set(e.season, (bySeason.get(e.season) || []).concat(e)));
      info = { series, seasons: Array.from(bySeason.entries()).sort((a, b) => a[0] - b[0]).map(([season, episodes]) => ({ season, episodes })) };
    }
    remember(seriesInfoCache, id, info);
    return info;
  },

  /** URLs de reprodução. Canais: todas as variantes, da melhor para a pior. */
  sources(kind: 'live' | 'movie' | 'episode', id: string, format: 'ts' | 'm3u8', ext = '', url = ''): PlaySource[] {
    const p = current();
    if (kind === 'live') {
      const ch = catalog.channelById.get(id);
      if (!ch) return [];
      return ch.variants.map((v) => ({ url: v.url || xc.liveUrl(p, v.streamId, format), quality: v.quality, streamId: v.streamId }));
    }
    if (kind === 'movie') {
      const m = catalog.movieById.get(Number(id));
      if (!m) return [];
      return [{ url: m.url || xc.movieUrl(p, m.id, m.ext), quality: '', streamId: m.id }];
    }
    return [{ url: url || xc.episodeUrl(p, id, ext), quality: '', streamId: Number(id) }];
  },

  toggleFav(kind: Kind, id: string): boolean {
    return user.toggleFav(kind[0] + ':' + id);
  },

  isFav(kind: Kind, id: string): boolean {
    return user.isFav(kind[0] + ':' + id);
  },

  saveProgress(p: Progress) {
    user.saveProgress(p);
  },

  getProgress(key: string): Progress | null {
    return user.getProgress(key) || null;
  },

  seriesProgress(seriesId: number): Progress[] {
    return user.seriesProgress(seriesId);
  },

  touchChannel(id: string) {
    user.touchChannel(id);
  },

  // ---------- TMDB (opcional; nunca lança erro: sem dados = null) ----------

  setTmdb(key: string, locale: string) {
    configureTmdb(key, locale);
  },

  async tmdbMovieView(movieId: number): Promise<TmdbView | null> {
    const movie = catalog.movieById.get(movieId);
    if (!movie || !tmdbEnabled()) return null;
    try {
      const info = await api.movieInfo(movieId);
      const d = await tmdbMovie(info ? info.tmdbId : 0, movie.name, movie.year);
      return d ? { ...d, similar: catalog.matchRecommendations('movie', d.recommendations, movie.id) } : null;
    } catch {
      return null;
    }
  },

  async tmdbSeriesView(seriesId: number): Promise<TmdbView | null> {
    const s = catalog.seriesById.get(seriesId);
    if (!s || !tmdbEnabled()) return null;
    try {
      const d = await tmdbSeries(s.name, s.year);
      return d ? { ...d, similar: catalog.matchRecommendations('series', d.recommendations, s.id) } : null;
    } catch {
      return null;
    }
  },

  tmdbSeasonView(tvId: number, season: number) {
    return tmdbSeason(tvId, season).catch(() => null);
  },

  markSeriesSeen(seriesId: number) {
    user.markSeriesSeen(seriesId);
  },

  /** Configurações › Histórico. */
  clearHistory(what: 'movie' | 'episode' | 'channels' | 'all') {
    if (what === 'channels' || what === 'all') user.clearRecentChannels();
    if (what !== 'channels') user.clearProgress(what === 'all' ? 'all' : what);
    user.flush();
  },

  channelQuality(id: string): Quality | null {
    return user.state.channelQuality[id] || null;
  },

  setChannelQuality(id: string, q: Quality) {
    user.setChannelQuality(id, q);
  },

  storageMB(): Promise<number> {
    return estimateUsageMB();
  },

  async removePlaylist(pid: string) {
    if (playlist && playlist.id === pid) {
      playlist = null;
      catalog.setCatalog({ channels: [], movies: [], series: [], categories: [], at: 0 });
    }
    await deletePlaylistData(pid);
  },

  flush() {
    user.flush();
  },
};

export type Api = typeof api;

ctx.onmessage = (e: MessageEvent) => {
  const { id, method, args } = e.data as { id: number; method: keyof Api; args: unknown[] };
  Promise.resolve()
    .then(() => (api[method] as (...a: unknown[]) => unknown)(...args))
    .then(
      (result) => ctx.postMessage({ id, result }),
      (err) => ctx.postMessage({ id, error: String((err && err.message) || err) }),
    );
};
