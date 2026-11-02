// Aviso do timer para dormir: 60 s antes, pergunta se continua; no fim, para o vídeo e fecha o app.
import { createSignal, onCleanup, Show } from 'solid-js';
import { player } from '../player/engine';
import { extendSleep, setSleepTimer, sleepAt, sleepNow } from '../player/sleep';
import { ActionRow } from '../ui/controls';
import { Modal } from '../ui/overlays';
import { t } from './i18n';
import { exitApp } from './keys';
import { reset } from './router';

export function SleepWatcher() {
  const [left, setLeft] = createSignal(0);
  const id = setInterval(() => {
    const at = sleepAt();
    if (!at) return setLeft(0);
    const remaining = Math.ceil((at - Date.now()) / 1000);
    if (remaining <= 0) {
      setSleepTimer(0);
      setLeft(0);
      player.setEvents(null);
      player.stop();
      reset({ name: 'home' });
      exitApp();
      return;
    }
    setLeft(remaining <= 60 ? remaining : 0);
  }, 1000);
  onCleanup(() => clearInterval(id));
  return (
    <Show when={left() > 0}>
      <Modal title={t('player.sleepWarning', { n: left() })} onClose={() => extendSleep(30)} width={720}>
        <ActionRow
          autofocus
          actions={() => [
            { label: t('player.sleepContinue'), icon: 'play', variant: 'primary', onSelect: () => extendSleep(30) },
            { label: t('player.sleepNow'), onSelect: sleepNow },
          ]}
        />
      </Modal>
    </Show>
  );
}
