// Motor de foco para controle remoto.
//
// Modelo: árvore de Zonas (row/col) cujas folhas são Listas (row/col/grid) com N itens.
// Setas andam DENTRO da lista por índice; na borda, sobem para a zona pai e entram na
// zona vizinha, que lembra o último filho focado. Não mede layout (getBoundingClientRect
// força reflow e engasga a TV), então funciona igual com listas virtualizadas.
import {
  type Accessor,
  type JSX,
  createContext,
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
  useContext,
} from 'solid-js';
import type { KeyName } from './keys';

export type Dir = 'up' | 'down' | 'left' | 'right';
type Axis = 'row' | 'col';

interface Base {
  parent: Zone | null;
  el: () => HTMLElement | undefined;
  enabled: () => boolean;
}

export interface Zone extends Base {
  kind: 'zone';
  axis: Axis;
  children: FNode[];
  last: FNode | null;
  onKey?: (k: KeyName) => boolean;
}

export interface FList extends Base {
  kind: 'list';
  axis: Axis | 'grid';
  cols: () => number;
  count: () => number;
  index: Accessor<number>;
  setIndex: (i: number) => void;
  onSelect?: (i: number) => void;
  onKey?: (k: KeyName, i: number) => boolean;
  /** Grade: ◀ ▶ na borda passam para a fileira anterior/seguinte (teclados). */
  wrap?: () => boolean;
}

type FNode = Zone | FList;

const [active, setActive] = createSignal<FList | null>(null);
export { active };
/** Quantas camadas isoladas (modal, painel) estão abertas. O player cede as teclas quando > 0. */
const [trapCount, setTrapCount] = createSignal(0);
export { trapCount };

/** Zona que pediu foco mas ainda não tinha itens (dados carregando). */
let pending: Zone | null = null;

const root: Zone = { kind: 'zone', axis: 'row', children: [], last: null, parent: null, el: () => document.body, enabled: () => true };
const ZoneCtx = createContext<Zone>(root);

