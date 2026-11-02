// Servidor Xtream de demonstração: canais, filmes, séries e grade FICTÍCIOS, com capas geradas.
// Serve para testar o Nyx sem uma lista de IPTV e para as capturas do README.
//
//   bun tools/demo-server.ts          → http://localhost:8790  (usuário demo / senha demo)
//
// Não toca vídeo: os links de stream respondem 404.

const PORT = Number(process.env.DEMO_PORT || 8790);
const BASE = `http://localhost:${PORT}`;
const NOW = Math.floor(Date.now() / 1000);

// paleta das capas: escuras, combinando com o tema noturno do app
const HUES = [256, 200, 330, 25, 160, 285, 210, 0, 45, 180];

function svg(w: number, h: number, body: string): Response {
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' },
  });
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function wrap(title: string, max: number): string[] {
  const words = title.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function poster(id: number, title: string, w = 600, h = 900): Response {
  const hue = HUES[id % HUES.length];
  const lines = wrap(title.toUpperCase(), 11);
  const size = lines.some((l) => l.length > 8) ? 70 : 88;
  const text = lines.map((l, i) => `<text x="48" y="${h - 90 - (lines.length - 1 - i) * (size + 8)}" font-family="Helvetica, Arial" font-weight="800" font-size="${size}" fill="hsl(${hue},70%,92%)">${esc(l)}</text>`).join('');
  return svg(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="hsl(${hue},45%,16%)"/>` +
      `<circle cx="${w * 0.72}" cy="${h * 0.3}" r="${w * 0.42}" fill="hsl(${hue},55%,30%)"/>` +
      `<circle cx="${w * 0.25}" cy="${h * 0.42}" r="${w * 0.18}" fill="hsl(${(hue + 40) % 360},60%,45%)" opacity="0.8"/>` +
      `<rect x="48" y="${h - 60}" width="80" height="6" fill="hsl(${hue},80%,70%)"/>` +
      text,
  );
}

function backdrop(id: number): Response {
  const hue = HUES[id % HUES.length];
  return svg(
    1280,
    720,
    `<rect width="1280" height="720" fill="hsl(${hue},40%,14%)"/>` +
      `<circle cx="900" cy="300" r="420" fill="hsl(${hue},50%,26%)"/>` +
      `<circle cx="1080" cy="520" r="200" fill="hsl(${(hue + 40) % 360},55%,40%)" opacity="0.7"/>` +
      `<circle cx="640" cy="180" r="90" fill="hsl(${(hue + 300) % 360},60%,55%)" opacity="0.6"/>`,
  );
}

function logo(name: string): Response {
  const hue = HUES[name.length % HUES.length];
  const mono = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return svg(
    200,
    200,
    `<rect width="200" height="200" rx="36" fill="hsl(${hue},55%,40%)"/><text x="100" y="124" text-anchor="middle" font-family="Helvetica, Arial" font-weight="800" font-size="64" fill="white">${esc(mono)}</text>`,
  );
}

// ---------- catálogo fictício ----------

const liveCats = ['Notícias', 'Esportes', 'Filmes e Séries', 'Infantil', 'Documentários', 'Música'];
const channelNames: [string, number, string[]][] = [
  ['Aurora News', 0, ['FHD', 'HD', 'SD']],
  ['Meridiano 24h', 0, ['HD', 'SD']],
  ['Nebula Sports', 1, ['4K', 'FHD', 'HD']],
  ['Arena Plus', 1, ['FHD', 'HD']],
  ['Pista Motor', 1, ['HD']],
  ['Cinema Lumen', 2, ['FHD', 'HD', 'SD']],
  ['Noir Séries', 2, ['FHD', 'HD']],
  ['Studio Vela', 2, ['4K', 'FHD']],
  ['Pipoca Kids', 3, ['HD', 'SD']],
  ['Toca do Lobo', 3, ['FHD', 'HD']],
  ['Planeta Vivo', 4, ['4K', 'FHD', 'HD']],
  ['História Viva', 4, ['HD']],
  ['Onda FM TV', 5, ['HD']],
  ['Acústico Brasil', 5, ['FHD', 'HD']],
];
const showTitles = [
  ['Jornal da Manhã', 'As principais notícias do dia com análise ao vivo.'],
  ['Mesa Redonda', 'Debate com convidados sobre os assuntos da semana.'],
  ['Rodada Final', 'Melhores momentos e entrevistas depois dos jogos.'],
  ['Sessão da Noite', 'Um clássico do cinema, sem cortes.'],
  ['Expedição Selvagem', 'Uma equipe acompanha a migração dos lobos-guará.'],
  ['Desenhos da Tarde', 'Aventuras animadas para toda a família.'],
  ['Acústico ao Vivo', 'Show intimista gravado em estúdio.'],
  ['Fim de Semana Motor', 'Corrida completa com transmissão em 4K.'],
  ['Investigação Noturna', 'Série policial: o caso do farol apagado.'],
  ['Cozinha de Raiz', 'Receitas de família de várias regiões do Brasil.'],
];

const live: any[] = [];
let sid = 1000;
channelNames.forEach(([name, cat, qualities], ci) => {
  qualities.forEach((q) => {
    live.push({
      num: ci + 1,
      name: `${name} ${q}`,
      stream_type: 'live',
      stream_id: sid++,
      stream_icon: `${BASE}/logo/${encodeURIComponent(name)}.svg`,
      epg_channel_id: `ch${ci}`,
      category_id: String(cat + 1),
      category_ids: [cat + 1],
      tv_archive: 0,
    });
  });
});

const vodCats = ['Lançamentos', 'Ação', 'Drama', 'Comédia', 'Ficção', 'Animação', 'Documentário'];
const movieTitles = [
  'O Último Farol', 'Maré Alta', 'Cidade Sal', 'Noite Clara', 'Rota de Colisão', 'A Grande Fuga', 'Vento Norte',
  'Horizonte Perdido', 'Ecos do Deserto', 'Linha de Fogo', 'Jardim de Inverno', 'O Relojoeiro', 'Céu de Agosto',
  'Ponto Cego', 'Sinal Fraco', 'Lua de Papel', 'Corrente Fria', 'Cais 7', 'O Mapa Azul', 'Raízes',
  'Velocidade Zero', 'Quarto Escuro', 'A Ilha dos Sinais', 'Território', 'Estação Final', 'Sal e Ferro',
  'Dois Invernos', 'Pequenos Gigantes', 'Órbita', 'A Travessia', 'Neblina', 'Canção do Mar',
];
const vod = movieTitles.map((title, i) => ({
  num: i + 1,
  name: title,
  title,
  year: String(2018 + (i % 8)),
  stream_type: 'movie',
  stream_id: 5000 + i,
  stream_icon: `${BASE}/poster/${5000 + i}.svg?t=${encodeURIComponent(title)}`,
  rating_5based: 3 + (i % 5) * 0.4,
  added: String(NOW - i * 7200),
  category_id: String((i % vodCats.length) + 1),
  category_ids: [(i % vodCats.length) + 1],
  container_extension: 'mp4',
}));

const seriesCats = ['Drama', 'Suspense', 'Comédia', 'Documentário'];
const seriesTitles = ['Farol', 'Maré', 'Território Livre', 'Os Vizinhos', 'Ondas', 'Cartas do Sul', 'Detetive Noturno', 'Planeta Azul', 'Caminhos', 'Primeira Linha', 'Verão Eterno', 'Arquivo X9'];
const series = seriesTitles.map((title, i) => ({
  num: i + 1,
  name: title,
  title,
  series_id: 8000 + i,
  cover: `${BASE}/poster/${8000 + i}.svg?t=${encodeURIComponent(title)}`,
  backdrop_path: [`${BASE}/backdrop/${8000 + i}.svg`],
  plot: 'Uma história original criada só para a demonstração do Nyx. Nenhum dado aqui é real.',
  genre: seriesCats[i % seriesCats.length],
  release_date: `${2019 + (i % 6)}-03-01`,
  rating_5based: 3.5 + (i % 3) * 0.4,
  last_modified: String(NOW - i * 5400),
  category_id: String((i % seriesCats.length) + 1),
  category_ids: [(i % seriesCats.length) + 1],
}));

function cats(names: string[]) {
  return names.map((n, i) => ({ category_id: String(i + 1), category_name: n, parent_id: 0 }));
}

function seriesInfo(id: number) {
  const s = series.find((x) => x.series_id === id);
  const episodes: Record<string, any[]> = {};
  for (let season = 1; season <= 3; season++) {
    episodes[String(season)] = Array.from({ length: 8 }, (_, e) => ({
      id: String(id * 100 + season * 10 + e),
      episode_num: e + 1,
      title: `${s ? s.title : 'Série'} - S0${season}E0${e + 1} - Capítulo ${e + 1}`,
      container_extension: 'mp4',
      season,
      info: { duration_secs: 2700 + e * 60, plot: 'Episódio de demonstração.', movie_image: `${BASE}/backdrop/${id + season * 7 + e}.svg` },
    }));
  }
  return { info: { name: s?.title, plot: s?.plot, genre: s?.genre, backdrop_path: s?.backdrop_path }, episodes };
}

function xmltv(): string {
  const parts = ['<?xml version="1.0" encoding="utf-8" ?><tv generator-info-name="nyx-demo">'];
  const start = Math.floor((NOW - 6 * 3600) / 1800) * 1800;
  channelNames.forEach((_, ci) => {
    let t = start;
    let k = ci;
    while (t < NOW + 30 * 3600) {
      const dur = (2 + ((k * 7) % 5)) * 1800;
      const [title, desc] = showTitles[k % showTitles.length];
      parts.push(`<programme start="x" stop="x" start_timestamp="${t}" stop_timestamp="${t + dur}" channel="ch${ci}"><title>${esc(title)}</title><desc>${esc(desc)}</desc></programme>`);
      t += dur;
      k += 3;
    }
  });
  parts.push('</tv>');
  return parts.join('\n');
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const json = (d: unknown) => Response.json(d, { headers: { 'Access-Control-Allow-Origin': '*' } });
    if (path === '/player_api.php') {
      if (url.searchParams.get('username') !== 'demo' || url.searchParams.get('password') !== 'demo') return json({ user_info: { auth: 0 } });
      switch (url.searchParams.get('action')) {
        case 'get_live_categories': return json(cats(liveCats));
        case 'get_live_streams': return json(live);
        case 'get_vod_categories': return json(cats(vodCats));
        case 'get_vod_streams': return json(vod);
        case 'get_series_categories': return json(cats(seriesCats));
        case 'get_series': return json(series);
        case 'get_series_info': return json(seriesInfo(Number(url.searchParams.get('series_id'))));
        case 'get_vod_info': {
          const id = Number(url.searchParams.get('vod_id'));
          return json({ info: { plot: 'Um filme fictício criado para a demonstração do Nyx.', genre: 'Drama', duration_secs: 6300, backdrop_path: [`${BASE}/backdrop/${id}.svg`] } });
        }
        default:
          return json({ user_info: { auth: 1, status: 'Active', exp_date: String(NOW + 365 * 86400), max_connections: '2' }, server_info: { url: 'localhost', port: String(PORT) } });
      }
    }
    if (path === '/xmltv.php') return new Response(xmltv(), { headers: { 'Content-Type': 'application/xml' } });
    let m = path.match(/^\/poster\/(\d+)\.svg$/);
    if (m) return poster(Number(m[1]), url.searchParams.get('t') || 'Nyx');
    m = path.match(/^\/backdrop\/(\d+)\.svg$/);
    if (m) return backdrop(Number(m[1]));
    m = path.match(/^\/logo\/(.+)\.svg$/);
    if (m) return logo(decodeURIComponent(m[1]));
    return new Response('not found', { status: 404 });
  },
});
console.log(`demo Xtream em ${BASE}  (usuário demo / senha demo)`);
