// Garante que o build roda no motor da TV (Chromium 76 = ES2019).
// Falha se aparecer sintaxe ES2020+ no JS ou CSS que o Chrome 76 não entende.
import { parse } from 'acorn';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(import.meta.dir, '..', 'dist');
let failed = false;

for (const file of ['boot.js', 'app.js', 'worker.js']) {
  const code = readFileSync(join(dist, file), 'utf8');
  try {
    parse(code, { ecmaVersion: 2019, sourceType: 'script' });
    console.log(`ok  ${file} (${(code.length / 1024).toFixed(0)} KB) é ES2019`);
  } catch (err) {
    const pos = (err as { pos?: number }).pos ?? 0;
    console.error(`ERRO ${file}: ${(err as Error).message}\n  …${code.slice(Math.max(0, pos - 80), pos + 80)}…`);
    failed = true;
  }
}

// Propriedades CSS que o Chromium 76 não suporta. Com bundle único o Vite embute o CSS no app.js.
const forbiddenCss = [/\binset\s*:/, /aspect-ratio\s*:/, /\bclamp\(/, /:focus-visible/, /backdrop-filter/, /:is\(/, /:where\(/, /:has\(/];
const cssFiles = existsSync(join(dist, 'assets')) ? readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.css')).map((f) => join('assets', f)) : [];
for (const file of cssFiles.concat('app.js')) {
  const css = readFileSync(join(dist, file), 'utf8');
  const before = failed;
  for (const re of forbiddenCss) {
    const m = css.match(re);
    if (m) {
      console.error(`ERRO ${file}: "${m[0]}" não funciona no Chrome 76`);
      failed = true;
    }
  }
  if (failed === before) console.log(`ok  ${file} sem CSS proibido`);
}

process.exit(failed ? 1 : 0);
