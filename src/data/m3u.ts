// Listas M3U genéricas. Links de servidor Xtream viram config Xtream (API completa, com grade).
import { channelGroupKey, cleanChannelName, detectQuality, isAdultCategory, QUALITY_RANK, searchKey, yearOf } from './normalize';
import type { Category, Channel, Episode, Kind, Movie, PlaylistConfig, Series } from './types';

/** "http://host/get.php?username=u&password=p&type=m3u_plus" → { host, username, password } */
export function xtreamFromM3uUrl(url: string): Pick<PlaylistConfig, 'host' | 'username' | 'password'> | null {
  const m = url.match(/^(https?:\/\/[^/?#]+)\/get\.php\?(.+)$/i);
  if (!m) return null;
  const params: Record<string, string> = {};
  m[2].split('&').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  if (!params.username || !params.password) return null;
  return { host: m[1], username: params.username, password: params.password };
}

interface Entry {
  name: string;
  logo: string;
  group: string;
  tvgId: string;
  url: string;
}

export interface M3uCatalog {
  live: Channel[];
  movies: Movie[];
  series: Series[];
  episodes: Map<number, Episode[]>;
  categories: Category[];
  epgUrl: string;
}

function attr(line: string, name: string): string {
  const m = line.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : '';
}

function kindOf(url: string): Kind {
  if (/\/movie\//i.test(url)) return 'movie';
  if (/\/series\//i.test(url)) return 'series';
  return 'live';
}

const EPISODE = /^(.*?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,3})/i;

export function parseM3u(text: string): M3uCatalog {
  const lines = text.split(/\r?\n/);
  const header = lines[0] || '';
  const epgUrl = attr(header, 'url-tvg') || attr(header, 'x-tvg-url');
  const entries: Entry[] = [];
  let pending: Omit<Entry, 'url'> | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.indexOf('#EXTINF') === 0) {
      const comma = line.lastIndexOf(',');
      pending = {
        name: (comma >= 0 ? line.slice(comma + 1) : '').trim() || attr(line, 'tvg-name'),
        logo: attr(line, 'tvg-logo'),
        group: attr(line, 'group-title') || 'Outros',
        tvgId: attr(line, 'tvg-id'),
      };
    } else if (line[0] !== '#' && pending) {
      entries.push({ ...pending, url: line });
      pending = null;
    }
  }

  const cats = new Map<string, Category>();
  const catId = (kind: Kind, name: string) => {
    const id = kind[0] + ':' + searchKey(name);
    if (!cats.has(id)) cats.set(id, { id, name, kind, count: 0, adult: isAdultCategory(name) });
    return id;
  };

  const groups = new Map<string, Channel>();
  const movies: Movie[] = [];
  const seriesByName = new Map<string, Series>();
  const episodes = new Map<number, Episode[]>();
  let seq = 0;

  for (const e of entries) {
    const kind = kindOf(e.url);
    const cid = catId(kind, e.group);
    const adult = cats.get(cid)!.adult;
    seq++;
    if (kind === 'live') {
      const key = channelGroupKey(e.name) || searchKey(e.name);
      let ch = groups.get(key);
      if (!ch) {
        ch = { id: key, num: seq, name: cleanChannelName(e.name) || e.name, logo: e.logo, epgId: e.tvgId, categories: [], variants: [], adult: false, key: searchKey(cleanChannelName(e.name) || e.name) };
        groups.set(key, ch);
      }
      if (ch.categories.indexOf(cid) === -1) ch.categories.push(cid);
      if (adult) ch.adult = true;
      ch.variants.push({ streamId: seq, quality: detectQuality(e.name), name: e.name, url: e.url });
    } else if (kind === 'movie') {
      movies.push({ id: seq, name: e.name, poster: e.logo, year: yearOf(e.name), rating: 0, added: 0, categories: [cid], ext: '', adult, key: searchKey(e.name), url: e.url });
    } else {
      const m = e.name.match(EPISODE);
      const title = (m ? m[1] : e.name).trim() || e.name;
      let s = seriesByName.get(title);
      if (!s) {
        s = { id: seq, name: title, poster: e.logo, backdrop: '', year: yearOf(title), rating: 0, added: 0, categories: [cid], plot: '', genre: '', adult, key: searchKey(title) };
        seriesByName.set(title, s);
        episodes.set(s.id, []);
      }
      episodes.get(s.id)!.push({
        id: String(seq),
        season: m ? Number(m[2]) : 1,
        episode: m ? Number(m[3]) : episodes.get(s.id)!.length + 1,
        title: e.name,
        ext: '',
        duration: 0,
        plot: '',
        image: e.logo,
        url: e.url,
      });
    }
  }

  const live = Array.from(groups.values());
  live.forEach((ch) => ch.variants.sort((a, b) => QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality]));
  return { live, movies, series: Array.from(seriesByName.values()), episodes, categories: Array.from(cats.values()), epgUrl };
}
