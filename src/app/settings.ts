// Preferências do usuário, persistidas no localStorage da TV (pequeno e síncrono no boot).
import { createStore, unwrap } from 'solid-js/store';
import type { Filters, PlaylistConfig, Quality } from '../data/types';
import type { Aspect } from '../player/engine';

export type QualityPref = 'auto' | Exclude<Quality, ''>;

export interface Reminder {
  channelId: string;
  channelName: string;
  start: number; // s
  stop: number; // s
  title: string;
}

export interface Settings {
  locale: 'pt-BR' | 'en' | 'es';
  pin: string;
  hideAdult: boolean;
  hiddenCategories: string[];
  quality: QualityPref;
  autoQuality: boolean;
  streamFormat: 'ts' | 'm3u8';
  /** Proporção da imagem no player (vale para todos os vídeos). */
  aspect: Aspect;
  /** Buffer do player em segundos (0 = automático, a TV decide). */
  buffer: number;
  /** Segundos antes do fim em que aparece o botão "Próximo episódio" (0 = desligado). */
  nextEpisodeAt: number;
  playlists: PlaylistConfig[];
  activePlaylist: string | null;
  recentSearches: string[];
  reminders: Reminder[];
  /** Chave v3 do TMDB (opcional). Sem chave ou desligado = só dados do provedor. */
  tmdbKey: string;
  tmdbEnabled: boolean;
}

const KEY = 'nyx:settings';

function detectLocale(): Settings['locale'] {
  const l = (navigator.language || 'pt-BR').toLowerCase();
  if (l.indexOf('pt') === 0) return 'pt-BR';
  if (l.indexOf('es') === 0) return 'es';
  return 'en';
}

const defaults: Settings = {
  locale: detectLocale(),
  pin: '0000',
  hideAdult: true,
  hiddenCategories: [],
  quality: 'FHD',
  autoQuality: true,
  streamFormat: 'ts',
  aspect: 'fit',
  buffer: 0,
  nextEpisodeAt: 60,
  playlists: [],
  activePlaylist: null,
  recentSearches: [],
  reminders: [],
  tmdbKey: '',
  tmdbEnabled: true,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

const [settings, setStore] = createStore<Settings>(load());

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(unwrap(settings)));
  } catch {
    // armazenamento cheio/bloqueado: segue só em memória
  }
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  setStore(key, value as any);
  save();
}

export function activePlaylist(): PlaylistConfig | null {
  return settings.playlists.find((p) => p.id === settings.activePlaylist) || settings.playlists[0] || null;
}

export function upsertPlaylist(p: PlaylistConfig) {
  const list = settings.playlists.filter((x) => x.id !== p.id).concat(p);
  setStore('playlists', list);
  if (!settings.activePlaylist) setStore('activePlaylist', p.id);
  save();
}

export function removePlaylistSetting(id: string) {
  setStore('playlists', settings.playlists.filter((x) => x.id !== id));
  if (settings.activePlaylist === id) setStore('activePlaylist', settings.playlists[0] ? settings.playlists[0].id : null);
  save();
}

const sameReminder = (a: Reminder, channelId: string, start: number) => a.channelId === channelId && a.start === start;

export function hasReminder(channelId: string, start: number): boolean {
  return settings.reminders.some((r) => sameReminder(r, channelId, start));
}

/** Liga/desliga o lembrete. Retorna se ficou ligado. */
export function toggleReminder(r: Reminder): boolean {
  const on = !hasReminder(r.channelId, r.start);
  setSetting('reminders', on ? settings.reminders.concat(r) : settings.reminders.filter((x) => !sameReminder(x, r.channelId, r.start)));
  return on;
}

export function removeReminder(r: Reminder) {
  setSetting('reminders', settings.reminders.filter((x) => !sameReminder(x, r.channelId, r.start)));
}

export function filters(): Filters {
  return { hideAdult: settings.hideAdult, hiddenCategories: settings.hiddenCategories.slice() };
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export { settings };
