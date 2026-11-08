// Saúde da lista do lado da UI: último resultado, histórico curto (localStorage) e os textos da tela.
import { createSignal } from 'solid-js';
import { call } from '../data/client';
import type { HealthReport, HealthStep, HealthStepId } from '../data/types';
import { fmtWhen, type MessageKey, t } from './i18n';
import { activePlaylist, settings } from './settings';

export interface HealthLogEntry {
  at: number;
  state: HealthReport['state'];
  step: HealthStepId | '';
  detail: string;
}

const LOG_KEY = 'nyx:health';
const LOG_MAX = 20;

function loadLog(): HealthLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as HealthLogEntry[]).slice(-LOG_MAX) : [];
  } catch {
    return [];
  }
}

const [health, setHealth] = createSignal<HealthReport | null>(null);
const [checking, setChecking] = createSignal(false);
const [log, setLog] = createSignal<HealthLogEntry[]>(loadLog());
export { checking, health, log as healthLog };

function record(r: HealthReport) {
  setHealth(r);
  const entry: HealthLogEntry = { at: r.at, state: r.state, step: r.main ? r.main.id : '', detail: r.main ? r.main.detail : '' };
  const next = log().concat(entry).slice(-LOG_MAX);
  setLog(next);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch {
    // armazenamento cheio: o histórico fica só nesta sessão
  }
  // vai para o relatório (./scripts/tv.sh --report)
  const line = r.steps.map((s) => `${s.id}=${s.state}(${s.detail}${s.ms ? ' ' + s.ms + 'ms' : ''})`).join(' ');
  if (r.state === 'ok') console.log('[saúde] ok', line);
  else console.warn('[saúde]', r.state, line);
}

let inflight: Promise<HealthReport | null> | null = null;

/** Testa a lista ativa. Rápido = login + catálogo (não gasta conexão); completo = também canal, filme e grade. */
export function checkHealth(full = false): Promise<HealthReport | null> {
  const p = activePlaylist();
  if (!p) return Promise.resolve(null);
  if (inflight && !full) return inflight;
  setChecking(true);
  const run: Promise<HealthReport | null> = call('health', p, full, settings.streamFormat, import.meta.env.DEV)
    .then((r) => {
      record(r);
      return r;
    })
    .catch((err) => {
      console.error('[saúde] teste não rodou', err);
      return null;
    })
    .finally(() => {
      if (inflight !== run) return;
      inflight = null;
      setChecking(false);
    });
  inflight = run;
  return run;
}

/** Desde quando o servidor está fora (0 = a última verificação não falhou no servidor). */
export function downSince(): number {
  const l = log();
  let since = 0;
  for (let i = l.length - 1; i >= 0 && l[i].state === 'fail' && (l[i].step === 'server' || l[i].step === 'api'); i--) since = l[i].at;
  return since;
}

// ---------- textos ----------

/** A falha é do servidor (login/catálogo), não só do vídeo ou da grade. */
export function serverDown(r: HealthReport): boolean {
  return r.state === 'fail' && !!r.main && (r.main.id === 'server' || r.main.id === 'api');
}

const TRANSPORT: Partial<Record<HealthStep['reason'], MessageKey>> = {
  timeout: 'health.r.timeout',
  network: 'health.r.network',
  http: 'health.r.http',
  notJson: 'health.r.notJson',
  badData: 'health.r.badData',
  skipped: 'health.r.skipped',
};

export function stepLabel(id: HealthStepId): string {
  return t(('health.step.' + id) as MessageKey);
}

/** O que aconteceu em cada etapa, em linguagem de gente. */
export function stepText(s: HealthStep): string {
  const v = s.vars || {};
  const date = v.date ? fmtWhen(Number(v.date)) : '';
  if (s.state === 'ok') {
    if (s.id === 'account') return date ? t('health.ok.account', { date, active: v.active || 0, max: v.max || 0 }) : t('health.ok.accountNoDate', { active: v.active || 0, max: v.max || 0 });
    if (s.id === 'api') return t('health.ok.api', { n: v.n || 0 });
    if (s.id === 'live' || s.id === 'movie') return t('health.ok.video', { kb: v.kb || 0 });
    return t('health.ok.server');
  }
  switch (s.reason) {
    case 'auth': return t('health.r.auth');
    case 'expired': return date ? t('health.r.expired', { date }) : t('health.r.expiredNoDate');
    case 'banned': return t('health.r.banned');
    case 'disabled': return t('health.r.disabled');
    case 'inactive': return t('health.r.inactive', { status: v.status || '?' });
    case 'connections': return t('health.r.connections', { active: v.active || 0, max: v.max || 0 });
    case 'expiring': return t('health.r.expiring', { date, days: v.days || 0 });
  }
  const key = TRANSPORT[s.reason];
  return key ? t(key, { s: v.s || 0, code: v.code || '' }) : s.detail;
}

/** Título e explicação do resultado inteiro (tela de diagnóstico, boot, player, sincronização). */
export function healthMessage(r: HealthReport): { title: string; sub: string } {
  const m = r.main;
  if (!m) return { title: t('health.title.ok'), sub: r.full ? t('health.sub.okFull') : t('health.sub.ok') };
  if (m.id === 'account') {
    if (m.reason === 'connections') return { title: t('health.title.connections'), sub: t('health.sub.connections') };
    if (m.reason === 'expiring') return { title: m.vars && m.vars.days ? t('health.title.expiring', { days: m.vars.days }) : t('health.title.expiringToday'), sub: t('health.sub.expiring') };
    if (m.reason === 'auth') return { title: t('health.title.auth'), sub: t('health.sub.auth') };
    if (m.reason === 'expired') return { title: t('health.title.expired'), sub: t('health.sub.account') };
    return { title: t('health.title.blocked'), sub: t('health.sub.account') };
  }
  if (m.id === 'live' || m.id === 'movie') {
    return m.state === 'warn' ? { title: t('health.title.someVideo'), sub: t('health.sub.someVideo') } : { title: t('health.title.video'), sub: t('health.sub.video') };
  }
  if (m.id === 'epg') return { title: t('health.title.epg'), sub: t('health.sub.epg') };
  return { title: t('health.title.down'), sub: t('health.sub.down') };
}

/** Uma linha só (player, formulário, sincronização). */
export function healthLine(r: HealthReport): string {
  return r.main ? `${healthMessage(r).title} · ${stepLabel(r.main.id)}: ${stepText(r.main)}` : healthMessage(r).title;
}

/** Algo falhou (sincronização, vídeo): testa a lista e devolve o resultado só se ela estiver com problema. */
export function failingReport(): Promise<HealthReport | null> {
  return checkHealth(false).then((r) => (r && r.state === 'fail' ? r : null));
}

/** Sincronização falhou: se a lista está fora, diz isso em vez do erro cru. */
export async function syncErrorText(err: unknown): Promise<string> {
  const r = await failingReport();
  return r ? healthLine(r) : t('sync.error', { msg: String((err as Error).message || err) });
}
