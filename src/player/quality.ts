// Qualidade automática dos canais ao vivo.
// O provedor entrega cada qualidade como um stream separado (não é HLS adaptativo),
// então quem decide descer de 4K → FHD → HD → SD é o app, vigiando os travamentos.
import type { PlaySource, Quality } from '../data/types';
import { QUALITY_RANK } from '../data/normalize';

export type QualityPref = 'auto' | Exclude<Quality, ''>;

/** Índice da fonte inicial: escolha salva do canal > preferência > a melhor abaixo dela. */
export function pickStart(sources: PlaySource[], pref: QualityPref, saved: Quality | null): number {
  if (!sources.length) return -1;
  const want = saved || (pref === 'auto' ? 'FHD' : pref);
  const exact = sources.findIndex((s) => s.quality === want);
  if (exact !== -1) return exact;
  const rank = QUALITY_RANK[want];
  const below = sources.findIndex((s) => QUALITY_RANK[s.quality] <= rank && s.quality !== '');
  if (below !== -1) return below;
  const unknown = sources.findIndex((s) => s.quality === '');
  return unknown !== -1 ? unknown : sources.length - 1;
}

/** Próxima fonte para tentar depois de falhar em `current`: primeiro as piores, depois as melhores. */
export function nextFallback(sources: PlaySource[], tried: Set<number>, current: number): number {
  const rank = (i: number) => QUALITY_RANK[sources[i].quality];
  const order = sources
    .map((_, i) => i)
    .filter((i) => !tried.has(i))
    .sort((a, b) => {
      const da = rank(a) <= rank(current) ? 0 : 1;
      const db = rank(b) <= rank(current) ? 0 : 1;
      return da - db || (da === 0 ? rank(b) - rank(a) : rank(a) - rank(b));
    });
  return order.length ? order[0] : -1;
}

/**
 * Qualidade que desceu sozinha num canal. Vale por LEARNED_TTL_MS desde a última descida: depois
 * disso o canal volta a abrir pela qualidade-alvo (no Automático, FHD).
 */
export interface Learned {
  q: Quality;
  at: number;
  /** Subidas que travaram de novo neste canal (a espera dobra a cada uma). */
  fails: number;
}

export const LEARNED_TTL_MS = 10 * 60000;
/** Tempo tocando sem travar antes de tentar subir um nível. */
export const UPGRADE_BASE_MS = 3 * 60000;
/** Subidas que travaram antes de desistir de subir naquele canal. */
export const UPGRADE_MAX_FAILS = 3;
/** Tempo sem travar na qualidade nova para a subida contar como certa. */
export const UPGRADE_CONFIRM_MS = 60000;

/** Registro ainda válido, ou null se venceu (o canal volta a começar pela qualidade-alvo). */
export function liveLearned(l: Learned | undefined, now: number): Learned | null {
  return l && now - l.at < LEARNED_TTL_MS ? l : null;
}

/** Espera sem travar antes da próxima subida: 3, 6, 12 min; null = desistiu. */
export function upgradeDelay(fails: number): number | null {
  return fails >= UPGRADE_MAX_FAILS ? null : UPGRADE_BASE_MS * Math.pow(2, fails);
}

/** Fonte um nível acima de `current` sem passar da qualidade-alvo, ou -1 se já está nela. */
export function upgradeTarget(sources: PlaySource[], current: number, target: number): number {
  if (!sources[current] || !sources[target]) return -1;
  const cur = QUALITY_RANK[sources[current].quality];
  const max = QUALITY_RANK[sources[target].quality];
  let best = -1;
  sources.forEach((s, i) => {
    const r = QUALITY_RANK[s.quality];
    if (r > cur && r <= max && (best === -1 || r < QUALITY_RANK[sources[best].quality])) best = i;
  });
  return best;
}

export interface StallRules {
  /** Tempo máximo para começar a tocar. */
  startupMs: number;
  /** Janela de observação dos travamentos. */
  windowMs: number;
  /** Travamentos dentro da janela que disparam a troca. */
  maxStalls: number;
  /** Tempo total carregando dentro da janela que dispara a troca. */
  maxBufferingMs: number;
}

export const DEFAULT_RULES: StallRules = { startupMs: 9000, windowMs: 60000, maxStalls: 3, maxBufferingMs: 7000 };

/**
 * Regras com o buffer escolhido pelo usuário: o AVPlay só toca (e só volta de uma travada) depois
 * de juntar `bufferSec` segundos, então essa espera não pode contar como "não está aguentando".
 */
export function stallRules(bufferSec: number): StallRules {
  const extra = Math.max(0, bufferSec) * 1000;
  return { ...DEFAULT_RULES, startupMs: DEFAULT_RULES.startupMs + extra, maxBufferingMs: DEFAULT_RULES.maxBufferingMs + extra };
}

/**
 * Observa os eventos do player e diz quando a qualidade atual não está aguentando.
 * O relógio é injetado para testar sem esperar de verdade.
 */
export class StallMonitor {
  private openedAt = 0;
  private started = false;
  private bufferingSince = 0;
  /** Desde quando toca sem travar (0 = ainda não tocou ou está carregando). */
  private calmSince = 0;
  private stalls: { at: number; ms: number }[] = [];

  constructor(private rules: StallRules = DEFAULT_RULES, private now: () => number = Date.now) {}

  reset() {
    this.openedAt = this.now();
    this.started = false;
    this.bufferingSince = 0;
    this.calmSince = 0;
    this.stalls = [];
  }

  playing() {
    if (!this.started) {
      this.started = true;
      this.bufferingSince = 0;
      this.calmSince = this.now();
      return;
    }
    if (this.bufferingSince) {
      this.stalls.push({ at: this.bufferingSince, ms: this.now() - this.bufferingSince });
      this.bufferingSince = 0;
      this.calmSince = this.now();
    }
  }

  buffering() {
    if (this.started && !this.bufferingSince) this.bufferingSince = this.now();
  }

  /** Há quanto tempo toca sem travar. */
  stableFor(): number {
    return this.started && !this.bufferingSince ? this.now() - this.calmSince : 0;
  }

  /** Motivo para trocar de qualidade agora, ou null se está tudo bem. */
  verdict(): 'startup' | 'stalls' | 'buffering' | null {
    const now = this.now();
    if (!this.started) return now - this.openedAt > this.rules.startupMs ? 'startup' : null;
    const since = now - this.rules.windowMs;
    const recent = this.stalls.filter((s) => s.at >= since);
    const ongoing = this.bufferingSince ? now - this.bufferingSince : 0;
    if (recent.length + (ongoing > 1500 ? 1 : 0) >= this.rules.maxStalls) return 'stalls';
    const total = recent.reduce((sum, s) => sum + s.ms, 0) + ongoing;
    return total >= this.rules.maxBufferingMs ? 'buffering' : null;
  }
}
