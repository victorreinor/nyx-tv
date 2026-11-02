// Primeira abertura: boas-vindas (sem lista) e preparação (primeira sincronização).
import { onMount, Show } from 'solid-js';
import { FocusZone } from '../app/focus';
import { type MessageKey, t } from '../app/i18n';
import { go, reset } from '../app/router';
import { openActive, runSync, sync } from '../app/state';
import { ActionRow } from '../ui/controls';
import { Logo } from '../ui/Icon';
import { ProgressBar } from '../ui/primitives';

export function Welcome() {
  return (
    <div class="onboarding stack g32">
      <Logo size={120} />
      <h1 class="t-display">{t('welcome.title')}</h1>
      <p class="t-body c-2">{t('welcome.subtitle')}</p>
      <FocusZone axis="row" autofocus>
        <ActionRow actions={() => [{ label: t('playlist.add'), icon: 'plus', variant: 'primary', onSelect: () => go({ name: 'playlistForm' }) }]} />
      </FocusZone>
    </div>
  );
}

export function SyncScreen() {
  // abre a lista no worker antes (garante o estado mesmo se o boot falhou) e sincroniza
  const start = () =>
    openActive()
      .then(() => runSync())
      .then(() => reset({ name: 'home' }))
      .catch((err) => console.error('sync falhou', err));
  onMount(start);
  const label = () => t(('sync.' + sync().phase) as MessageKey);
  return (
    <div class="onboarding stack g32">
      <Logo size={96} />
      <h1 class="t-title">{t('sync.title')}</h1>
      <div class="stack g16" style={{ width: '720px' }}>
        <div class="row g16" style={{ 'justify-content': 'space-between' }}>
          <span class="t-body">{label()}</span>
          <span class="t-body c-2">{Math.round(sync().pct)}%</span>
        </div>
        <ProgressBar value={sync().pct / 100} height={10} />
      </div>
      <Show when={sync().error} fallback={<p class="t-caption c-3">{t('sync.firstHint')}</p>}>
        <p class="t-caption" style={{ color: 'var(--live-fg)' }}>
          {t('sync.error', { msg: sync().error })}
        </p>
        <FocusZone axis="row" autofocus>
          <ActionRow
            actions={() => [
              { label: t('common.retry'), icon: 'refresh', variant: 'primary', onSelect: start },
              { label: t('settings.playlists'), onSelect: () => go({ name: 'settings' }) },
            ]}
          />
        </FocusZone>
      </Show>
    </div>
  );
}
