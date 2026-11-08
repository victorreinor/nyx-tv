// Saúde da lista: o servidor responde? a conta vale? o vídeo sai?
// As funções de classificação são puras (tests/health.test.ts); `runHealth` faz a rede, no worker.
import { toNumber } from './normalize';
import type { HealthReason, HealthReport, HealthStep, HealthStepId, PlaylistConfig } from './types';
import { apiUrl, probe, type ProbeResult, xmltvUrl } from './xtream';

const DAY = 86400000;
/** Conta que vence em menos que isso gera aviso ao abrir. */
const EXPIRING_DAYS = 3;
/** Ao abrir o app: mais que isso sem resposta = servidor fora. */
const QUICK_TIMEOUT_MS = 6000;
const STREAM_TIMEOUT_MS = 10000;

function step(id: HealthStepId, state: HealthStep['state'], reason: HealthReason, detail: string, ms: number, vars?: HealthStep['vars']): HealthStep {
  return { id, state, reason, detail, ms, vars };
}

function skipped(id: HealthStepId): HealthStep {
  return step(id, 'skip', 'skipped', '', 0);
}

const looksHtml = (r: ProbeResult) => /^\s*</.test(r.text) || r.type.indexOf('text/html') !== -1;

/** Quem respondeu a página de erro (o nginx de pé com o painel caído é o caso mais comum). */
function serverName(r: ProbeResult): string {
  const m = /(nginx|cloudflare|apache|litespeed|openresty)/i.exec(r.text);
  return m ? ' · ' + m[1].toLowerCase() : '';
}

/** Falhas de transporte, iguais para qualquer etapa. null = chegou resposta 2xx. */
function transportFail(id: HealthStepId, r: ProbeResult): HealthStep | null {
  if (r.timedOut) return step(id, 'fail', 'timeout', `timeout ${Math.round(r.ms / 1000)} s`, r.ms, { s: Math.round(r.ms / 1000) });
  if (r.error || !r.status) return step(id, 'fail', 'network', r.error || 'status 0', r.ms);
  if (r.status < 200 || r.status >= 300) return step(id, 'fail', 'http', `HTTP ${r.status}${serverName(r)}`, r.ms, { code: r.status });
  return null;
}

/** Respondeu, mas uma página (ou lixo) no lugar do JSON. */
const notJson = (id: HealthStepId, r: ProbeResult) => step(id, 'fail', 'notJson', looksHtml(r) ? 'HTML' : r.text.slice(0, 40), r.ms);

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Login do Xtream (player_api.php sem ação): diz se o servidor está de pé e como está a conta. */
export function loginSteps(r: ProbeResult, now: number): { server: HealthStep; account: HealthStep } {
  const t = transportFail('server', r);
  if (t) return { server: t, account: skipped('account') };
  const d = parse(r.text) as { user_info?: Record<string, unknown> } | undefined;
  if (d === undefined) return { server: notJson('server', r), account: skipped('account') };
  const server = step('server', 'ok', 'ok', `HTTP ${r.status}`, r.ms);
  const ui = d && d.user_info;
  // sem user_info ou auth=0: o painel não reconheceu usuário/senha
  if (!ui || String(ui.auth) === '0') return { server, account: step('account', 'fail', 'auth', 'auth=0', 0) };
  const status = String(ui.status || '');
  const expires = toNumber(ui.exp_date) * 1000;
  const active = toNumber(ui.active_cons);
  const max = toNumber(ui.max_connections);
  const vars = { status, date: expires, active, max, days: expires ? Math.max(0, Math.ceil((expires - now) / DAY)) : 0 };
  const detail = `${status || '?'} · ${active}/${max}`;
  let account: HealthStep;
  if (/expired/i.test(status) || (expires && expires < now)) account = step('account', 'fail', 'expired', detail, 0, vars);
  else if (/banned/i.test(status)) account = step('account', 'fail', 'banned', detail, 0, vars);
  else if (/disabled/i.test(status)) account = step('account', 'fail', 'disabled', detail, 0, vars);
  else if (status && status !== 'Active') account = step('account', 'fail', 'inactive', detail, 0, vars);
  else if (max > 0 && active >= max) account = step('account', 'warn', 'connections', detail, 0, vars);
  else if (expires && expires - now < EXPIRING_DAYS * DAY) account = step('account', 'warn', 'expiring', detail, 0, vars);
  else account = step('account', 'ok', 'ok', detail, 0, vars);
  return { server, account };
}

/** API do catálogo (categorias ao vivo): já vimos o login responder e o resto dar 404. */
export function apiStep(r: ProbeResult): HealthStep {
  const t = transportFail('api', r);
  if (t) return t;
  const d = parse(r.text);
  if (d === undefined) return notJson('api', r);
  if (!Array.isArray(d)) return step('api', 'fail', 'badData', typeof d, r.ms);
  return step('api', 'ok', 'ok', `HTTP ${r.status}`, r.ms, { n: d.length });
}

/** Lista M3U: o arquivo responde e parece M3U. */
export function m3uStep(r: ProbeResult): HealthStep {
  const t = transportFail('server', r);
  if (t) return t;
  if (r.text.indexOf('#EXTM3U') === -1 && r.text.indexOf('#EXTINF') === -1) return step('server', 'fail', 'badData', looksHtml(r) ? 'HTML' : `${r.bytes} bytes`, r.ms);
  return step('server', 'ok', 'ok', `HTTP ${r.status}`, r.ms);
}

