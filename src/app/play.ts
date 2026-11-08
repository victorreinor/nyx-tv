// Atalhos para abrir conteúdo: detalhe, player de canal, filme ou episódio.
import { call } from '../data/client';
import { flatEpisodes } from '../data/newEpisodes';
import type { CardItem, SeriesInfo } from '../data/types';
import { go } from './router';

/** `category` do canal: a do Ao vivo ou `fav`; sem ela (`auto`), a mini-grade usa o grupo do próprio canal. */
export function openItem(item: CardItem, category = 'auto') {
  if (item.kind === 'live') return playChannel(item.id, category);
  if (item.kind === 'movie') return go({ name: 'movie', id: item.id });
  return go({ name: 'show', id: item.id });
}

export function playChannel(channelId: string, category = 'auto') {
  go({ name: 'player', media: { kind: 'live', channelId, category } });
}

export function playMovie(item: { id: string; title: string; image: string }, position = 0) {
  go({ name: 'player', media: { kind: 'movie', id: item.id, title: item.title, image: item.image, position } });
}

export { flatEpisodes };

/**
 * Toca o episódio. O provedor pode ter trocado o id: aí acha pela temporada e número (`at`).
 * Retorna false se não achou (quem chamou decide o que fazer).
 */
export function playEpisode(info: SeriesInfo, episodeId: string, position = 0, at?: { season?: number; episode?: number }): boolean {
  const episodes = flatEpisodes(info);
  let index = episodes.findIndex((e) => e.id === episodeId);
  if (index === -1 && at) index = episodes.findIndex((e) => e.season === at.season && e.episode === at.episode);
  if (index === -1) return false;
  go({
    name: 'player',
    media: { kind: 'episode', seriesId: info.series.id, seriesTitle: info.series.name, image: info.series.poster, episodes, index, position },
  });
  return true;
}

/** "Continuar" de um card: filme direto; série busca os episódios antes. */
export async function resumeItem(item: CardItem) {
  if (item.kind === 'movie') return playMovie(item, item.resume ? item.resume.position : 0);
  const r = item.resume;
  if (item.kind === 'series' && r && r.episodeId) {
    // provedor fora: abre a série em vez de não fazer nada
    const info = await call('seriesInfo', Number(item.id)).catch(() => null);
    if (info && playEpisode(info, r.episodeId, r.position, r)) return;
  }
  openItem(item);
}
