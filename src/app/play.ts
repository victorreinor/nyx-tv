// Atalhos para abrir conteúdo: detalhe, player de canal, filme ou episódio.
import { call } from '../data/client';
import type { CardItem, Episode, SeriesInfo } from '../data/types';
import { go } from './router';

export function openItem(item: CardItem, category = 'all') {
  if (item.kind === 'live') return playChannel(item.id, category);
  if (item.kind === 'movie') return go({ name: 'movie', id: item.id });
  return go({ name: 'show', id: item.id });
}

export function playChannel(channelId: string, category = 'all') {
  go({ name: 'player', media: { kind: 'live', channelId, category } });
}

export function playMovie(item: { id: string; title: string; image: string }, position = 0) {
  go({ name: 'player', media: { kind: 'movie', id: item.id, title: item.title, image: item.image, position } });
}

export function flatEpisodes(info: SeriesInfo): Episode[] {
  const out: Episode[] = [];
  info.seasons.forEach((s) => s.episodes.forEach((e) => out.push(e)));
  return out;
}

export function playEpisode(info: SeriesInfo, episodeId: string, position = 0) {
  const episodes = flatEpisodes(info);
  const index = Math.max(0, episodes.findIndex((e) => e.id === episodeId));
  go({
    name: 'player',
    media: { kind: 'episode', seriesId: info.series.id, seriesTitle: info.series.name, image: info.series.poster, episodes, index, position },
  });
}

/** "Continuar" de um card: filme direto; série busca os episódios antes. */
export async function resumeItem(item: CardItem) {
  if (item.kind === 'movie') return playMovie(item, item.resume ? item.resume.position : 0);
  if (item.kind === 'series' && item.resume && item.resume.episodeId) {
    const info = await call('seriesInfo', Number(item.id));
    if (info) return playEpisode(info, item.resume.episodeId, item.resume.position);
  }
  openItem(item);
}
