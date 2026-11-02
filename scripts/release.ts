// Nova versão: sobe o número, escreve o CHANGELOG com os commits desde a última tag,
// faz o commit "release: vX.Y.Z" e cria a tag. Depois: git push --follow-tags
//
//   bun run release patch   1.0.0 → 1.0.1   correção
//   bun run release minor   1.0.1 → 1.1.0   funcionalidade nova
//   bun run release major   1.1.0 → 2.0.0   mudança grande / incompatível
import { $ } from 'bun';
import { readFileSync, writeFileSync } from 'node:fs';

const kind = process.argv[2] as 'patch' | 'minor' | 'major';
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('uso: bun run release patch|minor|major');
  process.exit(1);
}
if ((await $`git status --porcelain`.text()).trim()) {
  console.error('há mudanças sem commit: faça o commit antes de lançar a versão');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [ma, mi, pa] = String(pkg.version).split('.').map(Number);
const next = kind === 'major' ? `${ma + 1}.0.0` : kind === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;

const lastTag = (await $`git describe --tags --abbrev=0`.nothrow().text()).trim();
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
const subjects = (await $`git log ${range} --pretty=%s`.text()).split('\n').filter((l) => l && !l.startsWith('release:'));
const pick = (re: RegExp) => subjects.filter((s) => re.test(s)).map((s) => '- ' + s.replace(/^\w+(\([^)]*\))?:\s*/, ''));
const feats = pick(/^feat/);
const fixes = pick(/^fix/);
const other = subjects.filter((s) => !/^(feat|fix)/.test(s)).map((s) => '- ' + s);

const date = new Date().toISOString().slice(0, 10);
let entry = `## [${next}] — ${date}\n`;
if (feats.length) entry += `\n### Novidades\n${feats.join('\n')}\n`;
if (fixes.length) entry += `\n### Correções\n${fixes.join('\n')}\n`;
if (other.length) entry += `\n### Outros\n${other.join('\n')}\n`;

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const marker = changelog.indexOf('\n## ');
writeFileSync('CHANGELOG.md', marker === -1 ? `${changelog.trimEnd()}\n\n${entry}` : `${changelog.slice(0, marker + 1)}${entry}\n${changelog.slice(marker + 1)}`);

pkg.version = next;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
const xml = readFileSync('tizen/config.xml', 'utf8').replace(/ version="[0-9.]+" viewmodes/, ` version="${next}" viewmodes`);
writeFileSync('tizen/config.xml', xml);

await $`git add package.json CHANGELOG.md tizen/config.xml`;
await $`git commit -q -m ${`release: v${next}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`}`;
await $`git tag -a ${'v' + next} -m ${'Nyx ' + next}`;
console.log(`v${next} pronta. Publique com: git push --follow-tags`);
