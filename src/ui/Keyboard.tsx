// Teclado na tela para a busca: navegação previsível com o controle e sem o IME da TV.
// 6 colunas × 6 fileiras (36 teclas, sem tecla sobrando), ◀ ▶ passam de fileira quando não há nada ao lado,
// e ▼ na última fileira desce para Espaço/Apagar/Limpar.
import { For } from 'solid-js';
import { FocusZone, useList } from '../app/focus';
import { t } from '../app/i18n';
import type { KeyName } from '../app/keys';

const KEYS = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('');
const COLS = 6;

/**
 * `exitRight`: quando há algo à direita (resultados), ▶ no fim da fileira sai do teclado;
 * senão passa para a fileira seguinte.
 */
export function Keyboard(props: { value: () => string; onChange: (v: string) => void; autofocus?: boolean; exitRight?: () => boolean }) {
  // números do controle digitam direto, de qualquer tecla do teclado
  const type = (k: KeyName) => {
    if (k.length === 1 && k >= '0' && k <= '9') {
      props.onChange(props.value() + k);
      return true;
    }
    return false;
  };
  return (
    <FocusZone axis="col" class="stack g8">
      <Letters value={props.value} onChange={props.onChange} onKey={type} autofocus={props.autofocus} exitRight={props.exitRight} />
      <Actions value={props.value} onChange={props.onChange} onKey={type} />
    </FocusZone>
  );
}

interface PartProps {
  value: () => string;
  onChange: (v: string) => void;
  onKey: (k: KeyName) => boolean;
  autofocus?: boolean;
  exitRight?: () => boolean;
}

function Letters(props: PartProps) {
  const list = useList({
    axis: 'grid',
    cols: () => COLS,
    count: () => KEYS.length,
    wrap: () => !(props.exitRight && props.exitRight()),
    autofocus: props.autofocus,
    onSelect: (i) => props.onChange(props.value() + KEYS[i]),
    onKey: props.onKey,
  });
  return (
    <div class="kbd" ref={list.ref}>
      <For each={KEYS}>{(k, i) => <div class="kbd__key" classList={{ 'is-focused': list.isFocused(i()) }}>{k}</div>}</For>
    </div>
  );
}

function Actions(props: PartProps) {
  const actions = [
    { label: () => t('search.space'), run: () => props.onChange(props.value() + ' ') },
    { label: () => t('search.del'), run: () => props.onChange(props.value().slice(0, -1)) },
    { label: () => t('search.clear'), run: () => props.onChange('') },
  ];
  const list = useList({ axis: 'row', count: () => actions.length, onSelect: (i) => actions[i].run(), onKey: props.onKey });
  return (
    <div class="kbd kbd--actions" ref={list.ref}>
      <For each={actions}>{(a, i) => <div class="kbd__key kbd__key--wide" classList={{ 'is-focused': list.isFocused(i()) }}>{a.label()}</div>}</For>
    </div>
  );
}
