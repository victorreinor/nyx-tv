// Catálogo em memória dentro do worker: listas ordenadas em cache, páginas keyset,
// grade por janela e busca. A UI só recebe CardItem/ChannelRow de cada página.
import { programsInRange } from './epg';
import { displayTitle, searchKey, tmdbImage, versionTags } from './normalize';
import { compareBy, keysetPage, type SortSpec } from './paging';
import { rankMatches } from './search';
import type {
  CardItem,
  Category,
  Channel,
  ChannelRow,
  Episode,
  Filters,
  HomeData,
  Kind,
  Movie,
  Page,
  Program,
  SearchResult,
  Series,
  SortKey,
  Stats,
} from './types';
import { isStarted, WATCHED, type UserStore } from './user';

type Item = Channel | Movie | Series;

export interface CatalogData {
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  categories: Category[];
  m3uEpisodes?: Map<number, Episode[]> | null;
  at: number;
}

const FAV_PREFIX: Record<Kind, string> = { live: 'l:', movie: 'm:', series: 's:' };
/** Listas ordenadas guardadas (LRU): cada categoria visitada custa um array de referências. */
const MAX_CACHED_LISTS = 16;

export class Catalog {
  channels: Channel[] = [];
  movies: Movie[] = [];
  series: Series[] = [];
  categories: Category[] = [];
  epg = new Map<string, Program[]>();
  m3uEpisodes: Map<number, Episode[]> | null = null;
  catalogAt = 0;
  epgAt = 0;
  filters: Filters = { hideAdult: true, hiddenCategories: [] };

  channelById = new Map<string, Channel>();
  movieById = new Map<number, Movie>();
  seriesById = new Map<number, Series>();
  private cache = new Map<string, Item[]>();
  private hidden = new Set<string>();
  private keys: Record<Kind, string[]> = { live: [], movie: [], series: [] };
  private titleIndex: Partial<Record<Kind, Map<string, Item[]>>> = {};

  constructor(private user: UserStore) {}

  get hasData(): boolean {
    return this.catalogAt > 0;
  }

