// Fileira horizontal virtualizada: só os itens visíveis (+2 de cada lado) existem no DOM.
// Rola com transform (GPU), nunca com scrollLeft.
import { createEffect, createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { type ListHandle, useList } from '../app/focus';
import type { KeyName } from '../app/keys';

export interface RailProps<T> {
  title?: string;
  items: () => T[];
  itemWidth: number;
  gap: number;
  height: number;
  /** Quantos cabem na tela (padrão: calculado pela largura útil). */
  visible?: number;
  render: (item: () => T, focused: () => boolean, index: number) => JSX.Element;
  onSelect?: (item: T, index: number) => void;
  onKey?: (k: KeyName, item: T, index: number) => boolean;
  onFocusItem?: (item: T, index: number) => void;
  /** Perto do fim: hora de buscar a próxima página. */
  onEnd?: () => void;
  autofocus?: boolean;
  handle?: (h: ListHandle) => void;
  class?: string;
}

const USABLE_WIDTH = 1920 - 112 - 72;

export function Rail<T>(props: RailProps<T>) {
  const stride = props.itemWidth + props.gap;
  const visible = props.visible || Math.max(1, Math.floor((USABLE_WIDTH + props.gap) / stride));
  const list = useList({
    axis: 'row',
    count: () => props.items().length,
    autofocus: props.autofocus,
    onSelect: (i) => props.onSelect && props.onSelect(props.items()[i], i),
    onKey: (k, i) => (props.onKey ? props.onKey(k, props.items()[i], i) : false),
  });
  if (props.handle) props.handle(list);
  const [first, setFirst] = createSignal(0);

  createEffect(() => {
    const i = list.index();
    const f = first();
    if (i < f) setFirst(i);
    else if (i > f + visible - 1) setFirst(i - visible + 1);
    const n = props.items().length;
    if (props.onEnd && n && i >= n - visible - 2) props.onEnd();
  });

  createEffect(() => {
    if (list.isActive() && props.onFocusItem) {
      const i = list.index();
      const it = props.items()[i];
      if (it) props.onFocusItem(it, i);
    }
  });

  const indices = createMemo(() => {
    const n = props.items().length;
    const from = Math.max(0, first() - 2);
    const to = Math.min(n, first() + visible + 2);
    const out: number[] = [];
    for (let i = from; i < to; i++) out.push(i);
    return out;
  });

  return (
    <div class={`rail ${props.class || ''}`} classList={{ 'is-active': list.isActive() }} ref={list.ref}>
      <Show when={props.title}>
        <h2 class="rail__title t-section">{props.title}</h2>
      </Show>
      <div class="rail__viewport" style={{ height: `${props.height}px` }}>
        <div class="rail__track" style={{ transform: `translate3d(${-first() * stride}px,0,0)` }}>
          <For each={indices()}>
            {(i) => (
              <div class="rail__item" style={{ transform: `translate3d(${i * stride}px,0,0)`, width: `${props.itemWidth}px` }}>
                {props.render(() => props.items()[i], () => list.isFocused(i), i)}
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
