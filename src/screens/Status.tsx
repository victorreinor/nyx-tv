// Diagnóstico da lista: o que respondeu, o que não respondeu e desde quando.
// Ao abrir o app com a lista fora (boot), tenta de novo sozinho e segue quando ela voltar.
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { HealthStep } from '../data/types';
import { FocusZone } from '../app/focus';
import { checkHealth, checking, downSince, health, healthLog, healthMessage, serverDown, stepLabel, stepText } from '../app/health';
import { fmtTime, fmtWhen, t } from '../app/i18n';
import { go, reset, top } from '../app/router';
import { activePlaylist } from '../app/settings';
import { toast } from '../app/state';
import { type Action, ActionRow } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/primitives';

const RETRY_S = 30;
const MARK: Record<HealthStep['state'], string> = { ok: '✓', warn: '!', fail: '✕', skip: '–' };

export function Status(props: { boot?: boolean; hasData?: boolean }) {
  const [left, setLeft] = createSignal(RETRY_S);

  const proceed = () => reset({ name: props.hasData ? 'home' : 'sync' });

  async function retry(full: boolean) {
    if (checking()) return;
    setLeft(RETRY_S);
    const r = await checkHealth(full);
    if (props.boot && r && r.state !== 'fail') {
      toast(t('health.back'));
      proceed();
    }
  }

  if (props.boot) {
    const timer = setInterval(() => {
      // só conta com a tela à vista (no formulário "Editar lista" ela fica montada, escondida)
      if (checking() || top().name !== 'status') return;
      if (left() > 1) setLeft(left() - 1);
      else void retry(false);
    }, 1000);
    onCleanup(() => clearInterval(timer));
  } else {
    // aberto pelas Configurações ou pelo player: o teste completo diz se o vídeo sai
    onMount(() => void checkHealth(true));
  }

  const actions = (): Action[] => {
    const list: Action[] = [
      { label: t('common.retry'), icon: 'refresh', variant: 'primary', onSelect: () => void retry(false) },
      { label: t('health.full'), icon: 'play', onSelect: () => void retry(true) },
    ];
    if (props.boot && props.hasData) list.push({ label: t('health.useCache'), icon: 'home', onSelect: proceed });
    const p = activePlaylist();
    if (p) list.push({ label: t('playlist.edit'), icon: 'edit', onSelect: () => go({ name: 'playlistForm', id: p.id }) });
    return list;
  };

  const msg = () => (health() ? healthMessage(health()!) : null);
  const tone = () => health()!.state;
  const caption = () => {
    const parts: string[] = [];
    const since = downSince();
    if (health() && serverDown(health()!) && since) parts.push(t('health.since', { t: fmtWhen(since) }));
    else if (health()) parts.push(t('health.checkedAt', { t: fmtTime(health()!.at / 1000) }));
    if (props.boot && !checking() && health() && health()!.state === 'fail') parts.push(t('health.retryIn', { n: left() }));
    return parts.join('  ·  ');
  };

  return (
    <div class="page status-page stack g32">
      <span class="t-caption c-3">{t('health.title')}</span>
      <Show
        when={msg()}
        fallback={
          <div class="row g16">
            <Spinner size={48} />
            <span class="t-section">{t('health.checking')}</span>
          </div>
        }
      >
        <div class="status__head" classList={{ ['is-' + tone()]: true }}>
          <span class="status__icon">
            <Icon name={tone() === 'ok' ? 'check' : 'alert'} size={56} />
          </span>
          <div class="stack g8">
            <h1 class="t-title">{msg()!.title}</h1>
            <p class="t-body c-2">{msg()!.sub}</p>
            <p class="t-caption c-3">{caption()}</p>
          </div>
        </div>
      </Show>

      <Show when={checking()}>
        <div class="row g16">
          <Spinner size={32} />
          <span class="c-2">{t('health.checkingFull')}</span>
        </div>
      </Show>

      <Show when={health()}>
        <div class="status__steps stack g8">
          <For each={health()!.steps}>{(s) => <StepRow step={s} />}</For>
        </div>
      </Show>

      <FocusZone axis="row" autofocus>
        <ActionRow actions={actions} />
      </FocusZone>

      <Show when={healthLog().length > 1}>
        <div class="stack g12">
          <span class="t-card c-2">{t('health.history')}</span>
          <div class="status__log">
            <For each={healthLog().slice(-8).reverse()}>
              {(e) => (
                <span class={'status__log-item tone-' + e.state}>
                  {fmtTime(e.at / 1000)} {MARK[e.state]}
                  {e.step ? ' ' + stepLabel(e.step) : ''}
                  {e.detail ? ' · ' + e.detail : ''}
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

function StepRow(props: { step: HealthStep }) {
  const s = props.step;
  return (
    <div class={'status-step is-' + s.state}>
      <span class={'status-step__mark tone-' + s.state}>{MARK[s.state]}</span>
      <span class="t-card">{stepLabel(s.id)}</span>
      <span class="t-body ellipsis">{stepText(s)}</span>
      <span class="t-caption c-3 ellipsis">
        {s.detail + (s.ms ? ` · ${s.ms} ms` : '')}
      </span>
    </div>
  );
}
