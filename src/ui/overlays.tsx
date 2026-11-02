// Camadas por cima da tela: modal, teclado de PIN e aviso (toast).
import { createSignal, For, type JSX, Show } from 'solid-js';
import { FocusZone, useList } from '../app/focus';
import { t } from '../app/i18n';
import type { KeyName } from '../app/keys';
import { toastMsg } from '../app/state';

/** Modal com foco preso dentro. Voltar fecha. */
export function Modal(props: { title: string; onClose: () => void; width?: number; children: JSX.Element }) {
  const onKey = (k: KeyName) => {
    if (k === 'back') {
      props.onClose();
      return true;
    }
    return false;
  };
  return (
    <div class="modal">
      <FocusZone axis="col" trap onKey={onKey} class="modal__panel stack g24" style={{ width: `${props.width || 640}px` }}>
        <h2 class="t-section">{props.title}</h2>
        {props.children}
      </FocusZone>
    </div>
  );
}

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];

/**
 * Pede um PIN de 4 dígitos. `onSubmit` devolve uma mensagem de erro (fica aberto)
 * ou null (sucesso). Números do controle digitam direto.
 */
export function PinDialog(props: { title: string; onSubmit: (pin: string) => string | null; onClose: () => void }) {
  const [pin, setPin] = createSignal('');
  const [error, setError] = createSignal('');
  const press = (key: string) => {
    if (key === 'del') return setPin(pin().slice(0, -1));
    if (key === 'ok') return submit();
    if (pin().length >= 4) return;
    setPin(pin() + key);
    setError('');
    if (pin().length === 4) submit();
  };
  const submit = () => {
    if (pin().length !== 4) return;
    const err = props.onSubmit(pin());
    if (err) {
      setError(err);
      setPin('');
    }
  };
  return (
    <Modal title={props.title} onClose={props.onClose} width={560}>
      <div class="row g16 pin__boxes">
        <For each={[0, 1, 2, 3]}>{(i) => <span class="pin__box" classList={{ 'is-filled': pin().length > i }}>{pin().length > i ? '•' : ''}</span>}</For>
      </div>
      <Show when={error()}>
        <span class="t-caption" style={{ color: 'var(--live-fg)' }}>
          {error()}
        </span>
      </Show>
      <PinPad press={press} />
    </Modal>
  );
}

function PinPad(props: { press: (k: string) => void }) {
  const list = useList({
    axis: 'grid',
    cols: () => 3,
    count: () => PAD.length,
    wrap: true,
    autofocus: true,
    onSelect: (i) => props.press(PAD[i]),
    onKey: (k) => {
      if (k.length === 1 && k >= '0' && k <= '9') {
        props.press(k);
        return true;
      }
      return false;
    },
  });
  return (
    <div class="pinpad" ref={list.ref}>
      <For each={PAD}>
        {(k, i) => (
          <div class="pinpad__key" classList={{ 'is-focused': list.isFocused(i()) }}>
            {k === 'del' ? '⌫' : k === 'ok' ? t('common.ok') : k}
          </div>
        )}
      </For>
    </div>
  );
}

export function Toast() {
  return (
    <Show when={toastMsg()}>
      <div class="toast" role="status">
        {toastMsg()!.text}
      </div>
    </Show>
  );
}
