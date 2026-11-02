// Favoritos, progresso ("continuar assistindo") e preferências aprendidas por canal.
// Tudo em um registro por lista no IndexedDB, gravado com debounce.
import { loadRecord, saveRecord } from './store';
import type { Progress, Quality } from './types';

export interface UserState {
  favorites: Record<string, number>; // l:<canal> | m:<filme> | s:<série> → adicionado em
  progress: Record<string, Progress>; // m:<filme> | e:<episódio>
  recentChannels: string[];
  channelQuality: Record<string, Quality>; // escolha manual ou aprendida (troca automática)
}

const empty = (): UserState => ({ favorites: {}, progress: {}, recentChannels: [], channelQuality: {} });

/** Abaixo disso não conta como começado; acima disso conta como assistido. */
export const STARTED = 0.03;
export const WATCHED = 0.92;

export class UserStore {
  state: UserState = empty();
  private pid = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  async load(pid: string) {
    this.flush();
    this.pid = pid;
    const saved = await loadRecord<UserState>('user', pid);
    this.state = { ...empty(), ...(saved || {}) };
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
