// Smart Hub Preview: o JSON das fileiras que aparecem ao parar em cima do ícone do Nyx. Puro, testado em tests/preview.test.ts.
// Formato da Samsung: { sections: [{ title, tiles: [{ title, subtitle, image_ratio, image_url, action_data, is_playable }] }] }.
import type { CardItem, HomeData } from '../data/types';

/** O que o clique num quadro pede. Vai como texto no `action_data` e volta no PAYLOAD do app-control. */
export type PreviewAction = { k: 'movie' | 'series' | 'show' | 'live'; id: string };

export interface PreviewTitles {
  continue: string;
  newEpisodes: string;
  favLive: string;
  recentLive: string;
}

interface Tile {
  title: string;
  subtitle?: string;
  image_ratio: '16by9' | '2by3' | '1by1';
  image_url: string;
  action_data: string;
  is_playable: boolean;
}

const MAX_TILES = 12;
const isUrl = (u: string | undefined): u is string => !!u && /^https?:\/\//.test(u);
const action = (a: PreviewAction) => JSON.stringify(a);

function cardTile(c: CardItem, a: PreviewAction, playable: boolean): Tile | null {
  // capa larga quando existe (fica melhor na fileira); senão o pôster
  const wide = isUrl(c.backdrop);
  const url = wide ? c.backdrop : c.image;
  if (!isUrl(url)) return null;
  const t: Tile = { title: c.title, image_ratio: wide ? '16by9' : '2by3', image_url: url, action_data: action(a), is_playable: playable };
  if (c.sub) t.subtitle = c.sub;
  return t;
}

const present = <T>(x: T | null): x is T => !!x;

/** JSON pronto para `setPreviewData`, ou null se não há nada para mostrar (a Samsung exige ao menos um quadro). */
export function buildPreviewFeed(home: HomeData, titles: PreviewTitles): string | null {
  const sections: { title: string; tiles: Tile[] }[] = [];

  const cont = home.continueItems
    .map((c) => cardTile(c, { k: c.kind === 'movie' ? 'movie' : 'series', id: c.id }, true))
    .filter(present)
    .slice(0, MAX_TILES);
  if (cont.length) sections.push({ title: titles.continue, tiles: cont });

  const eps = home.newEpisodes
    .map((c) => cardTile(c, { k: 'show', id: c.id }, false))
    .filter(present)
    .slice(0, MAX_TILES);
  if (eps.length) sections.push({ title: titles.newEpisodes, tiles: eps });

  // sem o programa de agora no subtítulo: o preview só muda quando o app é usado e ficaria velho
  const chans = home.favChannels
    .filter((c) => isUrl(c.logo))
    .slice(0, MAX_TILES)
    .map<Tile>((c) => ({ title: c.name, image_ratio: '1by1', image_url: c.logo, action_data: action({ k: 'live', id: c.id }), is_playable: true }));
  if (chans.length) sections.push({ title: home.favChannels[0].fav ? titles.favLive : titles.recentLive, tiles: chans });

  return sections.length ? JSON.stringify({ sections }) : null;
}

/** PAYLOAD do app-control (`{"values":"<action_data>"}`) → ação, ou null se não for um quadro nosso. */
export function parsePreviewPayload(payload: string): PreviewAction | null {
  try {
    const a = JSON.parse(JSON.parse(payload).values) as PreviewAction;
    const kinds = ['movie', 'series', 'show', 'live'];
    return a && kinds.indexOf(a.k) !== -1 && typeof a.id === 'string' && a.id ? { k: a.k, id: a.id } : null;
  } catch {
    return null;
  }
}
