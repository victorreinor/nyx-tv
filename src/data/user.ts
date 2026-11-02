// Favoritos, progresso ("continuar assistindo") e preferências aprendidas por canal.
// Tudo em um registro por lista no IndexedDB, gravado com debounce.
import { loadRecord, saveRecord } from './store';
import type { Progress, Quality } from './types';

export interface UserState {
  favorites: Record<string, number>; // l:<canal> | m:<filme> | s:<série> → adicionado em
  progress: Record<string, Progress>; // m:<filme> | e:<episódio>
  recentChannels: string[];
  channelQuality: Record<string, Quality>; // escolha manual ou aprendida (troca automática)
  seenSeries: Record<string, number>; // série → quando você abriu ela por último (s)
}

const empty = (): UserState => ({ favorites: {}, progress: {}, recentChannels: [], channelQuality: {}, seenSeries: {} });

/** Abaixo disso não conta como começado; acima disso conta como assistido. */
export const STARTED = 0.03;
export const WATCHED = 0.92;

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

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pid) saveRecord('user', this.pid, this.state).catch(() => undefined);
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

  saveProgress(p: Progress) {
    this.state.progress[p.key] = p;
    this.seriesIndex = null;
    this.persist();
  }

  latestForSeries(seriesId: number): Progress | undefined {
    if (!this.seriesIndex) {
      const map = new Map<number, Progress>();
      const all = this.state.progress;
      for (const k in all) {
        const p = all[k];
        if (!p.seriesId) continue;
        const cur = map.get(p.seriesId);
        if (!cur || p.updatedAt > cur.updatedAt) map.set(p.seriesId, p);
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

  /** Abriu a série: os episódios que existem agora deixam de ser "novos". */
  markSeriesSeen(seriesId: number) {
    this.state.seenSeries[String(seriesId)] = Date.now() / 1000;
    this.persist();
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
