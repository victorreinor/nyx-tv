import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';

/**
 * O runtime da TV (Tizen 6 / Chromium 76) abre o app via file://.
 * Lá, <script type="module"> e o atributo crossorigin quebram o carregamento,
 * então o bundle sai em IIFE e o HTML vira script clássico.
 * O HTML chama o carregador (boot.js), que escolhe entre o app.js do pacote e uma versão baixada.
 */
function classicScripts(): Plugin {
  return {
    name: 'nyx:classic-scripts',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      const out = html.replace(/ type="module"/g, ' defer').replace(/ crossorigin/g, '').replace(/src="\.\/app\.js"/, 'src="./boot.js"');
      if (!out.includes('src="./boot.js"')) throw new Error('index.html sem o app.js para trocar pelo boot.js');
      return out;
    },
  };
}

/**
 * Só no navegador do Mac: o provedor IPTV não manda CORS, então o worker
 * chama /__proxy?url=... e o servidor do Vite busca por ele.
 */
function devProxy(): Plugin {
  return {
    name: 'nyx:dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__proxy', async (req, res) => {
        const target = new URL(req.url ?? '', 'http://local').searchParams.get('url');
        if (!target || !/^https?:\/\//.test(target)) {
          res.statusCode = 400;
          res.end('url inválida');
          return;
        }
        // repassa aos poucos: o teste de saúde lê só o começo de um canal ao vivo (que não termina)
        const ctrl = new AbortController();
        res.on('close', () => ctrl.abort());
        try {
          const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)' };
          if (req.headers.range) headers.Range = String(req.headers.range);
          const upstream = await fetch(target, { headers, signal: ctrl.signal });
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
          res.setHeader('X-Final-Url', upstream.url);
          if (!upstream.body) return void res.end();
          const reader = upstream.body.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch (err) {
          if (ctrl.signal.aborted) return;
          if (!res.headersSent) {
            res.statusCode = 502;
            // o teste de saúde trata como falha de rede, igual à TV (que não tem proxy no meio)
            res.setHeader('X-Proxy-Error', '1');
          }
          res.end(String(err));
        }
      });
    },
  };
}

/** Versão única do app: package.json (scripts/release.ts sobe). */
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [solid(), classicScripts(), devProxy()],
  build: {
    target: 'chrome76',
    cssTarget: 'chrome76',
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: { host: true, port: 5173, watch: { ignored: ['**/.build/**', '**/tools/.reports/**', '**/dist/**'] } },
});
