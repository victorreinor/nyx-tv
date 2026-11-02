// Serve a atualização sem cabo pela rede local, para testar na TV antes de publicar no GitHub Pages.
//
//   bun tools/update-server.ts                     serve .build/pages em :8791 (PAGES_DIR, UPDATE_PORT)
//   UPDATE_URL=http://<ip-do-mac>:8791/update/ ./scripts/tv.sh --report
//
// Depois: suba a versão no package.json, `bun run build && bun scripts/pages.ts`, e a TV baixa
// sozinha (1 min depois de abrir, ou Configurações › Sobre › Procurar agora).
import { existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const dir = process.env.PAGES_DIR ?? join(import.meta.dir, '..', '.build', 'pages');
const port = Number(process.env.UPDATE_PORT ?? 8791);
const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

Bun.serve({
  port,
  hostname: '0.0.0.0',
  fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(dir, path);
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) return new Response('não achei', { status: 404, headers: cors });
    console.log(new Date().toISOString().slice(11, 19), req.method, path);
    return new Response(Bun.file(file), { headers: cors });
  },
});
console.log(`atualização local em http://0.0.0.0:${port}/update/ (pasta ${dir})`);
