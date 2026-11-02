// Grade/lista vertical virtualizada (cols=1 vira lista). Só as linhas visíveis existem no DOM.
import { createEffect, createMemo, createSignal, For, type JSX } from 'solid-js';
import { type ListHandle, useList } from '../app/focus';
import type { KeyName } from '../app/keys';

export interface VGridProps<T> {
  items: () => T[];
  cols: number;
  cellW: number;
  cellH: number;
  gapX: number;
  gapY: number;
  height: number;
  render: (item: () => T, focused: () => boolean, index: number) => JSX.Element;
  onSelect?: (item: T, index: number) => void;
  onKey?: (k: KeyName, item: T, index: number) => boolean;
  onFocusItem?: (item: T, index: number) => void;
  onEnd?: () => void;
  autofocus?: boolean;
  handle?: (h: ListHandle) => void;
  /** Linha focada fica nesta posição (0 = topo) ao rolar. */
  anchorRow?: number;
  class?: string;
}

export function VGrid<T>(props: VGridProps<T>) {
  const strideY = props.cellH + props.gapY;
  const strideX = props.cellW + props.gapX;
  const visibleRows = Math.max(1, Math.floor((props.height + props.gapY) / strideY));
  const list = useList({
    axis: props.cols > 1 ? 'grid' : 'col',
    cols: () => props.cols,
    count: () => props.items().length,
    autofocus: props.autofocus,
    onSelect: (i) => props.onSelect && props.onSelect(props.items()[i], i),
    onKey: (k, i) => (props.onKey ? props.onKey(k, props.items()[i], i) : false),
  });
  if (props.handle) props.handle(list);
  const [firstRow, setFirstRow] = createSignal(0);

  createEffect(() => {
    const row = Math.floor(list.index() / props.cols);
    const f = firstRow();
    const anchor = props.anchorRow;
    if (anchor !== undefined) setFirstRow(Math.max(0, row - anchor));
    else if (row < f) setFirstRow(row);
    else if (row > f + visibleRows - 1) setFirstRow(row - visibleRows + 1);
    const n = props.items().length;
    if (props.onEnd && n && list.index() >= n - props.cols * (visibleRows + 1)) props.onEnd();
  });

  createEffect(() => {
    if (list.isActive() && props.onFocusItem) {
      const it = props.items()[list.index()];
      if (it) props.onFocusItem(it, list.index());
    }
  });

  const indices = createMemo(() => {
    const n = props.items().length;
    const from = Math.max(0, (firstRow() - 1) * props.cols);
    const to = Math.min(n, (firstRow() + visibleRows + 1) * props.cols);
    const out: number[] = [];
    for (let i = from; i < to; i++) out.push(i);
    return out;
  });

  return (
    <div class={`vgrid ${props.class || ''}`} classList={{ 'is-active': list.isActive() }} ref={list.ref} style={{ height: `${props.height}px` }}>
      <div class="vgrid__track" style={{ transform: `translate3d(0,${-firstRow() * strideY}px,0)` }}>
        <For each={indices()}>
          {(i) => (
            <div
              class="vgrid__cell"
              style={{
                transform: `translate3d(${(i % props.cols) * strideX}px,${Math.floor(i / props.cols) * strideY}px,0)`,
                width: `${props.cellW}px`,
                height: `${props.cellH}px`,
              }}
            >
              {props.render(() => props.items()[i], () => list.isFocused(i), i)}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
