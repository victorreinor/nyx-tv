import { describe, expect, test } from 'bun:test';
import { cleanPrograms, parseXmltv, parseXmltvDate, programsInRange } from '../src/data/epg';
import { parseM3u, xtreamFromM3uUrl } from '../src/data/m3u';
import { channelGroupKey, cleanChannelName, detectQuality, isAdultCategory, searchKey, tmdbImage } from '../src/data/normalize';
import { compareBy, keysetPage, type SortSpec } from '../src/data/paging';
import { rankMatches } from '../src/data/search';
import { groupChannels, mapCategories } from '../src/data/xtream';

describe('normalize', () => {
  test('detecta qualidade pelo último marcador', () => {
    expect(detectQuality('Record SP FHD')).toBe('FHD');
    expect(detectQuality('RECORD SP 4K')).toBe('4K');
    expect(detectQuality('Globo NSC Florianopolis SD')).toBe('SD');
    expect(detectQuality('UHD Channel')).toBe('4K');
    expect(detectQuality('RedeTV!')).toBe('');
  });

  test('agrupa variantes do mesmo canal', () => {
    const k = channelGroupKey('Record SP FHD');
    expect(channelGroupKey('Record SP HD')).toBe(k);
    expect(channelGroupKey('RECORD SP 4K')).toBe(k);
    expect(channelGroupKey('Record RJ HD')).not.toBe(k);
    expect(channelGroupKey('Cartoonito FHD*')).toBe(channelGroupKey('Cartoonito SD'));
  });

  test('limpa o nome para exibição', () => {
    expect(cleanChannelName('RECORD SP 4K')).toBe('RECORD SP');
    expect(cleanChannelName('Cartoonito FHD*')).toBe('Cartoonito');
    expect(cleanChannelName('HBO 2 HD')).toBe('HBO 2');
  });

  test('busca ignora acento e pontuação', () => {
    expect(searchKey('Homem-Aranha: Através do Aranhaverso')).toBe('homem aranha atraves do aranhaverso');
  });

  test('categorias adultas', () => {
    expect(isAdultCategory('24HRS ⛔ Brasileirinhas Adultos')).toBe(true);
    expect(isAdultCategory('OnlyFans & Privacy')).toBe(true);
    expect(isAdultCategory('Animação & Infantil')).toBe(false);
  });

  test('capa do TMDB no tamanho do card', () => {
    expect(tmdbImage('https://image.tmdb.org/t/p/w600/abc.jpg', 'w342')).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
    expect(tmdbImage('https://i.ibb.co/x.png', 'w342')).toBe('https://i.ibb.co/x.png');
  });
});

describe('xtream', () => {
  test('canais agrupados com variantes ordenadas e categorias unidas', () => {
    const cats = mapCategories([{ category_id: 1, category_name: 'Record' }, { category_id: 2, category_name: '4K UHD' }], 'live');
    expect(cats[0].id).toBe('l:1');
    const chans = groupChannels(
      [
        { num: 3, name: 'Record SP HD', stream_id: 11, category_id: 1, epg_channel_id: 'rec' },
        { num: 2, name: 'Record SP FHD', stream_id: 10, category_id: 1 },
        { num: 9, name: 'RECORD SP 4K', stream_id: 12, category_id: 2 },
        { num: 1, name: 'SBT HD', stream_id: 20, category_id: 1 },
      ],
      new Set(),
    );
    expect(chans.length).toBe(2);
    const rec = chans.find((c) => c.name === 'Record SP')!;
    expect(rec.variants.map((v) => v.quality)).toEqual(['4K', 'FHD', 'HD']);
    expect(rec.categories.sort()).toEqual(['l:1', 'l:2']);
    expect(rec.epgId).toBe('rec');
    expect(rec.num).toBe(2);
    expect(chans[0].name).toBe('SBT');
  });
});

