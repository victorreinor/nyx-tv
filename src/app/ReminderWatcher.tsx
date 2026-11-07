// Lembretes da grade: 1 min antes do programa começar, avisa em qualquer tela (até no player).
import { createSignal, onCleanup, Show } from 'solid-js';
import { ActionRow } from '../ui/controls';
import { Modal } from '../ui/overlays';
import { fmtTime, t } from './i18n';
import { go, replace, top } from './router';
import { type Reminder, removeReminder, settings, setSetting } from './settings';

export function ReminderWatcher() {
  const [due, setDue] = createSignal<Reminder | null>(null);
  const check = () => {
    const now = Date.now() / 1000;
    // limpa os que já acabaram
    if (settings.reminders.some((r) => r.stop <= now)) setSetting('reminders', settings.reminders.filter((r) => r.stop > now));
    if (due()) return;
    const next = settings.reminders.find((r) => r.start - 60 <= now && now < r.stop);
    if (next) {
      removeReminder(next); // avisa uma vez só
      setDue(next);
    }
  };
  check();
  const id = setInterval(check, 15000);
  onCleanup(() => clearInterval(id));

  const watch = () => {
    const r = due();
    setDue(null);
    if (!r) return;
    const media = { kind: 'live' as const, channelId: r.channelId, category: 'auto' };
    if (top().name === 'player') replace({ name: 'player', media });
    else go({ name: 'player', media });
  };

  return (
    <Show when={due()}>
      <Modal title={t('reminder.title', { title: due()!.title })} onClose={() => setDue(null)} width={760}>
        <p class="t-body c-2">{t('reminder.channel', { ch: due()!.channelName, t: fmtTime(due()!.start) })}</p>
        <ActionRow
          autofocus
          actions={() => [
            { label: t('reminder.watch'), icon: 'play', variant: 'primary', onSelect: watch },
            { label: t('reminder.dismiss'), onSelect: () => setDue(null) },
          ]}
        />
      </Modal>
    </Show>
  );
}
