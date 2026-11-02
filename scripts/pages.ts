// Arquivos da atualização sem cabo para o GitHub Pages, a partir do dist/ já compilado:
//
//   .build/pages/update/manifest.json          versão, casca e SHA-256 de cada arquivo
//   .build/pages/update/<versão>/app.js
//   .build/pages/update/<versão>/worker.js
//
// O `bun run wgt` já chama (o .wgt e a atualização saem do mesmo build). Sozinho: bun scripts/pages.ts
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shellHash } from './shell';

const root = fileURLToPath(new URL('..', import.meta.url));
const FILES = ['app.js', 'worker.js'];

/**
 * Senha, servidor e chaves do .env.local não podem ir para um arquivo público (build feito com --seed).
 * Só os segredos: o nome de usuário pode coincidir com texto do app (ex.: o usuário do GitHub em Sobre).
 */
function assertNoSecrets(code: string) {
  const env = join(root, '.env.local');
  if (!existsSync(env)) return;
  for (const line of readFileSync(env, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && /PASS|HOST|KEY|TOKEN|SECRET/.test(m[1]) && m[2].length >= 6 && code.includes(m[2])) throw new Error(`o build contém o valor de ${m[1]} do .env.local (build com --seed?). Rode bun run build de novo sem ele.`);
  }
}

export function buildPages(out = join(root, '.build', 'pages')): { version: string; shell: string; out: string } {
  const dist = join(root, 'dist');
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;
  const shell = shellHash();
  // o boot.js leva versão e casca do build: confere que o dist é deste código
  const boot = readFileSync(join(dist, 'boot.js'), 'utf8');
  const literal = (v: string) => new RegExp('[`"\']' + v.split('.').join('\\.') + '[`"\']');
  if (!literal(shell).test(boot) || !literal(version).test(boot)) throw new Error('dist/ é de outro build: rode bun run build');

  rmSync(out, { recursive: true, force: true });
  const dir = join(out, 'update', version);
  mkdirSync(dir, { recursive: true });
  const files: Record<string, { sha256: string; size: number }> = {};
  for (const f of FILES) {
    const bytes = readFileSync(join(dist, f));
    assertNoSecrets(bytes.toString('utf8'));
    files[f] = { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
    copyFileSync(join(dist, f), join(dir, f));
  }
  writeFileSync(join(out, 'update', 'manifest.json'), JSON.stringify({ version, shell, files, date: new Date().toISOString() }, null, 2) + '\n');
  // a raiz só aponta para o repositório (o site existe para a atualização)
  writeFileSync(join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Nyx</title><meta http-equiv="refresh" content="0; url=https://github.com/victorreinor/nyx-tv">\n');
  return { version, shell, out };
}

if (import.meta.main) {
  const r = buildPages();
  console.log(`ok  atualização ${r.version} (casca ${r.shell}) em ${r.out}`);
}