describe('epg', () => {
  test('converte data XMLTV com fuso', () => {
    expect(parseXmltvDate('20261102143000 -0300')).toBe(Date.UTC(2026, 10, 2, 17, 30) / 1000);
  });

  test('junta duplicata do provedor e corta sobreposição', () => {
    // caso real: "Premonição 6" às 15:27 e de novo às 15:30
    const out = cleanPrograms([
      { start: 100, stop: 157, title: 'Guerra', desc: '' },
      { start: 157, stop: 300, title: 'Premonição 6', desc: '' },
      { start: 160, stop: 300, title: 'Premonição 6', desc: 'sinopse' },
      { start: 290, stop: 400, title: 'Superman', desc: '' },
    ]);
    expect(out.map((p) => p.title)).toEqual(['Guerra', 'Premonição 6', 'Superman']);
    expect(out[1].stop).toBe(290);
    expect(out[1].desc).toBe('sinopse');
  });

  test('parse e janela de tempo', () => {
    const xml = `<tv>
<programme start="x" stop="y" start_timestamp="1000" stop_timestamp="2000" channel="hbo"><title lang="pt">A &amp; B</title><desc>D</desc></programme>
<programme start="x" stop="y" start_timestamp="2000" stop_timestamp="3000" channel="hbo"><title>C</title></programme>
<programme start="x" stop="y" start_timestamp="1000" stop_timestamp="5000" channel="rec"><title>R</title></programme>
</tv>`;
    const map = parseXmltv(xml);
    expect(map.get('hbo')!.length).toBe(2);
    expect(map.get('hbo')![0].title).toBe('A & B');
    expect(programsInRange(map.get('hbo'), 2500, 2600).map((p) => p.title)).toEqual(['C']);
    expect(programsInRange(map.get('hbo'), 1500, 2500).length).toBe(2);
  });
});

describe('busca', () => {
  const keys = ['teia de aranha', 'homem aranha no aranhaverso', 'aranhas assassinas', 'matrix'].map(searchKey);
  test('começo do nome vem primeiro, depois começo de palavra', () => {
    expect(rankMatches(keys, 'aranha', 10)).toEqual([2, 0, 1]);
  });
  test('todos os termos precisam existir', () => {
    expect(rankMatches(keys, 'homem aranha', 10)).toEqual([1]);
    expect(rankMatches(keys, 'xyz', 10)).toEqual([]);
  });
});

describe('paginação keyset', () => {
  interface It {
    id: number;
    added: number;
  }
  const spec: SortSpec<It> = { value: (i) => i.added, id: (i) => i.id, dir: -1 };
  const list: It[] = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, added: i % 3 })).sort(compareBy(spec));

  test('percorre tudo sem repetir nem pular', () => {
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: It[]; next: string | null } = keysetPage(list, spec, cursor, 3);
      seen.push(...page.items.map((i) => i.id));
      cursor = page.next;
    } while (cursor);
    expect(seen.length).toBe(10);
    expect(new Set(seen).size).toBe(10);
  });

  test('continua certo mesmo se a lista mudar entre páginas', () => {
    const first = keysetPage(list, spec, null, 4);
    const grown = list.concat({ id: 99, added: 5 }).sort(compareBy(spec));
    const second = keysetPage(grown, spec, first.next, 4);
    expect(second.items.map((i) => i.id)).toEqual(list.slice(4, 8).map((i) => i.id));
  });
});

describe('m3u', () => {
  test('link de servidor Xtream vira config Xtream', () => {
    expect(xtreamFromM3uUrl('http://ex.com/get.php?username=u&password=p&type=m3u_plus')).toEqual({ host: 'http://ex.com', username: 'u', password: 'p' });
    expect(xtreamFromM3uUrl('http://ex.com/lista.m3u')).toBeNull();
  });

  test('separa canais, filmes e episódios', () => {
    const m = parseM3u(`#EXTM3U url-tvg="http://epg"
#EXTINF:-1 tvg-id="rec" tvg-logo="l.png" group-title="Abertos",Record HD
http://h/live/u/p/1.ts
#EXTINF:-1 group-title="Abertos",Record FHD
http://h/live/u/p/2.ts
#EXTINF:-1 group-title="Filmes",Matrix (1999)
http://h/movie/u/p/3.mp4
#EXTINF:-1 group-title="Séries",Dark S01 E02
http://h/series/u/p/4.mkv
#EXTINF:-1 group-title="Séries",Dark S01 E01
http://h/series/u/p/5.mkv`);
    expect(m.epgUrl).toBe('http://epg');
    expect(m.live.length).toBe(1);
    expect(m.live[0].variants.map((v) => v.quality)).toEqual(['FHD', 'HD']);
    expect(m.movies[0].year).toBe(1999);
    expect(m.series[0].name).toBe('Dark');
    expect(m.episodes.get(m.series[0].id)!.length).toBe(2);
  });
});