function ordered(z: Zone): FNode[] {
  return z.children.slice().sort((a, b) => {
    const ea = a.el();
    const eb = b.el();
    if (!ea || !eb) return 0;
    return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

function contains(z: Zone, n: FNode): boolean {
  for (let p = n.parent; p; p = p.parent) if (p === z) return true;
  return false;
}

function descend(n: FNode): FList | null {
  if (!n.enabled()) return null;
  if (n.kind === 'list') return n.count() > 0 ? n : null;
  const kids = ordered(n).filter((k) => k.enabled());
  if (n.last && kids.indexOf(n.last) !== -1) {
    const l = descend(n.last);
    if (l) return l;
  }
  for (const k of kids) {
    const l = descend(k);
    if (l) return l;
  }
  return null;
}

function activate(l: FList) {
  let child: FNode = l;
  for (let z = l.parent; z; z = z.parent) {
    z.last = child;
    child = z;
  }
  pending = null;
  if (active() !== l) setActive(l);
}

function stepInList(l: FList, dir: Dir): number {
  const i = l.index();
  const n = l.count();
  if (l.axis === 'row') {
    if (dir === 'left') return i > 0 ? i - 1 : -1;
    if (dir === 'right') return i < n - 1 ? i + 1 : -1;
    return -1;
  }
  if (l.axis === 'col') {
    if (dir === 'up') return i > 0 ? i - 1 : -1;
    if (dir === 'down') return i < n - 1 ? i + 1 : -1;
    return -1;
  }
  const c = Math.max(1, l.cols());
  const wrap = !!l.wrap && l.wrap();
  if (dir === 'left') return i % c > 0 || (wrap && i > 0) ? i - 1 : -1;
  if (dir === 'right') return (i % c < c - 1 || wrap) && i + 1 < n ? i + 1 : -1;
  if (dir === 'up') return i - c >= 0 ? i - c : -1;
  if (i + c < n) return i + c;
  return Math.floor(i / c) < Math.floor((n - 1) / c) ? n - 1 : -1;
}

/** Move o foco. Retorna false se não havia para onde ir. */
export function move(dir: Dir): boolean {
  const cur = active();
  if (!cur) return focusZone(root);
  const ni = stepInList(cur, dir);
  if (ni !== -1) {
    cur.setIndex(ni);
    return true;
  }
  const axis: Axis = dir === 'left' || dir === 'right' ? 'row' : 'col';
  const step = dir === 'down' || dir === 'right' ? 1 : -1;
  let child: FNode = cur;
  for (let z = cur.parent; z; z = z.parent) {
    if (z.axis === axis) {
      const kids = ordered(z).filter((k) => k.enabled());
      for (let k = kids.indexOf(child) + step; k >= 0 && k < kids.length; k += step) {
        const leaf = descend(kids[k]);
        if (leaf) {
          activate(leaf);
          return true;
        }
      }
    }
    child = z;
  }
  return false;
}

/** Foca a zona (no último item lembrado). Se ainda não tem itens, foca assim que tiver. */
export function focusZone(z: Zone): boolean {
  const leaf = descend(z);
  if (leaf) {
    activate(leaf);
    return true;
  }
  pending = z;
  return false;
}

/** Tira o foco de tudo (troca de tela: a anterior fica escondida e não pode receber tecla). */
export function clearFocus() {
  pending = null;
  setActive(null);
}

export function focusList(l: FList, index?: number) {
  if (index !== undefined) l.setIndex(Math.max(0, Math.min(index, l.count() - 1)));
  if (l.count() > 0) activate(l);
}

// ---------- teclas ----------

const keyHandlers: ((k: KeyName) => boolean)[] = [];

/** Camadas por cima de tudo (modal, player). A última registrada recebe primeiro. */
export function pushKeyHandler(fn: (k: KeyName) => boolean): () => void {
  keyHandlers.push(fn);
  return () => {
    const i = keyHandlers.indexOf(fn);
    if (i !== -1) keyHandlers.splice(i, 1);
  };
}

export function dispatchKey(k: KeyName): boolean {
  for (let i = keyHandlers.length - 1; i >= 0; i--) if (keyHandlers[i](k)) return true;
  const cur = active();
  if (cur) {
    if (cur.onKey && cur.onKey(k, cur.index())) return true;
    if (k === 'enter' && cur.onSelect) {
      cur.onSelect(cur.index());
      return true;
    }
  }
  if (k === 'up' || k === 'down' || k === 'left' || k === 'right') return move(k);
  for (let z = cur ? cur.parent : null; z; z = z.parent) if (z.onKey && z.onKey(k)) return true;
  return false;
}

// ---------- componentes ----------

export interface ZoneProps {
  axis: Axis;
  enabled?: () => boolean;
  onKey?: (k: KeyName) => boolean;
  /** Zona isolada (modal): o foco não sai dela. Ao desmontar, devolve o foco anterior. */
  trap?: boolean;
  /** Pega o foco ao montar. */
  autofocus?: boolean;
  ref?: (z: Zone) => void;
  class?: string;
  classList?: Record<string, boolean>;
  style?: JSX.CSSProperties | string;
  children: JSX.Element;
}

export function FocusZone(props: ZoneProps) {
  const parent = useContext(ZoneCtx);
  let el: HTMLDivElement | undefined;
  const zone: Zone = {
    kind: 'zone',
    axis: props.axis,
    children: [],
    last: null,
    parent: props.trap ? null : parent,
    el: () => el,
    enabled: () => (props.enabled ? props.enabled() : true),
    onKey: (k) => (props.onKey ? props.onKey(k) : false),
  };
  const previous = props.trap ? active() : null;
  if (props.trap) setTrapCount(trapCount() + 1);
  if (!props.trap) parent.children.push(zone);
  if (props.ref) props.ref(zone);
  onMount(() => {
    if (props.autofocus || props.trap) focusZone(zone);
  });
  onCleanup(() => {
    if (props.trap) setTrapCount(trapCount() - 1);
    if (!props.trap) {
      const i = parent.children.indexOf(zone);
      if (i !== -1) parent.children.splice(i, 1);
      if (parent.last === zone) parent.last = null;
    }
    if (pending === zone) pending = null;
    const cur = active();
    if (cur && contains(zone, cur)) {
      setActive(null);
      if (props.trap && previous) activate(previous);
      else if (!props.trap) focusZone(parent);
    }
  });
  return (
    <ZoneCtx.Provider value={zone}>
      <div ref={el} class={props.class} classList={props.classList} style={props.style}>
        {props.children}
      </div>
    </ZoneCtx.Provider>
  );
}

export interface ListOptions {
  axis: Axis | 'grid';
  count: () => number;
  cols?: () => number;
  initial?: number;
  enabled?: () => boolean;
  onSelect?: (i: number) => void;
  onKey?: (k: KeyName, i: number) => boolean;
  /** Pega o foco assim que tiver itens. */
  autofocus?: boolean;
  /** Grade: ◀ ▶ na borda passam para a fileira vizinha (pode depender do estado). */
  wrap?: boolean | (() => boolean);
}

export interface ListHandle {
  list: FList;
  index: Accessor<number>;
  setIndex: (i: number) => void;
  isActive: Accessor<boolean>;
  isFocused: (i: number) => boolean;
  focus: (i?: number) => void;
  ref: (el: HTMLElement) => void;
}

/** Registra uma lista focável na zona atual. */
export function useList(opts: ListOptions): ListHandle {
  const parent = useContext(ZoneCtx);
  const [index, setIndex] = createSignal(opts.initial || 0);
  let el: HTMLElement | undefined;
  const list: FList = {
    kind: 'list',
    axis: opts.axis,
    cols: opts.cols || (() => 1),
    count: opts.count,
    index,
    setIndex,
    parent,
    el: () => el,
    enabled: () => (opts.enabled ? opts.enabled() : true),
    onSelect: (i) => opts.onSelect && opts.onSelect(i),
    onKey: (k, i) => (opts.onKey ? opts.onKey(k, i) : false),
    wrap: typeof opts.wrap === 'function' ? opts.wrap : () => !!opts.wrap,
  };
  parent.children.push(list);

  // Lista encolheu (filtro/recarga): mantém o índice válido.
  createEffect(
    on(opts.count, (n) => {
      if (n > 0 && index() > n - 1) setIndex(n - 1);
      if (n > 0 && pending && contains(pending, list)) {
        // várias listas costumam receber dados juntas: espera e escolhe pela ordem da tela
        const z = pending;
        queueMicrotask(() => pending === z && focusZone(z));
      } else if (n > 0 && opts.autofocus && !active()) activate(list);
      if (n === 0 && active() === list) {
        setActive(null);
        focusZone(parent);
      }
    }),
  );

  onCleanup(() => {
    const i = parent.children.indexOf(list);
    if (i !== -1) parent.children.splice(i, 1);
    if (parent.last === list) parent.last = null;
    if (active() === list) setActive(null);
  });

  const isActive = () => active() === list;
  return {
    list,
    index,
    setIndex,
    isActive,
    isFocused: (i) => isActive() && index() === i,
    focus: (i) => focusList(list, i),
    ref: (e) => (el = e),
  };
}

export function useZone(): Zone {
  return useContext(ZoneCtx);
}

export const rootZone = root;
