import { describe, expect, test } from 'bun:test';
import { cleanPrograms, parseXmltv, parseXmltvDate, programsInRange } from '../src/data/epg';
import { parseM3u, xtreamFromM3uUrl } from '../src/data/m3u';
import { channelGroupKey, cleanChannelName, detectQuality, isAdultCategory, isExplicitTitle, markAdultByContent, searchKey, tmdbImage } from '../src/data/normalize';
import { compareBy, keysetPage, type SortSpec } from '../src/data/paging';
import { rankMatches } from '../src/data/search';
import { fingerprint, hashText } from '../src/data/store';
import { tmdbExpired } from '../src/data/tmdb';
import { isStarted, UserStore } from '../src/data/user';
import { groupChannels, mapCategories, mapMovies } from '../src/data/xtream';

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

  test('título explícito sem pegar palavras comuns', () => {
    expect(isExplicitTitle('Hardcore fucking the Engineer')).toBe(true);
    expect(isExplicitTitle('Ninfeta safada')).toBe(true);
    expect(isExplicitTitle('Moby Dick')).toBe(false);
    expect(isExplicitTitle('Sex Education')).toBe(false);
    expect(isExplicitTitle('Cumplicidade')).toBe(false);
    expect(isExplicitTitle('Cocktail')).toBe(false);
  });

  test('categoria adulta pelo conteúdo, não por um título solto', () => {
    const categories = [
      { id: 'm:1', adult: false }, // "Gay": maioria explícita
      { id: 'm:2', adult: false }, // "Ação": um "xXx Reativado" no meio de muitos
    ];
    const items = [
      ...['Fuck anywhere', 'Hardcore fucking', 'Horny roommate', 'Making of'].map((name) => ({ name, categories: ['m:1'], adult: false })),
      ...['xXx Reativado', 'Duro de Matar', 'Velozes', 'Missão Impossível', 'John Wick'].map((name) => ({ name, categories: ['m:2'], adult: false })),
    ];
    expect(markAdultByContent(items, categories)).toBe(1);
    expect(categories.map((c) => c.adult)).toEqual([true, false]);
    expect(items.filter((i) => i.adult).length).toBe(4); // inclusive o "Making of" da categoria adulta
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

describe('mini-grade', () => {
  test('canal fora da categoria cai para todos os canais (nunca vazia)', async () => {
    const { Catalog } = await import('../src/data/catalog');
    const { UserStore } = await import('../src/data/user');
    const user = new UserStore();
    const cat = new Catalog(user);
    const chans = groupChannels(
      [
        { num: 1, name: 'A HD', stream_id: 1, category_id: 1 },
        { num: 2, name: 'B HD', stream_id: 2, category_id: 1 },
      ],
      new Set(),
    );
    cat.setCatalog({ channels: chans, movies: [], series: [], categories: mapCategories([{ category_id: 1, category_name: 'X' }], 'live'), at: 1 });
    const g = cat.miniGuide('fav', chans[1].id, 0, 1);
    expect(g.rows.length).toBe(2);
    expect(g.index).toBe(1);
    expect(cat.neighborChannel(chans[1].id, 'fav', 1)).toBe(chans[0].id);
  });

  test('atalho/busca (auto) usa o grupo do canal; favoritos só quando o canal é favorito', async () => {
    const { Catalog } = await import('../src/data/catalog');
    const { UserStore } = await import('../src/data/user');
    const user = new UserStore();
    const cat = new Catalog(user);
    const chans = groupChannels(
      [
        { num: 1, name: 'Notícias HD', stream_id: 1, category_id: 1 },
        { num: 2, name: 'Warner HD', stream_id: 2, category_id: 2 },
        { num: 3, name: 'AMC HD', stream_id: 3, category_id: 2 },
      ],
      new Set(),
    );
    const cats = mapCategories(
      [
        { category_id: 1, category_name: 'Notícias' },
        { category_id: 2, category_name: 'Filmes e Séries' },
      ],
      'live',
    );
    cat.setCatalog({ channels: chans, movies: [], series: [], categories: cats, at: 1 });
    const warner = chans.find((c) => c.name.indexOf('Warner') === 0)!;
    const films = warner.categories[0];

    expect(cat.liveCategory('auto', warner.id)).toBe(films);
    expect(cat.miniGuide('auto', warner.id, 0, 1).rows.map((r) => r.name)).toEqual(['Warner', 'AMC']);
    // não favoritado: "fav" também cai no grupo dele
    expect(cat.liveCategory('fav', warner.id)).toBe(films);
    user.toggleFav('l:' + warner.id);
    expect(cat.liveCategory('fav', warner.id)).toBe('fav');
    expect(cat.miniGuide('fav', warner.id, 0, 1).rows.map((r) => r.name)).toEqual(['Warner']);
    // categoria escolhida no Ao vivo continua valendo
    expect(cat.liveCategory('all', warner.id)).toBe('all');
  });
});

describe('novos episódios', () => {
  test('selo só em série que você acompanha e que mudou depois disso', async () => {
    const { Catalog } = await import('../src/data/catalog');
    const { UserStore } = await import('../src/data/user');
    const { mapSeries } = await import('../src/data/xtream');
    const user = new UserStore();
    const cat = new Catalog(user);
    const series = mapSeries(
      [
        { series_id: 1, name: 'Acompanho', last_modified: 2000, category_id: 1 },
        { series_id: 2, name: 'Não acompanho', last_modified: 2000, category_id: 1 },
      ],
      new Set(),
    );
    cat.setCatalog({ channels: [], movies: [], series, categories: [], at: 1 });
    user.state.favorites['s:1'] = 1000 * 1000; // favoritou no instante 1000 s
    // mudou no provedor depois disso: candidata, mas sem selo até conferir os episódios
    expect(cat.newEpisodeCandidates(20).map((x) => x.id)).toEqual([1]);
    expect(cat.card('series', series[0]).newEp).toBeUndefined();
    // conferido: T2 E1 é novo (e mais um depois dele)
    user.setNewEpisodes(1, { added: 2000, count: 2, s: 2, e: 1 });
    expect(cat.newEpisodeCandidates(20)).toEqual([]);
    expect(cat.card('series', series[0]).newEp).toEqual({ s: 2, e: 1, count: 2 });
    expect(cat.card('series', series[1]).newEp).toBeUndefined();
    expect(cat.home().newEpisodes.map((c) => c.id)).toEqual(['1']);
    user.markSeriesSeen(1); // abriu a série agora
    expect(cat.card('series', series[0]).newEp).toBeUndefined();
  });

  test('mudança que não foi episódio (capa, sinopse) não ganha selo', async () => {
    const { Catalog } = await import('../src/data/catalog');
    const { UserStore } = await import('../src/data/user');
    const { mapSeries } = await import('../src/data/xtream');
    const user = new UserStore();
    const cat = new Catalog(user);
    const series = mapSeries([{ series_id: 1, name: 'Capa nova', last_modified: 2000, category_id: 1 }], new Set());
    cat.setCatalog({ channels: [], movies: [], series, categories: [], at: 1 });
    user.state.favorites['s:1'] = 1000 * 1000;
    user.setNewEpisodes(1, { added: 2000, count: 0, s: 0, e: 0 });
    expect(cat.card('series', series[0]).newEp).toBeUndefined();
    expect(cat.home().newEpisodes).toEqual([]);
    // o provedor mudou de novo: confere outra vez
    series[0].added = 3000;
    expect(cat.newEpisodeCandidates(20).length).toBe(1);
  });
});

describe('continuar assistindo e assistidos', () => {
  const ep = (id: string, season: number, episode: number, position: number, updatedAt: number, next?: boolean) => ({
    key: 'e:' + id, kind: 'episode' as const, id, seriesId: 1, season, episode, position, duration: 2400, updatedAt, title: 'Dark', image: '',
    next: next ? { id: String(Number(id) + 1), season, episode: episode + 1, ext: 'mp4', title: '' } : undefined,
  });
  async function setup() {
    const { Catalog } = await import('../src/data/catalog');
    const { UserStore } = await import('../src/data/user');
    const { mapSeries } = await import('../src/data/xtream');
    const user = new UserStore();
    const cat = new Catalog(user);
    const series = mapSeries([{ series_id: 1, name: 'Dark', last_modified: 1, category_id: 1 }], new Set());
    const movies = mapMovies([{ stream_id: 50, name: 'Duna', category_id: 2 }], new Set());
    cat.setCatalog({ channels: [], movies, series, categories: [], at: 1 });
    return { user, cat };
  }

  test('abrir o próximo episódio e sair em segundos não tira a série da lista', async () => {
    const { user, cat } = await setup();
    await user.saveProgress(ep('10', 1, 3, 1200, 1000), true); // na metade do E3
    await user.saveProgress(ep('11', 1, 4, 5, 2000), true); // abriu o E4 e saiu em 5 s
    expect(cat.home().continueItems.map((c) => c.sub!.split(' · ')[0])).toEqual(['T1 E3']);
    expect(cat.page('series', 'continue', 'added', null, 20).items.map((c) => c.id)).toEqual(['1']);
    expect(cat.card('series', cat.seriesById.get(1)!).tag).toBe('1|3');
  });

  test('terminou o episódio: continua no próximo, mesmo com o seguinte aberto por segundos', async () => {
    const { user, cat } = await setup();
    await user.saveProgress(ep('10', 1, 3, 2390, 1000, true), true);
    await user.saveProgress(ep('11', 1, 4, 3, 2000), true);
    const c = cat.home().continueItems[0];
    expect(c.resume).toMatchObject({ episodeId: '11', season: 1, episode: 4, position: 0 });
  });

  test('sem duração (o player não informou) aparece nas abas também', async () => {
    const { user, cat } = await setup();
    await user.saveProgress({ key: 'm:50', kind: 'movie', id: '50', position: 600, duration: 0, updatedAt: 1000, title: 'Duna', image: '' }, true);
    expect(cat.home().continueItems.map((c) => c.id)).toEqual(['50']);
    expect(cat.page('movie', 'continue', 'added', null, 20).items.map((c) => c.id)).toEqual(['50']);
    expect(cat.page('movie', 'watched', 'added', null, 20).items).toEqual([]);
  });

  test('provedor trocou os ids: o progresso acha o filme e a série pelo título', async () => {
    const { user, cat } = await setup();
    await user.saveProgress({ key: 'm:9', kind: 'movie', id: '9', position: 600, duration: 7200, updatedAt: 1000, title: 'Duna', image: '' }, true);
    await user.saveProgress({ ...ep('10', 1, 3, 1200, 2000), seriesId: 77 }, true);
    const { mapSeries } = await import('../src/data/xtream');
    // nova sincronização com os ids de hoje
    cat.setCatalog({ channels: [], movies: mapMovies([{ stream_id: 50, name: 'Duna', category_id: 2 }], new Set()), series: mapSeries([{ series_id: 1, name: 'Dark', last_modified: 1, category_id: 1 }], new Set()), categories: [], at: 2 });
    cat.afterSync();
    expect(user.getProgress('m:50')!.position).toBe(600);
    expect(user.getProgress('m:9')).toBeUndefined();
    expect(cat.home().continueItems.map((c) => c.id).sort()).toEqual(['1', '50']);
  });
});

describe('selos de versão', () => {
  test('versões do nome viram selo e o título fica limpo', async () => {
    const { versionTags, displayTitle } = await import('../src/data/normalize');
    expect(versionTags('A Odisseia dos Tontos [L]')).toEqual(['LEG']);
    expect(versionTags('Besouro Azul 4K')).toEqual(['4K']);
    expect(versionTags('Acenda meu fogo(Dublado)')).toEqual(['DUB']);
    expect(displayTitle('Besouro Azul 4K')).toBe('Besouro Azul');
    expect(displayTitle('Acenda meu fogo(Dublado)')).toBe('Acenda meu fogo');
  });
});

describe('cache do TMDB', () => {
  const day = 86400 * 1000;
  const now = 100 * day;
  test('resposta vale 30 dias, falha vale 1 dia', () => {
    expect(tmdbExpired({ at: now - 29 * day, data: { id: 1 } }, now)).toBe(false);
    expect(tmdbExpired({ at: now - 30 * day, data: { id: 1 } }, now)).toBe(true);
    expect(tmdbExpired({ at: now - day / 2, data: null }, now)).toBe(false);
    expect(tmdbExpired({ at: now - day, data: null }, now)).toBe(true);
  });
  test('registro estranho conta como vencido (sai na limpeza)', () => {
    expect(tmdbExpired(undefined, now)).toBe(true);
    expect(tmdbExpired({ data: { id: 1 } } as unknown as { at: number; data: unknown }, now)).toBe(true);
  });
});

describe('assinatura do snapshot', () => {
  const rows = Array.from({ length: 9000 }, (_, i) => ({ id: i, name: 'Filme ' + i, added: 1700000000 + i }));
  test('mesmo conteúdo = mesma assinatura (não regrava)', () => {
    expect(fingerprint(rows)).toBe(fingerprint(rows.map((r) => ({ ...r }))));
  });
  test('qualquer mudança muda a assinatura', () => {
    const changed = rows.map((r) => ({ ...r }));
    changed[8500].name = 'Filme 8500 (Dublado)';
    expect(fingerprint(changed)).not.toBe(fingerprint(rows));
    expect(fingerprint(rows.slice(1))).not.toBe(fingerprint(rows));
    expect(fingerprint([])).not.toBe(fingerprint([{}]));
  });
  test('texto do XMLTV', () => {
    const xml = '<tv><programme start="20261103180000 -0300" channel="a"><title>Jornal</title></programme></tv>';
    expect(hashText(xml)).toBe(hashText(xml.slice(0)));
    expect(hashText(xml)).not.toBe(hashText(xml.replace('Jornal', 'Jornai')));
  });
});

describe('progresso', () => {
  test('30 s ou 3% já contam como começado', () => {
    expect(isStarted({ position: 20, duration: 7200 })).toBe(false);
    expect(isStarted({ position: 30, duration: 7200 })).toBe(true);
    expect(isStarted({ position: 20, duration: 600 })).toBe(true);
    expect(isStarted({ position: 10, duration: 0 })).toBe(false);
  });

  test('progresso velho (restaurado do localStorage) não apaga um mais novo', async () => {
    const u = new UserStore();
    const base = { key: 'e:1', kind: 'episode' as const, id: '1', duration: 2400, title: 'X', image: '' };
    await u.saveProgress({ ...base, position: 900, updatedAt: 2000 }, true);
    await u.saveProgress({ ...base, position: 100, updatedAt: 1000 }, true);
    expect(u.getProgress('e:1')!.position).toBe(900);
    await u.saveProgress({ ...base, position: 950, updatedAt: 3000 }, true);
    expect(u.getProgress('e:1')!.position).toBe(950);
  });
});
