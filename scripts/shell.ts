// "Casca" = o que vem no .wgt e a atualização sem cabo NÃO troca: carregador (src/boot), index.html,
// config.xml (privilégios) e arquivos de public/ (fontes). O hash dela entra no boot.js e no
// manifest.json publicado: a TV só aceita versão baixada feita para a mesma casca.
//
// Mexeu em algo daqui? Quem já tem o Nyx precisa reinstalar o .wgt uma vez (o app avisa em Configurações › Sobre).
// Atenção: o plugin que troca o app.js pelo boot.js no index.html (vite.config.ts) também é casca, mas fica fora do hash.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// import.meta.url (e não dirname): o Vite embute este arquivo no vite.boot.config.ts
const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => !f.startsWith('.'))
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

export function shellHash(): string {
  const files = [join(root, 'index.html'), join(root, 'tizen/config.xml'), ...walk(join(root, 'public')), ...walk(join(root, 'src/boot'))]
    .map((p) => relative(root, p).split('\\').join('/'))
    .sort();
  const h = createHash('sha256');
  for (const f of files) {
    let body = readFileSync(join(root, f));
    // a versão do config.xml muda a cada release e não muda a casca
    if (f === 'tizen/config.xml') body = Buffer.from(body.toString('utf8').replace(/ version="[0-9.]+" viewmodes/, ' viewmodes'));
    h.update(f + '\0').update(body).update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

if (import.meta.main) console.log(shellHash());
