import { describe, expect, test } from 'bun:test';
import { buildPreviewFeed, parsePreviewPayload } from '../src/app/previewFeed';
import type { CardItem, ChannelRow, HomeData } from '../src/data/types';

const titles = { continue: 'Continuar', newEpisodes: 'Novos', favLive: 'Favoritos', recentLive: 'Recentes' };
const card = (c: Partial<CardItem> & Pick<CardItem, 'kind' | 'id'>): CardItem => ({ title: 'T' + c.id, image: '', ...c });
const chan = (id: string, logo: string, fav: boolean): ChannelRow => ({ id, num: 1, name: id, logo, qualities: [], fav, programs: [] });
const home = (h: Partial<HomeData>): HomeData => ({ hero: null, continueItems: [], newEpisodes: [], favChannels: [], recentMovies: [], recentSeries: [], ...h });

describe('Smart Hub Preview', () => {
  test('sem nada para mostrar não manda JSON (a Samsung exige um quadro)', () => {
    expect(buildPreviewFeed(home({}), titles)).toBeNull();
    // só itens sem imagem válida também não conta
    expect(buildPreviewFeed(home({ continueItems: [card({ kind: 'movie', id: '1', image: '' })] }), titles)).toBeNull();
  });

  test('fileiras, proporção da imagem e ação de cada quadro', () => {
    const feed = JSON.parse(
      buildPreviewFeed(
        home({
          continueItems: [
            card({ kind: 'movie', id: '1', image: 'https://img/p1.jpg', sub: '20 min' }),
            card({ kind: 'series', id: '2', image: 'https://img/p2.jpg', backdrop: 'http://img/b2.jpg' }),
          ],
          newEpisodes: [card({ kind: 'series', id: '3', image: 'https://img/p3.jpg' })],
          favChannels: [chan('warner', 'https://img/w.png', true), chan('sem-logo', '', true)],
        }),
        titles,
      )!,
    );
    expect(feed.sections.map((s: { title: string }) => s.title)).toEqual(['Continuar', 'Novos', 'Favoritos']);
    const [movie, series] = feed.sections[0].tiles;
    expect(movie).toMatchObject({ image_ratio: '2by3', image_url: 'https://img/p1.jpg', subtitle: '20 min', is_playable: true });
    expect(JSON.parse(movie.action_data)).toEqual({ k: 'movie', id: '1' });
    expect(series).toMatchObject({ image_ratio: '16by9', image_url: 'http://img/b2.jpg' });
    expect(JSON.parse(feed.sections[1].tiles[0].action_data)).toEqual({ k: 'show', id: '3' });
    expect(feed.sections[2].tiles).toHaveLength(1);
    expect(feed.sections[2].tiles[0]).toMatchObject({ image_ratio: '1by1', title: 'warner' });
  });

  test('canais recentes quando não há favoritos', () => {
    const feed = JSON.parse(buildPreviewFeed(home({ favChannels: [chan('a', 'https://img/a.png', false)] }), titles)!);
    expect(feed.sections[0].title).toBe('Recentes');
  });

  test('PAYLOAD do clique', () => {
    expect(parsePreviewPayload(JSON.stringify({ values: '{"k":"live","id":"warner channel"}' }))).toEqual({ k: 'live', id: 'warner channel' });
    // formato do teste antigo / lixo: abre normal
    expect(parsePreviewPayload(JSON.stringify({ values: '{"t":"ch","id":"x"}' }))).toBeNull();
    expect(parsePreviewPayload('não é json')).toBeNull();
  });
});
