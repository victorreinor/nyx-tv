// Favoritos, progresso ("continuar assistindo") e preferências aprendidas por canal.
// Tudo em um registro por lista no IndexedDB, gravado com debounce.
import { loadRecord, saveRecord } from './store';
import type { Progress, Quality } from './types';
import { episodeKey, type EpisodeRef, type NewEpisodes } from './newEpisodes';

export interface UserState {
  favorites: Record<string, number>; // l:<canal> | m:<filme> | s:<série> → adicionado em
  progress: Record<string, Progress>; // m:<filme> | e:<episódio>
  recentChannels: string[];
  channelQuality: Record<string, Quality>; // escolha manual ou aprendida (troca automática)
  seenSeries: Record<string, number>; // série → quando você abriu ela por último (s)
  /** Episódios que existiam quando você abriu a série (referência do "novo episódio"). */
  seenEpisodes: Record<string, EpisodeRef>;
  /** Conferência do "novo episódio" contra a lista de episódios do provedor, por `series.added`. */
  newEpisodes: Record<string, NewEpisodes>;
}

const empty = (): UserState => ({ favorites: {}, progress: {}, recentChannels: [], channelQuality: {}, seenSeries: {}, seenEpisodes: {}, newEpisodes: {} });

/** Abaixo disso não conta como começado; acima disso conta como assistido. */
export const STARTED = 0.03;
export const WATCHED = 0.92;
/** Ou começou por tempo: 30 s já entra no "continuar assistindo" (3% de um filme de 2 h seriam 3,6 min). */
export const STARTED_S = 30;

export function isStarted(p: { position: number; duration: number }): boolean {
  return p.position >= STARTED_S || (!!p.duration && p.position / p.duration >= STARTED);
}

/**
 * Qual progresso representa a série: o episódio começado mais recente. Um episódio aberto por
 * poucos segundos não toma o lugar do que você estava assistindo (ou terminou).
 * Única regra: capa, Início, abas e página da série usam esta.
 */
export function moreRelevant(p: Progress, cur: Progress | null | undefined): boolean {
  if (!cur) return true;
  return isStarted(p) !== isStarted(cur) ? isStarted(p) : p.updatedAt > cur.updatedAt;
}

export class UserStore {
  state: UserState = empty();
  private pid = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Último progresso de cada série (para a capa mostrar "T2 E5"). Refeito quando o progresso muda. */
  private seriesIndex: Map<number, Progress> | null = null;

  async load(pid: string) {
    this.flush();
    this.pid = pid;
    const saved = await loadRecord<UserState>('user', pid);
    this.state = { ...empty(), ...(saved || {}) };
    this.seriesIndex = null;
  }

  private persist() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 800);
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this.pid ? saveRecord('user', this.pid, this.state).catch(() => undefined) : Promise.resolve();
  }

  isFav(key: string): boolean {
    return key in this.state.favorites;
  }

  toggleFav(key: string): boolean {
    const on = !this.isFav(key);
    if (on) this.state.favorites[key] = Date.now();
    else delete this.state.favorites[key];
    this.persist();
    return on;
  }

  favKeys(prefix: string): string[] {
    const fav = this.state.favorites;
    return Object.keys(fav)
      .filter((k) => k.indexOf(prefix) === 0)
      .sort((a, b) => fav[b] - fav[a])
      .map((k) => k.slice(prefix.length));
  }

  /** `now` grava na hora (saindo do player/do app). Nunca troca um progresso mais novo por um velho. */
  saveProgress(p: Progress, now = false): Promise<void> {
    const cur = this.state.progress[p.key];
    if (cur && cur.updatedAt > p.updatedAt) return Promise.resolve();
    this.state.progress[p.key] = p;
    this.seriesIndex = null;
    if (now) return this.flush();
    this.persist();
    return Promise.resolve();
  }

  latestForSeries(seriesId: number): Progress | undefined {
    if (!this.seriesIndex) {
      const map = new Map<number, Progress>();
      const all = this.state.progress;
      for (const k in all) {
        const p = all[k];
        if (!p.seriesId) continue;
        if (moreRelevant(p, map.get(p.seriesId))) map.set(p.seriesId, p);
      }
      this.seriesIndex = map;
    }
    return this.seriesIndex.get(seriesId);
  }

  /** Configurações › Histórico. Favoritos nunca são apagados aqui. */
  clearProgress(kind: 'movie' | 'episode' | 'all') {
    const all = this.state.progress;
    for (const k in all) if (kind === 'all' || all[k].kind === kind) delete all[k];
    this.seriesIndex = null;
    this.persist();
  }

  /** O progresso mudou por fora do player (ids reencontrados pelo título). */
  progressChanged() {
    this.seriesIndex = null;
    this.persist();
  }

  /** Esquece a referência de "novo episódio" de séries que saíram do catálogo (o registro não cresce para sempre). */
  pruneSeries(exists: (id: number) => boolean) {
    for (const map of [this.state.seenEpisodes, this.state.newEpisodes]) for (const id of Object.keys(map)) if (!exists(Number(id))) delete map[id];
    this.persist();
  }

  /** Abriu a série: os episódios que existem agora deixam de ser "novos". */
  markSeriesSeen(seriesId: number) {
    this.state.seenSeries[String(seriesId)] = Date.now() / 1000;
    this.persist();
  }

  setSeenEpisodes(seriesId: number, ref: EpisodeRef) {
    this.state.seenEpisodes[String(seriesId)] = ref;
    this.persist();
  }

  setNewEpisodes(seriesId: number, v: NewEpisodes) {
    this.state.newEpisodes[String(seriesId)] = v;
    this.persist();
  }

  /** Último episódio que você conhece da série: o maior entre o que existia ao abrir e o que assistiu. */
  knownEpisodes(seriesId: number): EpisodeRef | null {
    const seen = this.state.seenEpisodes[String(seriesId)];
    let top = seen ? seen.top : 0;
    const all = this.state.progress;
    for (const k in all) if (all[k].seriesId === seriesId) top = Math.max(top, episodeKey(all[k]));
    return top ? { top, n: seen ? seen.n : 0 } : null;
  }

  /**
   * Desde quando a série é "conhecida": abriu, favoritou ou assistiu algo dela (o mais recente).
   * 0 = você não acompanha a série (sem selo de novidade).
   */
  seriesBaseline(seriesId: number): number {
    const fav = this.state.favorites['s:' + seriesId];
    const p = this.latestForSeries(seriesId);
    return Math.max(this.state.seenSeries[String(seriesId)] || 0, fav ? fav / 1000 : 0, p ? p.updatedAt / 1000 : 0);
  }

  clearRecentChannels() {
    this.state.recentChannels = [];
    this.persist();
  }

  getProgress(key: string): Progress | undefined {
    return this.state.progress[key];
  }

  /** Progresso de todos os episódios de uma série. */
  seriesProgress(seriesId: number): Progress[] {
    const out: Progress[] = [];
    const all = this.state.progress;
    for (const k in all) if (all[k].seriesId === seriesId) out.push(all[k]);
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  recentProgress(): Progress[] {
    const all = this.state.progress;
    return Object.keys(all)
      .map((k) => all[k])
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  touchChannel(id: string) {
    const list = this.state.recentChannels.filter((c) => c !== id);
    list.unshift(id);
    this.state.recentChannels = list.slice(0, 30);
    this.persist();
  }

  setChannelQuality(id: string, q: Quality) {
    this.state.channelQuality[id] = q;
    this.persist();
  }
}
