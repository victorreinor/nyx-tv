// Atualização sem cabo: qual versão abrir. Funções puras, usadas pelo carregador (boot.js) e testadas em tests/ota.test.ts.
//
// Até duas versões baixadas ficam no localStorage, em duas vagas (a/b):
//   cur  = a última que abriu e confirmou que funciona;
//   next = baixada e ainda não testada. Abre uma vez; se não confirmar, vira "ruim" e nunca mais é usada.
// Sem nenhuma das duas (ou se forem mais velhas que o pacote instalado), abre o app que veio no .wgt.

export type Slot = 'a' | 'b';

export interface Build {
  v: string;
  slot: Slot;
  /** aberturas sem confirmação (o app confirma alguns segundos depois de abrir) */
  tries: number;
}

export interface OtaState {
  /** casca (carregador + config.xml + index.html + fontes) para a qual as versões baixadas servem */
  shell: string;
  cur?: Build;
  next?: Build;
  /** versões que travaram: nunca são baixadas de novo */
  bad: string[];
  /** versão abandonada na abertura anterior (para o app avisar uma vez) */
  rolled?: string;
}

/** Aberturas seguidas sem confirmar até a versão confirmada ser abandonada (a nova tem só uma chance). */
export const CUR_MAX_TRIES = 3;
const BAD_KEEP = 10;

/** a > b em SemVer simples (x.y.z). */
export function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

function clean(s: unknown, shell: string): OtaState {
  const o = s as Partial<OtaState> | null;
  if (!o || typeof o !== 'object' || o.shell !== shell) return { shell, bad: [] };
  const ok = (b: unknown): b is Build => !!b && typeof (b as Build).v === 'string' && ((b as Build).slot === 'a' || (b as Build).slot === 'b');
  return {
    shell,
    cur: ok(o.cur) ? { v: o.cur.v, slot: o.cur.slot, tries: o.cur.tries | 0 } : undefined,
    next: ok(o.next) ? { v: o.next.v, slot: o.next.slot, tries: o.next.tries | 0 } : undefined,
    bad: Array.isArray(o.bad) ? o.bad.filter((v) => typeof v === 'string') : [],
    rolled: typeof o.rolled === 'string' ? o.rolled : undefined,
  };
}

function markBad(s: OtaState, v: string) {
  if (s.bad.indexOf(v) === -1) s.bad = s.bad.concat(v).slice(-BAD_KEEP);
}

export interface BootPlan {
  state: OtaState;
  /** versão baixada a abrir; sem ela, abre o app do pacote */
  run?: Build;
  /** primeira abertura desta versão */
  fresh: boolean;
  /** versão abandonada nesta abertura porque travou */
  rolledBack?: string;
}

/** Decide o que abrir. O estado devolvido já conta esta abertura e deve ser salvo antes de rodar. */
export function pickBoot(saved: unknown, packaged: string, shell: string): BootPlan {
  const s = clean(saved, shell);
  // abandonada na abertura anterior (quebrou ao abrir e o carregador recarregou)
  let rolledBack = s.rolled;
  s.rolled = undefined;
  // pacote instalado mais novo (ou igual) que o baixado: o baixado não serve mais
  if (s.cur && !newer(s.cur.v, packaged)) s.cur = undefined;
  if (s.next && !newer(s.next.v, packaged)) s.next = undefined;
  if (s.next && s.cur && s.next.slot === s.cur.slot) s.next = undefined;

  if (s.next && s.next.tries >= 1) {
    rolledBack = s.next.v;
    markBad(s, s.next.v);
    s.next = undefined;
  }
  if (s.next) {
    s.next = { v: s.next.v, slot: s.next.slot, tries: s.next.tries + 1 };
    return { state: s, run: s.next, fresh: true, rolledBack };
  }
  if (s.cur && s.cur.tries >= CUR_MAX_TRIES) {
    rolledBack = s.cur.v;
    markBad(s, s.cur.v);
    s.cur = undefined;
  }
  if (s.cur) {
    s.cur = { v: s.cur.v, slot: s.cur.slot, tries: s.cur.tries + 1 };
    return { state: s, run: s.cur, fresh: false, rolledBack };
  }
  return { state: s, fresh: false, rolledBack };
}

/** A versão `v` abriu bem: vira a confirmada (a anterior libera a vaga). */
export function confirmBoot(saved: unknown, shell: string, v: string): OtaState {
  const s = clean(saved, shell);
  if (s.next && s.next.v === v) {
    s.cur = { v, slot: s.next.slot, tries: 0 };
    s.next = undefined;
  } else if (s.cur && s.cur.v === v) {
    s.cur = { v, slot: s.cur.slot, tries: 0 };
  }
  return s;
}

/** A versão `v` falhou nesta abertura (não chegou a rodar ou não confirmou a tempo). */
export function rejectBoot(saved: unknown, shell: string, v: string): OtaState {
  const s = clean(saved, shell);
  if (s.next && s.next.v === v) s.next = undefined;
  if (s.cur && s.cur.v === v) s.cur = undefined;
  markBad(s, v);
  s.rolled = v;
  return s;
}

/**
 * Onde guardar a versão `v` recém-baixada. Devolve undefined se ela não deve ser guardada
 * (ruim, já guardada ou não é mais nova que a que está rodando).
 */
export function stageSlot(saved: unknown, shell: string, v: string, running: string): Slot | undefined {
  const s = clean(saved, shell);
  if (!newer(v, running) || s.bad.indexOf(v) !== -1) return undefined;
  if ((s.next && s.next.v === v) || (s.cur && s.cur.v === v)) return undefined;
  return s.cur && s.cur.slot === 'a' ? 'b' : 'a';
}

/** Estado depois de gravar `v` na vaga `slot` (substitui uma `next` que ainda não tinha sido testada). */
export function staged(saved: unknown, shell: string, v: string, slot: Slot): OtaState {
  const s = clean(saved, shell);
  s.next = { v, slot, tries: 0 };
  return s;
}

/** Estado sem a versão em espera (antes de escrever outra por cima da vaga dela). */
export function unstaged(saved: unknown, shell: string): OtaState {
  const s = clean(saved, shell);
  s.next = undefined;
  return s;
}

/** Vagas em uso (as outras podem ser apagadas). */
export function usedSlots(s: OtaState): Slot[] {
  const out: Slot[] = [];
  if (s.cur) out.push(s.cur.slot);
  if (s.next && s.next.slot !== (s.cur && s.cur.slot)) out.push(s.next.slot);
  return out;
}

/** O que o carregador expõe ao app em `window.NyxBoot`. Mudou aqui = casca nova = precisa reinstalar o .wgt. */
export interface NyxBoot {
  /** versão que veio no .wgt */
  packaged: string;
  /** versão rodando agora (baixada ou do pacote) */
  version: string;
  shell: string;
  /** está rodando uma versão baixada */
  ota: boolean;
  /** primeira abertura desta versão baixada */
  fresh: boolean;
  /** versão que travou e foi abandonada nesta abertura */
  rolledBack?: string;
  /** URL do worker desta versão */
  workerUrl: string;
  /** o app terminou de executar o script (chamado logo depois do render) */
  started(): void;
  /** o app abriu bem: confirma a versão */
  ok(): void;
  /** versão baixada esperando a próxima abertura */
  pending(): string | undefined;
  /** vale a pena baixar `v`? (mais nova, não travou antes, ainda não guardada) */
  wants(v: string): boolean;
  /** guarda uma versão baixada (já conferida). false se não deve ou não coube. */
  stage(v: string, app: string, worker: string): boolean;
}
