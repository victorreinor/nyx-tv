import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';

/**
 * O runtime da TV (Tizen 6 / Chromium 76) abre o app via file://.
 * Lá, <script type="module"> e o atributo crossorigin quebram o carregamento,
 * então o bundle sai em IIFE e o HTML vira script clássico.
 */
function classicScripts(): Plugin {
  return {
    name: 'nyx:classic-scripts',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/ type="module"/g, ' defer').replace(/ crossorigin/g, '');
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
        try {
          const upstream = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)' } });
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
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
