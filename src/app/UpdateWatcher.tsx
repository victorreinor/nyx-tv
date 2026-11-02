// Atualização sem cabo em segundo plano: confirma esta versão, procura a próxima e avisa o que mudou.
import { onCleanup, onMount } from 'solid-js';
import { t } from './i18n';
import { toast } from './state';
import { applyUpdate, bootNotice, checkForUpdate, confirmBoot, updateStatus } from './update';

/** Abriu e não quebrou nesse tempo = versão boa. */
const CONFIRM_MS = 3000;
/** Primeira procura depois de abrir (deixa a lista carregar antes). */
const FIRST_CHECK_MS = 60000;
const CHECK_EVERY_MS = 6 * 3600000;
/** Tempo dos avisos de versão nova/volta: a TV pode estar acabando de acender a tela. */
const NOTICE_MS = 8000;
/** A TV costuma deixar o app suspenso por dias: voltando depois disso, abre a versão baixada. */
const APPLY_AFTER_HIDDEN_MS = 30 * 60000;

export function UpdateWatcher() {
  const timers: number[] = [];
  let hiddenAt = 0;

  const onVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= APPLY_AFTER_HIDDEN_MS && updateStatus().kind === 'ready') applyUpdate();
  };

  onMount(() => {
    timers.push(
      window.setTimeout(() => {
        confirmBoot();
        if (bootNotice.fresh) toast(t('update.applied', { v: bootNotice.fresh }), NOTICE_MS);
      }, CONFIRM_MS),
    );
    if (bootNotice.rolledBack) toast(t('update.rolledBack', { v: bootNotice.rolledBack }), NOTICE_MS);
    if (updateStatus().kind === 'off') return;
    timers.push(window.setTimeout(checkForUpdate, FIRST_CHECK_MS));
    timers.push(window.setInterval(checkForUpdate, CHECK_EVERY_MS));
    document.addEventListener('visibilitychange', onVisibility);
  });
  onCleanup(() => {
    timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    document.removeEventListener('visibilitychange', onVisibility);
  });
  return null;
}
