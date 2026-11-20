import { describe, expect, test } from 'bun:test';
import { diffEpisodes, episodeRef, NEW_EP_TTL, newEpisodesActive } from '../src/data/newEpisodes';
import type { Episode } from '../src/data/types';

const ep = (season: number, episode: number): Episode => ({ id: `${season}-${episode}`, season, episode, title: '', ext: 'mp4', duration: 0, plot: '', image: '' });
const list = (...se: [number, number][]) => se.map(([s, e]) => ep(s, e));

describe('episodeRef', () => {
  test('maior episódio e quantos existem', () => {
    expect(episodeRef(list([1, 1], [1, 2], [2, 1]))).toEqual({ top: 2001, n: 3 });
  });
});

describe('diffEpisodes', () => {
  const ref = { top: 2001, n: 3 };
  test('episódio novo: diz qual é o primeiro e quantos', () => {
    expect(diffEpisodes(list([1, 1], [1, 2], [2, 1], [2, 2], [2, 3]), ref, 9)).toEqual({ added: 9, count: 2, s: 2, e: 2 });
  });
  test('temporada nova', () => {
    expect(diffEpisodes(list([1, 1], [1, 2], [2, 1], [3, 1]), ref, 9)).toMatchObject({ count: 1, s: 3, e: 1 });
  });
  test('mudou só capa ou sinopse: nada novo', () => {
    expect(diffEpisodes(list([1, 1], [1, 2], [2, 1]), ref, 9)).toMatchObject({ count: 0 });
  });
  test('episódio entrou no meio: novo confirmado, sem saber qual', () => {
    expect(diffEpisodes(list([1, 1], [1, 2], [1, 3], [2, 1]), ref, 9)).toMatchObject({ count: 1, s: 0 });
  });
  test('sem referência: selo genérico', () => {
    expect(diffEpisodes(list([1, 1]), null, 9)).toMatchObject({ count: -1 });
  });
  test('referência só pelo que assistiu (n = 0)', () => {
    expect(diffEpisodes(list([1, 1], [1, 2], [1, 3]), { top: 1002, n: 0 }, 9)).toMatchObject({ count: 1, s: 1, e: 3 });
  });
});

describe('newEpisodesActive', () => {
  const now = 100000;
  const r = { added: 9, count: 2, s: 2, e: 2, at: now - 3600 };
  test('dentro do prazo e sem começar os novos', () => {
    expect(newEpisodesActive(r, now, [{ season: 2, episode: 1, updatedAt: now * 1000 }])).toBe(true);
  });
  test('começou um dos novos', () => {
    expect(newEpisodesActive(r, now, [{ season: 2, episode: 3, updatedAt: 0 }])).toBe(false);
  });
  test('passou do prazo', () => {
    expect(newEpisodesActive({ ...r, at: now - NEW_EP_TTL }, now, [])).toBe(false);
  });
  test('selo sem saber qual: qualquer episódio começado depois da conferência', () => {
    const g = { ...r, s: 0, e: 0 };
    expect(newEpisodesActive(g, now, [{ season: 1, episode: 1, updatedAt: (now - 7200) * 1000 }])).toBe(true);
    expect(newEpisodesActive(g, now, [{ season: 1, episode: 1, updatedAt: (now - 60) * 1000 }])).toBe(false);
  });
});
