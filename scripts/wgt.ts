// Monta o .wgt que vai para o release do GitHub. É de lá que os instaladores de
// celular/PC (Apps2Samsung, TV Installer…) baixam o Nyx.
//
//   bun run wgt   → .build/release/nyx.wgt
//
// Sai SEM assinatura, de propósito: o instalador assina de novo com o certificado da
// TV de quem instala. O .wgt do ./scripts/tv.sh leva o seu certificado e só serve na sua TV.
import { $ } from 'bun';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const out = join(root, '.build', 'release');
const stage = join(out, 'pkg');
const wgt = join(out, 'nyx.wgt');

// O arquivo é público: nada da lista do .env.local (--seed) nem do endereço do --report.
const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'];
const leaking = envFiles.filter((f) => existsSync(join(root, f)) && /^\s*VITE_/m.test(readFileSync(join(root, f), 'utf8')));
if (leaking.length) {
  console.error(`ERRO: ${leaking.join(', ')} define VITE_*, que iria para dentro do app publicado`);
  process.exit(1);
}
const env: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith('VITE_')) env[k] = v;

$.cwd(root);
await $`bun run build`.env(env);
await $`bun scripts/check-compat.ts`;

// versão do pacote da TV = versão do package.json (igual ao tv.sh)
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;
rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(root, 'dist'), stage, { recursive: true });
const xml = readFileSync(join(root, 'tizen/config.xml'), 'utf8').replace(/ version="[0-9.]+" viewmodes/, ` version="${version}" viewmodes`);
writeFileSync(join(stage, 'config.xml'), xml);
await $`python3 -I scripts/make-icon.py ${join(stage, 'icon.png')} 512`;
await $`zip -qrX ${wgt} . -x '.*' '*/.*'`.cwd(stage);

const bytes = readFileSync(wgt);
const sha = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
console.log(`ok  nyx.wgt ${version} (${(bytes.length / 1024).toFixed(0)} KB, sem assinatura)\n    sha256 ${sha}\n    ${wgt}`);
