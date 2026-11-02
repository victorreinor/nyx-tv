// Controles compostos: fileira de botões, fileira de categorias e lista de opções.
import { createEffect, For, type JSX, Show } from 'solid-js';
import { type ListHandle, useList } from '../app/focus';
import type { KeyName } from '../app/keys';
import { Icon, type IconName } from './Icon';
import { Button, type ButtonVariant, Chip } from './primitives';
import { Rail } from './Rail';

export interface Action {
  label: string;
  icon?: IconName;
  variant?: ButtonVariant;
  onSelect: () => void;
}

export function ActionRow(props: { actions: () => Action[]; autofocus?: boolean; handle?: (h: ListHandle) => void; class?: string }) {
  const list = useList({
    axis: 'row',
    count: () => props.actions().length,
    autofocus: props.autofocus,
    onSelect: (i) => props.actions()[i].onSelect(),
  });
  if (props.handle) props.handle(list);
  return (
    <div class={`row g16 ${props.class || ''}`} ref={list.ref}>
      <For each={props.actions()}>
        {(a, i) => <Button label={a.label} icon={a.icon} variant={a.variant} focused={list.isFocused(i())} />}
      </For>
    </div>
  );
}

export interface ChipItem {
  id: string;
  label: string;
  count?: number;
}

/** Categorias em fileira horizontal (virtualizada: aguenta centenas). */
export function ChipRow(props: {
  items: () => ChipItem[];
  selected: () => string;
  onSelect: (id: string) => void;
  onKey?: (k: KeyName) => boolean;
  handle?: (h: ListHandle) => void;
  autofocus?: boolean;
}) {
  return (
    <Rail
      items={props.items}
      itemWidth={250}
      gap={12}
      height={60}
      visible={6}
      class="chiprow"
      autofocus={props.autofocus}
      handle={props.handle}
      onSelect={(c) => props.onSelect(c.id)}
      onKey={(k) => (props.onKey ? props.onKey(k) : false)}
      render={(c, focused) => <Chip label={c().label} count={c().count} focused={focused()} selected={c().id === props.selected()} />}
    />
  );
}

export interface OptionItem {
  id: string;
  label: string;
  hint?: string;
  icon?: IconName;
  right?: () => JSX.Element;
}

/** Lista vertical de opções (configurações, painel de qualidade). */
export function OptionList(props: {
  items: () => OptionItem[];
  selected?: () => string | null;
  onSelect: (id: string, index: number) => void;
  onFocusItem?: (id: string, index: number) => void;
  onKey?: (k: KeyName, id: string) => boolean;
  autofocus?: boolean;
  handle?: (h: ListHandle) => void;
  class?: string;
  /** 'row' para opções lado a lado (◀ ▶). */
  axis?: 'row' | 'col';
}) {
  const list = useList({
    axis: props.axis || 'col',
    count: () => props.items().length,
    autofocus: props.autofocus,
    onSelect: (i) => props.onSelect(props.items()[i].id, i),
    onKey: (k, i) => (props.onKey ? props.onKey(k, props.items()[i].id) : false),
  });
  if (props.handle) props.handle(list);
  createEffect(() => {
    if (list.isActive() && props.onFocusItem) {
      const it = props.items()[list.index()];
      if (it) props.onFocusItem(it.id, list.index());
    }
  });
  return (
    <div class={`stack g8 ${props.class || ''}`} ref={list.ref}>
      <For each={props.items()}>
        {(o, i) => (
          <div
            class="option"
            ref={(el) => createEffect(() => list.isFocused(i()) && el.scrollIntoView({ block: 'nearest' }))}
            classList={{ 'is-focused': list.isFocused(i()), 'is-selected': !!props.selected && props.selected() === o.id }}
          >
            <Show when={o.icon}>
              <Icon name={o.icon!} size={26} />
            </Show>
            <div class="stack g4 grow">
              <span class="option__label">{o.label}</span>
              <Show when={o.hint}>
                <span class="option__hint">{o.hint}</span>
              </Show>
            </div>
            <Show when={o.right}>{o.right!()}</Show>
            <Show when={props.selected && props.selected() === o.id}>
              <span class="option__check">
                <Icon name="check" size={26} />
              </span>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
