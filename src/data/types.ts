// Tipos compartilhados entre a UI (thread principal) e o worker de dados.

export type Kind = 'live' | 'movie' | 'series';
export type Quality = '4K' | 'FHD' | 'HD' | 'SD' | '';
export type SortKey = 'added' | 'name' | 'rating' | 'num';

export interface PlaylistConfig {
  id: string;
  name: string;
  type: 'xtream' | 'm3u';
  host?: string;
  username?: string;
  password?: string;
  url?: string;
  epgUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  count: number;
  adult: boolean;
}

/** Uma das qualidades (ou fontes reserva) de um canal agrupado. */
export interface Variant {
  streamId: number;
  quality: Quality;
  name: string;
  url?: string; // listas M3U já trazem a URL pronta
}

/** Canal agrupado: SD/HD/FHD/4K do mesmo canal viram um só. */
export interface Channel {
  id: string;
  num: number;
  name: string;
  logo: string;
  epgId: string;
  categories: string[];
  variants: Variant[];
  adult: boolean;
  key: string; // nome normalizado para busca
}

export interface Movie {
  id: number;
  name: string;
  poster: string;
  year: number;
  rating: number;
  added: number;
  categories: string[];
  ext: string;
  adult: boolean;
  key: string;
  url?: string;
}

export interface Series {
  id: number;
  name: string;
  poster: string;
  backdrop: string;
  year: number;
  rating: number;
  added: number;
  categories: string[];
  plot: string;
  genre: string;
  adult: boolean;
  key: string;
}

/** Programa da grade. Horários em segundos (epoch). */
export interface Program {
  start: number;
  stop: number;
  title: string;
  desc: string;
}

export interface Episode {
  id: string;
  season: number;
  episode: number;
  title: string;
  ext: string;
  duration: number;
  plot: string;
  image: string;
  url?: string;
}

export interface Season {
  season: number;
  episodes: Episode[];
}

export interface SeriesInfo {
  series: Series;
  seasons: Season[];
}

export interface MovieInfo {
  movie: Movie;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  duration: number;
  backdrop: string;
}

/** Item pronto para um card. A UI nunca recebe a lista inteira, só páginas disso. */
export interface CardItem {
  kind: Kind;
  id: string;
  title: string;
  image: string;
  backdrop?: string;
  sub?: string;
  progress?: number; // 0..1
  badges?: Quality[];
  resume?: Resume;
  /** Selo na capa: episódio onde parou ("T2 E5"). */
  tag?: string;
  watched?: boolean;
}

export interface Resume {
  episodeId?: string;
  season?: number;
  episode?: number;
  ext?: string;
  position: number; // segundos
}

export interface ChannelRow {
  id: string;
  num: number;
  name: string;
  logo: string;
  qualities: Quality[];
  fav: boolean;
  programs: Program[];
}

export interface Page<T> {
  items: T[];
  next: string | null;
  total: number;
}

export interface Progress {
  key: string; // m:<id> | e:<id>
  kind: 'movie' | 'episode';
  id: string;
  seriesId?: number;
  season?: number;
  episode?: number;
  position: number;
  duration: number;
  updatedAt: number;
  title: string;
  image: string;
  /** Próximo episódio, gravado pelo player para o "continuar assistindo" pular para ele. */
  next?: { id: string; season: number; episode: number; ext: string; title: string };
  ext?: string;
}

export interface Stats {
  live: number;
  movies: number;
  series: number;
  epgChannels: number;
  /** Fim da grade disponível (segundos). */
  epgUntil: number;
  catalogAt: number;
  epgAt: number;
}

export interface SearchResult {
  live: CardItem[];
  movies: CardItem[];
  series: CardItem[];
  total: number;
  ms: number;
}

export interface HomeData {
  hero: CardItem | null;
  continueItems: CardItem[];
  favChannels: ChannelRow[];
  recentMovies: CardItem[];
  recentSeries: CardItem[];
}

export interface PlaySource {
  url: string;
  quality: Quality;
  streamId: number;
}

export interface Filters {
  hideAdult: boolean;
  hiddenCategories: string[];
}

export type SyncPhase = 'categories' | 'live' | 'movies' | 'series' | 'epg' | 'saving' | 'done';

export type WorkerEvent =
  | { type: 'progress'; phase: SyncPhase; pct: number }
  | { type: 'updated'; stats: Stats }
  | { type: 'error'; message: string };
