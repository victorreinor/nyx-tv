// Teste visual no Chrome do Mac (headless): abre o app do servidor de dev, aperta teclas
// do controle e salva capturas 1920×1080.
//
//   bun scripts/shot.ts <pasta-saida> [passos...]
//   passo = nome-da-tecla (ArrowDown, Enter, Escape, F1..F4, PageUp...) | wait:ms | shot:nome | type:texto
//
// O perfil do Chrome fica em .build/chrome (o IndexedDB persiste: só a 1ª vez sincroniza).
import puppeteer, { type KeyInput } from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] || '.build/shots';
const steps = process.argv.slice(3);
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: process.env.SHOT_PROFILE || join(tmpdir(), 'nyx-shot-chrome'),
  args: ['--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required', '--lang=pt-BR'],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + (e as Error).message));
page.on('console', (m) => m.type() === 'error' && !/webapis|Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()));

await page.goto(process.env.URL || 'http://localhost:5173', { waitUntil: 'domcontentloaded' });
// pronto quando a Início (ou boas-vindas) aparece; a 1ª sincronização pode levar ~1 min
await page
  .waitForSelector('.home, .onboarding .btn, .browse, .live', { timeout: Number(process.env.WAIT_MS || 120000) })
  .catch(() => console.log('aviso: tela inicial não apareceu a tempo; capturando assim mesmo'));
await new Promise((r) => setTimeout(r, 1500));

let n = 0;
for (const step of steps) {
  if (step.startsWith('wait:')) await new Promise((r) => setTimeout(r, Number(step.slice(5))));
  else if (step.startsWith('shot:')) await page.screenshot({ path: join(out, `${String(++n).padStart(2, '0')}-${step.slice(5)}.png`) });
  else if (step.startsWith('type:')) for (const ch of step.slice(5)) await page.keyboard.press(ch as KeyInput);
  else {
    await page.keyboard.press(step as KeyInput);
    await new Promise((r) => setTimeout(r, 250));
  }
}
if (!steps.some((s) => s.startsWith('shot:'))) await page.screenshot({ path: join(out, '01-tela.png') });
await browser.close();
if (errors.length) console.log(errors.join('\n'));
console.log(`capturas em ${out}`);
