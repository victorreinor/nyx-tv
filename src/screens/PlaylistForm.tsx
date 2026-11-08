// Adicionar/editar lista. Campos usam o teclado nativo da TV (OK abre).
import { createSignal, For, Show } from 'solid-js';
import { call } from '../data/client';
import { xtreamFromM3uUrl } from '../data/m3u';
import type { PlaylistConfig } from '../data/types';
import { FocusZone, useList } from '../app/focus';
import { type MessageKey, t } from '../app/i18n';
import { back, reset } from '../app/router';
import { newId, setSetting, settings, upsertPlaylist } from '../app/settings';
import { openActive } from '../app/state';
import { healthLine } from '../app/health';
import { ActionRow } from '../ui/controls';
import { Spinner } from '../ui/primitives';

type FieldKey = 'name' | 'host' | 'username' | 'password' | 'url' | 'epgUrl';

export function PlaylistForm(props: { id?: string }) {
  const existing = settings.playlists.find((p) => p.id === props.id);
  const [type, setType] = createSignal<'xtream' | 'm3u'>(existing ? existing.type : 'xtream');
  const [values, setValues] = createSignal<Record<FieldKey, string>>({
    name: existing ? existing.name : '',
    host: existing ? existing.host || '' : 'http://',
    username: existing ? existing.username || '' : '',
    password: existing ? existing.password || '' : '',
    url: existing ? existing.url || '' : 'http://',
    epgUrl: existing ? existing.epgUrl || '' : '',
  });
  const [status, setStatus] = createSignal<{ busy: boolean; error: string }>({ busy: false, error: '' });

  const fields = (): { key: FieldKey; label: MessageKey; secret?: boolean }[] =>
    type() === 'xtream'
      ? [
          { key: 'name', label: 'playlist.name' },
          { key: 'host', label: 'playlist.server' },
          { key: 'username', label: 'playlist.user' },
          { key: 'password', label: 'playlist.pass', secret: true },
        ]
      : [
          { key: 'name', label: 'playlist.name' },
          { key: 'url', label: 'playlist.url' },
          { key: 'epgUrl', label: 'playlist.epg' },
        ];

  const set = (key: FieldKey, v: string) => setValues({ ...values(), [key]: v.trim() });

  async function save() {
    const v = values();
    let p: PlaylistConfig = { id: existing ? existing.id : newId(), name: v.name || 'Lista', type: type() };
    if (type() === 'm3u') {
      const xt = xtreamFromM3uUrl(v.url);
      p = xt ? { ...p, type: 'xtream', ...xt } : { ...p, url: v.url, epgUrl: v.epgUrl || undefined };
    } else {
      p = { ...p, host: v.host.replace(/\/+$/, ''), username: v.username, password: v.password };
    }
    setStatus({ busy: true, error: '' });
    // mesmo teste do diagnóstico (login + catálogo; M3U: o começo do arquivo)
    const r = await call('health', p, false, settings.streamFormat, import.meta.env.DEV).catch(() => null);
    if (!r || r.state === 'fail') {
      setStatus({ busy: false, error: r ? healthLine(r) : t('health.title.down') });
      return;
    }
    upsertPlaylist(p);
    setSetting('activePlaylist', p.id);
    const hasData = await openActive().catch(() => false);
    reset({ name: hasData ? 'home' : 'sync' });
  }

  return (
    <div class="form-page">
      <h1 class="t-title">{existing ? t('playlist.edit') : t('playlist.new')}</h1>
      <p class="t-caption c-3">{t('playlist.typeHint')}</p>
      <FocusZone axis="col" class="stack g24 form">
        <Fields type={type} setType={setType} fields={fields} values={values} set={set} />
        <Show when={status().error}>
          <p class="t-caption" style={{ color: 'var(--live-fg)' }}>
            {status().error}
          </p>
        </Show>
        <Show
          when={!status().busy}
          fallback={
            <div class="row g16">
              <Spinner size={36} />
              <span class="c-2">{t('playlist.testing')}</span>
            </div>
          }
        >
          <ActionRow
            actions={() => [
              { label: t('playlist.testSave'), icon: 'check', variant: 'primary', onSelect: save },
              { label: t('common.cancel'), variant: 'ghost', onSelect: () => back() },
            ]}
          />
        </Show>
      </FocusZone>
    </div>
  );
}

/** Campos do formulário. Fica num componente próprio para registrar a lista dentro da zona do form. */
function Fields(props: {
  type: () => 'xtream' | 'm3u';
  setType: (t: 'xtream' | 'm3u') => void;
  fields: () => { key: FieldKey; label: MessageKey; secret?: boolean }[];
  values: () => Record<FieldKey, string>;
  set: (key: FieldKey, v: string) => void;
}) {
  const inputs: Partial<Record<FieldKey, HTMLInputElement>> = {};
  // linha 0 = tipo; depois os campos
  const rows = useList({
    axis: 'col',
    count: () => props.fields().length + 1,
    autofocus: true,
    onSelect: (i) => {
      if (i === 0) return props.setType(props.type() === 'xtream' ? 'm3u' : 'xtream');
      const input = inputs[props.fields()[i - 1].key];
      if (input) input.focus();
    },
  });
  return (
    <div class="stack g12" ref={rows.ref}>
      <div class="field" classList={{ 'is-focused': rows.isFocused(0) }}>
        <span class="field__label">{t('playlist.type')}</span>
        <div class="field__input field__switch">
          <span classList={{ 'is-on': props.type() === 'xtream' }}>{t('playlist.xtream')}</span>
          <span classList={{ 'is-on': props.type() === 'm3u' }}>{t('playlist.m3u')}</span>
        </div>
      </div>
      <For each={props.fields()}>
        {(f, i) => (
          <label class="field" classList={{ 'is-focused': rows.isFocused(i() + 1) }}>
            <span class="field__label">{t(f.label)}</span>
            <input
              ref={(el) => (inputs[f.key] = el)}
              class="field__input"
              type={f.secret ? 'password' : 'text'}
              value={props.values()[f.key]}
              autocomplete="off"
              spellcheck={false}
              onChange={(e) => props.set(f.key, e.currentTarget.value)}
              onBlur={(e) => props.set(f.key, e.currentTarget.value)}
            />
          </label>
        )}
      </For>
    </div>
  );
}
