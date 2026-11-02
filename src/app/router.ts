// Navegação em pilha. Telas da pilha ficam montadas (escondidas) para voltar instantâneo
// e com o foco onde estava.
import { createSignal } from 'solid-js';
import type { Episode } from '../data/types';

export type Section = 'search' | 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'settings';
export const SECTIONS: Section[] = ['search', 'home', 'live', 'movies', 'series', 'favorites', 'settings'];

export type Media =
  | { kind: 'live'; channelId: string; category: string }
  | { kind: 'movie'; id: string; title: string; image: string; position?: number }
  | {
      kind: 'episode';
      seriesId: number;
      seriesTitle: string;
      image: string;
      episodes: Episode[]; // todos, em ordem, para o "próximo episódio"
      index: number;
      position?: number;
    };

export type Route =
  | { name: Section }
  | { name: 'movie'; id: string }
  | { name: 'show'; id: string }
  | { name: 'player'; media: Media }
  | { name: 'welcome' }
  | { name: 'sync' }
  | { name: 'playlistForm'; id?: string };

const [stack, setStack] = createSignal<Route[]>([{ name: 'home' }]);
export { stack };

export const top = () => stack()[stack().length - 1];

export function go(r: Route) {
  setStack(stack().concat(r));
}

export function replace(r: Route) {
  setStack(stack().slice(0, -1).concat(r));
}

/** Seções do menu lateral: Início é a base; as outras ficam por cima dela. */
export function goSection(s: Section) {
  setStack(s === 'home' ? [{ name: 'home' }] : [{ name: 'home' }, { name: s }]);
}

export function reset(r: Route) {
  setStack([r]);
}

/** Retorna false se já está na base (aí o app decide se sai). */
export function back(): boolean {
  const s = stack();
  if (s.length <= 1) return false;
  setStack(s.slice(0, -1));
  return true;
}

export function isSection(r: Route): r is { name: Section } {
  return SECTIONS.indexOf(r.name as Section) !== -1;
}
