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
 * Observa os eventos do player e diz quando a qualidade atual não está aguentando.
 * O relógio é injetado para testar sem esperar de verdade.
 */
export class StallMonitor {
  private openedAt = 0;
  private started = false;
  private bufferingSince = 0;
  private stalls: { at: number; ms: number }[] = [];

  constructor(private rules: StallRules = DEFAULT_RULES, private now: () => number = Date.now) {}

  reset() {
    this.openedAt = this.now();
    this.started = false;
    this.bufferingSince = 0;
    this.stalls = [];
  }

  playing() {
    if (!this.started) {
      this.started = true;
      this.bufferingSince = 0;
      return;
    }
    if (this.bufferingSince) {
      this.stalls.push({ at: this.bufferingSince, ms: this.now() - this.bufferingSince });
      this.bufferingSince = 0;
    }
  }

  buffering() {
    if (this.started && !this.bufferingSince) this.bufferingSince = this.now();
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