/** Começo de um vídeo (canal ou filme): chegou alguma coisa que não é página de erro? */
export function streamStep(id: HealthStepId, r: ProbeResult): HealthStep {
  const t = transportFail(id, r);
  if (t) return t;
  if (!r.bytes) return step(id, 'fail', 'badData', '0 bytes', r.ms);
  if (looksHtml(r)) return step(id, 'fail', 'badData', 'HTML', r.ms);
  const ts = r.first === 0x47 ? ' · TS' : '';
  return step(id, 'ok', 'ok', `${Math.round(r.bytes / 1024)} KB${ts}`, r.ms, { kb: Math.round(r.bytes / 1024) });
}

/** Começo do XMLTV. */
export function epgStep(r: ProbeResult): HealthStep {
  const t = transportFail('epg', r);
  if (t) return t;
  if (r.text.indexOf('<tv') === -1 && r.text.indexOf('<?xml') === -1) return step('epg', 'fail', 'badData', looksHtml(r) ? 'HTML' : `${r.bytes} bytes`, r.ms);
  return step('epg', 'ok', 'ok', `HTTP ${r.status}`, r.ms);
}

/** Próximo endereço de uma playlist HLS (variante ou primeiro segmento), resolvido pelo endereço final. */
export function hlsNext(text: string, base: string): string {
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.charAt(0) === '#') continue;
    try {
      return new URL(line, base).href;
    } catch {
      return '';
    }
  }
  return '';
}

export function summarize(steps: HealthStep[], at: number, full: boolean): HealthReport {
  const main = steps.filter((s) => s.state === 'fail')[0] || steps.filter((s) => s.state === 'warn')[0] || null;
  return { at, full, state: main ? (main.state as 'fail' | 'warn') : 'ok', main, steps };
}

/** Canal: lê o começo do stream. HLS: segue a playlist até o primeiro segmento, que é onde o vídeo está. */
async function streamCheck(id: HealthStepId, url: string, range: boolean): Promise<HealthStep> {
  let r = await probe(url, STREAM_TIMEOUT_MS, range ? 65536 : 16384, { range });
  let ms = r.ms;
  for (let hop = 0; hop < 3 && r.text.indexOf('#EXTM3U') !== -1 && !transportFail(id, r); hop++) {
    const next = hlsNext(r.text, r.url);
    if (!next) return step(id, 'fail', 'badData', 'm3u8 · 0', ms);
    r = await probe(next, STREAM_TIMEOUT_MS, 16384);
    ms += r.ms;
  }
  const s = streamStep(id, r);
  s.ms = ms;
  return s;
}

export interface HealthTargets {
  /** Teste completo: também abre um canal, um filme e a grade. */
  full: boolean;
  /** Candidatos em ordem: passa se algum abrir (um arquivo apagado no provedor não diz que o vídeo não sai). */
  liveUrls?: string[];
  movieUrls?: string[];
}

/** Tenta os candidatos em ordem até um abrir. */
async function videoCheck(id: HealthStepId, urls: string[], range: boolean): Promise<HealthStep> {
  let last: HealthStep = skipped(id);
  let ms = 0;
  let tries = 0;
  for (const url of urls) {
    last = await streamCheck(id, url, range);
    ms += last.ms;
    tries++;
    if (last.state === 'ok') break;
  }
  last.ms = ms;
  // quantos foram tentados até abrir (ou todos, se nenhum abriu)
  if (tries > 1) last.detail += ` · ${tries}/${urls.length}`;
  return last;
}

/** Canal abriu e filme não (ou o contrário): é o arquivo, não o servidor. Vira aviso. */
export function softenVideo(steps: HealthStep[]): void {
  const live = steps.filter((s) => s.id === 'live')[0];
  const movie = steps.filter((s) => s.id === 'movie')[0];
  if (!live || !movie) return;
  if (live.state === 'ok' && movie.state === 'fail') movie.state = 'warn';
  else if (movie.state === 'ok' && live.state === 'fail') live.state = 'warn';
}

export async function runHealth(p: PlaylistConfig, opts: HealthTargets): Promise<HealthReport> {
  const steps: HealthStep[] = [];
  if (p.type === 'xtream') {
    // em paralelo: o tempo de abrir o app fica no máximo QUICK_TIMEOUT_MS
    const [login, cats] = await Promise.all([
      probe(apiUrl(p), QUICK_TIMEOUT_MS, 65536, { textMax: 65536 }),
      probe(apiUrl(p, 'get_live_categories'), QUICK_TIMEOUT_MS, 1048576, { textMax: 1048576 }),
    ]);
    const l = loginSteps(login, Date.now());
    steps.push(l.server, l.account, apiStep(cats));
  } else {
    steps.push(m3uStep(await probe(String(p.url), QUICK_TIMEOUT_MS * 2, 65536, { textMax: 65536 })));
  }

  if (opts.full) {
    const account = steps.filter((s) => s.id === 'account')[0];
    // conta recusada ou todas as telas em uso: o vídeo não vai abrir, e testar só gastaria uma conexão
    const blocked = !!account && (account.state === 'fail' || account.reason === 'connections');
    const lives = opts.liveUrls || [];
    const movies = opts.movieUrls || [];
    steps.push(!lives.length || blocked ? skipped('live') : await videoCheck('live', lives, false));
    steps.push(!movies.length || blocked ? skipped('movie') : await videoCheck('movie', movies, true));
    softenVideo(steps);
    const epg = p.type === 'xtream' ? xmltvUrl(p) : p.epgUrl;
    steps.push(epg ? epgStep(await probe(epg, STREAM_TIMEOUT_MS, 4096)) : skipped('epg'));
  }
  return summarize(steps, Date.now(), opts.full);
}