  setCatalog(d: CatalogData) {
    this.channels = d.channels;
    this.movies = d.movies;
    this.series = d.series;
    this.categories = d.categories;
    this.m3uEpisodes = d.m3uEpisodes || null;
    this.catalogAt = d.at;
    this.channelById = new Map(d.channels.map((c) => [c.id, c] as [string, Channel]));
    this.movieById = new Map(d.movies.map((m) => [m.id, m] as [number, Movie]));
    this.seriesById = new Map(d.series.map((s) => [s.id, s] as [number, Series]));
    this.keys = { live: d.channels.map((c) => c.key), movie: d.movies.map((m) => m.key), series: d.series.map((s) => s.key) };
    this.titleIndex = {};
    const counts = new Map<string, number>();
    const count = (list: Item[]) => list.forEach((it) => it.categories.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1)));
    count(d.channels);
    count(d.movies);
    count(d.series);
    this.categories.forEach((c) => (c.count = counts.get(c.id) || 0));
    this.cache.clear();
  }

  private epgUntil = 0;

  setEpg(map: Map<string, Program[]>, at: number) {
    this.epg = map;
    this.epgAt = at;
    let until = 0;
    map.forEach((list) => {
      const last = list[list.length - 1];
      if (last && last.stop > until) until = last.stop;
    });
    this.epgUntil = until;
  }

  /** Tira da memória programas que já acabaram há mais de 3 h (a grade não volta tanto). */
  pruneEpg(now = Date.now() / 1000) {
    const limit = now - 3 * 3600;
    this.epg.forEach((list, key) => {
      let i = 0;
      while (i < list.length && list[i].stop < limit) i++;
      if (i) this.epg.set(key, list.slice(i));
    });
  }

  setFilters(f: Filters) {
    this.filters = f;
    this.hidden = new Set(f.hiddenCategories);
    this.cache.clear();
  }

  stats(): Stats {
    return {
      live: this.channels.length,
      movies: this.movies.length,
      series: this.series.length,
      epgChannels: this.epg.size,
      epgUntil: this.epgUntil,
      catalogAt: this.catalogAt,
      epgAt: this.epgAt,
    };
  }

  private visible = (it: Item): boolean => {
    if (this.filters.hideAdult && it.adult) return false;
    if (!this.hidden.size || !it.categories.length) return true;
    for (const c of it.categories) if (!this.hidden.has(c)) return true;
    return false;
  };

  /** Categorias para navegar (sem as ocultas e, se ativo, sem adultas). */
  categoriesOf(kind: Kind, includeHidden = false): Category[] {
    return this.categories.filter(
      (c) => c.kind === kind && c.count > 0 && !(this.filters.hideAdult && c.adult) && (includeHidden || !this.hidden.has(c.id)),
    );
  }

  private source(kind: Kind): Item[] {
    return kind === 'live' ? this.channels : kind === 'movie' ? this.movies : this.series;
  }

  private spec(kind: Kind, sort: SortKey): SortSpec<Item> {
    const id = (it: Item) => it.id;
    if (sort === 'name') return { value: (it) => (it as Movie).key || '', id, dir: 1 };
    if (kind === 'live' || sort === 'num') return { value: (it) => (it as Channel).num || 0, id, dir: 1 };
    if (sort === 'rating') return { value: (it) => (it as Movie).rating || 0, id, dir: -1 };
    return { value: (it) => (it as Movie).added || 0, id, dir: -1 };
  }

  /** Progresso de um item (filme: o próprio; série: o último episódio mexido). */
  private progressOf(kind: Kind, it: Item) {
    if (kind === 'movie') return this.user.getProgress('m:' + it.id);
    if (kind === 'series') return this.user.latestForSeries(it.id as number);
    return undefined;
  }

  /** Abas "Continuar assistindo" e "Assistidos": ordem por quando você viu por último. */
  private historyList(kind: Kind, category: 'continue' | 'watched'): { items: Item[]; spec: SortSpec<Item> } {
    const when = new Map<string | number, number>();
    const items = this.source(kind).filter((it) => {
      if (!this.visible(it)) return false;
      const p = this.progressOf(kind, it);
      if (!p || !p.duration) return false;
      const pct = p.position / p.duration;
      const done = pct >= WATCHED && !(kind === 'series' && p.next);
      const keep = category === 'watched' ? done : isStarted(p) && !done;
      if (keep) when.set(it.id, p.updatedAt);
      return keep;
    });
    const spec: SortSpec<Item> = { value: (it) => when.get(it.id) || 0, id: (it) => it.id, dir: -1 };
    return { items: items.sort(compareBy(spec)), spec };
  }

  private list(kind: Kind, category: string, sort: SortKey): Item[] {
    const key = `${kind}|${category}|${sort}`;
    const dynamic = category === 'fav' || (kind === 'live' && category === 'recent');
    const cached = !dynamic && this.cache.get(key);
    if (cached) {
      // LRU: a mais usada vai para o fim
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    let items: Item[];
    if (category === 'fav') {
      items = this.user
        .favKeys(FAV_PREFIX[kind])
        .map((id) => this.lookup(kind, id))
        .filter((it): it is Item => !!it && this.visible(it));
    } else if (category === 'recent' && kind === 'live') {
      items = this.user.state.recentChannels.map((id) => this.channelById.get(id)).filter((it): it is Channel => !!it && this.visible(it));
      return items;
    } else if (category === 'recent') {
      items = this.source(kind)
        .filter(this.visible)
        .sort(compareBy(this.spec(kind, 'added')))
        .slice(0, 200);
    } else if (category === 'all') {
      items = this.source(kind).filter(this.visible);
    } else {
      items = this.source(kind).filter((it) => it.categories.indexOf(category) !== -1 && !(this.filters.hideAdult && it.adult));
    }
    items.sort(compareBy(this.spec(kind, sort)));
    if (!dynamic) {
      this.cache.set(key, items);
      if (this.cache.size > MAX_CACHED_LISTS) this.cache.delete(this.cache.keys().next().value as string);
    }
    return items;
  }

  /**
   * "Semelhantes que você tem": recomendações do TMDB que EXISTEM no seu catálogo
   * (mesmo título, traduzido ou original, e ano próximo).
   */
  matchRecommendations(kind: 'movie' | 'series', recs: { title: string; original: string; year: number }[], excludeId: number): CardItem[] {
    let idx = this.titleIndex[kind];
    if (!idx) {
      idx = new Map();
      for (const it of this.source(kind)) {
        const k = searchKey(displayTitle(it.name));
        const list = idx.get(k);
        if (list) list.push(it);
        else idx.set(k, [it]);
      }
      this.titleIndex[kind] = idx;
    }
    const out: CardItem[] = [];
    const seen = new Set<string | number>([excludeId]);
    for (const r of recs) {
      for (const name of [r.title, r.original]) {
        const cands = (name && idx.get(searchKey(name))) || [];
        const hit = cands.find((c) => !seen.has(c.id) && this.visible(c) && (!r.year || !(c as Movie).year || Math.abs((c as Movie).year - r.year) <= 1));
        if (hit) {
          seen.add(hit.id);
          out.push(this.card(kind, hit));
          break;
        }
      }
      if (out.length >= 15) break;
    }
    return out;
  }

  lookup(kind: Kind, id: string): Item | undefined {
    if (kind === 'live') return this.channelById.get(id);
    if (kind === 'movie') return this.movieById.get(Number(id));
    return this.seriesById.get(Number(id));
  }

  page(kind: Kind, category: string, sort: SortKey, cursor: string | null, limit: number): Page<CardItem> {
    const history = (category === 'continue' || category === 'watched') && kind !== 'live' ? this.historyList(kind, category) : null;
    const list = history ? history.items : this.list(kind, category, sort);
    const { items, next } = keysetPage(list, history ? history.spec : this.spec(kind, sort), cursor, limit);
    const now = Date.now() / 1000;
    return { items: items.map((it) => this.card(kind, it, now)), next, total: list.length };
  }

  card(kind: Kind, it: Item, now = Date.now() / 1000): CardItem {
    if (kind === 'live') {
      const ch = it as Channel;
      const cur = this.nowNext(ch.id, now).now;
      return { kind, id: ch.id, title: ch.name, image: ch.logo, sub: cur ? cur.title : '', badges: ch.variants.map((v) => v.quality).filter(uniqueQuality) };
    }
    if (kind === 'movie') {
      const m = it as Movie;
      const p = this.user.getProgress('m:' + m.id);
      const progress = p && p.duration ? p.position / p.duration : 0;
      return {
        kind,
        id: String(m.id),
        title: displayTitle(m.name),
        image: tmdbImage(m.poster, 'w342'),
        sub: m.year ? String(m.year) : '',
        progress: p && isStarted(p) && progress < WATCHED ? progress : undefined,
        watched: progress >= WATCHED,
        versions: versionTags(m.name),
      };
    }
    const s = it as Series;
    const p = this.user.latestForSeries(s.id);
    const baseline = this.user.seriesBaseline(s.id);
    const pct = p && p.duration ? p.position / p.duration : 0;
    const finished = pct >= WATCHED;
    const at = p ? (finished && p.next ? { s: p.next.season, e: p.next.episode } : { s: p.season || 1, e: p.episode || 1 }) : null;
    return {
      kind,
      id: String(s.id),
      title: displayTitle(s.name),
      image: tmdbImage(s.poster, 'w342'),
      backdrop: tmdbImage(s.backdrop, 'w1280'),
      sub: [s.year || '', s.genre.split(',')[0]].filter(Boolean).join(' · '),
      tag: at ? `${at.s}|${at.e}` : undefined,
      progress: p && !finished && isStarted(p) ? pct : undefined,
      watched: !!p && finished && !p.next,
      newEpisode: baseline > 0 && s.added > baseline,
      versions: versionTags(s.name),
    };
  }

  nowNext(channelId: string, now = Date.now() / 1000): { now?: Program; next?: Program } {
    const ch = this.channelById.get(channelId);
    const list = ch && ch.epgId ? this.epg.get(ch.epgId) : undefined;
    const range = programsInRange(list, now, now + 6 * 3600);
    const cur = range[0] && range[0].start <= now ? range[0] : undefined;
    return { now: cur, next: cur ? range[1] : range[0] };
  }

  private row(ch: Channel, from: number, to: number): ChannelRow {
    return {
      id: ch.id,
      num: ch.num,
      name: ch.name,
      logo: ch.logo,
      qualities: ch.variants.map((v) => v.quality).filter(uniqueQuality),
      fav: this.user.isFav('l:' + ch.id),
      programs: ch.epgId ? programsInRange(this.epg.get(ch.epgId), from, to) : [],
    };
  }

  /** Grade: página de canais + programas dentro da janela de tempo. */
  guide(category: string, cursor: string | null, limit: number, from: number, to: number): Page<ChannelRow> {
    const list = this.list('live', category, 'num') as Channel[];
    const { items, next } = keysetPage(list as Item[], this.spec('live', 'num'), cursor, limit);
    return { items: (items as Channel[]).map((ch) => this.row(ch, from, to)), next, total: list.length };
  }

  /** Lista de canais da categoria; se o canal não estiver nela (ou ela vier vazia), usa todos. */
  private liveListWith(category: string, channelId: string): Channel[] {
    const list = this.list('live', category, 'num') as Channel[];
    return list.some((c) => c.id === channelId) ? list : (this.list('live', 'all', 'num') as Channel[]);
  }

  /** Mini-grade do player: canais da categoria só com agora/a seguir + posição do canal atual. */
  miniGuide(category: string, channelId: string, from: number, to: number): { rows: ChannelRow[]; index: number } {
    const list = this.liveListWith(category, channelId);
    const rows = list.map((ch) => {
      const r = this.row(ch, from, to);
      r.programs = r.programs.slice(0, 2);
      return r;
    });
    return { rows, index: Math.max(0, list.findIndex((c) => c.id === channelId)) };
  }

  channelRow(id: string, from: number, to: number): ChannelRow | null {
    const ch = this.channelById.get(id);
    return ch ? this.row(ch, from, to) : null;
  }

  /** Vizinho na lista atual (CH▲/CH▼ no player). */
  neighborChannel(id: string, category: string, step: number): string | null {
    const list = this.liveListWith(category, id);
    const i = list.findIndex((c) => c.id === id);
    if (i === -1 || !list.length) return null;
    return String(list[(i + step + list.length) % list.length].id);
  }

  search(q: string, limit: number): SearchResult {
    const t0 = Date.now();
    const run = <T extends Item>(kind: Kind, list: T[]) =>
      rankMatches(this.keys[kind], q, limit, (i) => this.visible(list[i])).map((i) => this.card(kind, list[i]));
    const live = run('live', this.channels);
    const movies = run('movie', this.movies);
    const series = run('series', this.series);
    return { live, movies, series, total: live.length + movies.length + series.length, ms: Date.now() - t0 };
  }

  continueItems(limit: number): CardItem[] {
    const out: CardItem[] = [];
    const seenSeries = new Set<number>();
    for (const p of this.user.recentProgress()) {
      if (out.length >= limit) break;
      const pct = p.duration ? p.position / p.duration : 0;
      if (p.kind === 'movie') {
        const m = this.movieById.get(Number(p.id));
        if (!m || !this.visible(m) || !isStarted(p) || pct >= WATCHED) continue;
        out.push({ ...this.card('movie', m), sub: remaining(p), progress: pct, resume: { position: p.position } });
        continue;
      }
      if (!p.seriesId || seenSeries.has(p.seriesId)) continue;
      seenSeries.add(p.seriesId);
      const s = this.seriesById.get(p.seriesId);
      if (!s || !this.visible(s)) continue;
      const base = this.card('series', s);
      if (pct < WATCHED) {
        if (!isStarted(p)) continue;
        out.push({ ...base, sub: `T${p.season} E${p.episode} · ${remaining(p)}`, progress: pct, resume: { episodeId: p.id, season: p.season, episode: p.episode, ext: p.ext, position: p.position } });
      } else if (p.next) {
        out.push({ ...base, sub: `T${p.next.season} E${p.next.episode}`, progress: 0, resume: { episodeId: p.next.id, season: p.next.season, episode: p.next.episode, ext: p.next.ext, position: 0 } });
      }
    }
    return out;
  }

  home(): HomeData {
    const now = Date.now() / 1000;
    const continueItems = this.continueItems(20);
    const favIds = this.user.favKeys('l:');
    const ids = favIds.length ? favIds : this.user.state.recentChannels;
    const favChannels = ids
      .map((id) => this.channelById.get(id))
      .filter((c): c is Channel => !!c && this.visible(c))
      .slice(0, 20)
      .map((c) => this.row(c, now, now + 3600));
    const recentMovies = this.page('movie', 'recent', 'added', null, 20).items;
    const recentSeries = this.page('series', 'recent', 'added', null, 20).items;
    // séries que você acompanha (favorita, assistiu ou abriu) e ganharam episódio depois disso
    const newEpisodes = this.series
      .filter((s) => this.visible(s) && this.user.seriesBaseline(s.id) > 0 && s.added > this.user.seriesBaseline(s.id))
      .sort((a, b) => b.added - a.added)
      .slice(0, 20)
      .map((s) => this.card('series', s));
    const hero = continueItems[0] || recentSeries.find((s) => !!s.backdrop) || recentMovies[0] || null;
    return { hero, continueItems, newEpisodes, favChannels, recentMovies, recentSeries };
  }
}

function uniqueQuality<T>(q: T, i: number, arr: T[]): boolean {
  return arr.indexOf(q) === i;
}

function remaining(p: { position: number; duration: number }): string {
  const min = Math.max(1, Math.round((p.duration - p.position) / 60));
  return min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}
