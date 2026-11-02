// Configurações: seções à esquerda (o conteúdo acompanha o foco), painel à direita.
import { createMemo, createResource, createSignal, For, type JSX, Match, Show, Switch } from 'solid-js';
import { call } from '../data/client';
import type { Category, Kind, PlaylistConfig } from '../data/types';
import { FocusZone, useList } from '../app/focus';
import { fmtAgo, fmtDay, LOCALES, t } from '../app/i18n';
import { go, reset } from '../app/router';
import { type QualityPref, removePlaylistSetting, setSetting, settings } from '../app/settings';
import { applyFilters, dataVersion, openActive, runSync, setDataVersion, stats, toast } from '../app/state';
import { type Action, ActionRow, OptionList, type OptionItem } from '../ui/controls';
import { Logo } from '../ui/Icon';
import { Badge, Toggle } from '../ui/primitives';
import { PinDialog } from '../ui/overlays';
import { VGrid } from '../ui/VGrid';
import { applyUpdate, checkForUpdate, running, updateStatus } from '../app/update';

type SectionId = 'playlists' | 'language' | 'parental' | 'player' | 'categories' | 'history' | 'tmdb' | 'storage' | 'about';
const SECTIONS: { id: SectionId; icon: OptionItem['icon'] }[] = [
  { id: 'playlists', icon: 'list' },
  { id: 'language', icon: 'globe' },
  { id: 'parental', icon: 'lock' },
  { id: 'player', icon: 'play' },
  { id: 'categories', icon: 'layers' },
  { id: 'history', icon: 'refresh' },
  { id: 'tmdb', icon: 'movies' },
  { id: 'storage', icon: 'storage' },
  { id: 'about', icon: 'info' },
];

const VERSION = __APP_VERSION__;

export function Settings() {
  const [section, setSection] = createSignal<SectionId>('playlists');
  const items = () =>
    SECTIONS.map((s) => ({ id: s.id, icon: s.icon, label: t(('settings.' + s.id) as 'settings.playlists') }));
  return (
    <FocusZone axis="row" class="settings">
      <nav class="settings__nav stack g8">
        <h1 class="t-title settings__title">{t('settings.title')}</h1>
        <OptionList items={items} selected={section} onSelect={(id) => setSection(id as SectionId)} onFocusItem={(id) => setSection(id as SectionId)} />
        <span class="c-3 t-caption settings__version">Nyx {VERSION}</span>
      </nav>
      <FocusZone axis="col" class="settings__panel">
        <Switch>
          <Match when={section() === 'playlists'}>
            <PlaylistsPanel />
          </Match>
          <Match when={section() === 'language'}>
            <Panel title={t('settings.language')}>
              <OptionList items={() => LOCALES.map((l) => ({ id: l.id, label: l.label }))} selected={() => settings.locale} onSelect={(id) => setSetting('locale', id as typeof settings.locale)} />
            </Panel>
          </Match>
          <Match when={section() === 'parental'}>
            <ParentalPanel />
          </Match>
          <Match when={section() === 'player'}>
            <PlayerPanel />
          </Match>
          <Match when={section() === 'categories'}>
            <CategoriesPanel />
          </Match>
          <Match when={section() === 'history'}>
            <HistoryPanel />
          </Match>
          <Match when={section() === 'tmdb'}>
            <TmdbPanel />
          </Match>
          <Match when={section() === 'storage'}>
            <StoragePanel />
          </Match>
          <Match when={section() === 'about'}>
            <Panel title={t('settings.about')}>
              <div class="stack g16">
                <Logo size={96} />
                <span class="t-display">nyx</span>
                <span class="t-body c-2">{t('about.tagline')}</span>
                <span class="c-3">
                  {t('about.version', { v: VERSION })}
                  {running.ota ? ' (' + t('about.viaInternet') + ')' : ''} · github.com/victorreinor/nyx-tv
                </span>
                <Show when={updateStatus().kind !== 'off'}>
                  <UpdateBlock />
                </Show>
              </div>
            </Panel>
          </Match>
        </Switch>
      </FocusZone>
    </FocusZone>
  );
}

function Panel(props: { title: string; hint?: string; children: JSX.Element }) {
  return (
    <section class="stack g24">
      <h2 class="t-section">{props.title}</h2>
      <Show when={props.hint}>
        <p class="t-caption c-3">{props.hint}</p>
      </Show>
      {props.children}
    </section>
  );
}

function PlaylistsPanel() {
  const [confirm, setConfirm] = createSignal<string | null>(null);
  const active = (p: PlaylistConfig) => p.id === (settings.activePlaylist || (settings.playlists[0] && settings.playlists[0].id));

  async function activate(p: PlaylistConfig) {
    setSetting('activePlaylist', p.id);
    const hasData = await openActive().catch(() => false);
    reset({ name: hasData ? 'home' : 'sync' });
  }
  async function refresh() {
    toast(t('sync.live'), 60000);
    try {
      await runSync();
      toast(t('toast.updated'));
    } catch (err) {
      toast(t('sync.error', { msg: String((err as Error).message || err) }), 5000);
    }
  }
  async function remove(p: PlaylistConfig) {
    if (confirm() !== p.id) {
      setConfirm(p.id);
      toast(t('playlist.removeConfirm'));
      return;
    }
    await call('removePlaylist', p.id);
    removePlaylistSetting(p.id);
    if (!settings.playlists.length) reset({ name: 'welcome' });
    else if (active(p)) activate(settings.playlists[0]);
  }

  const playlistActions = (p: PlaylistConfig): Action[] => {
    const list: Action[] = active(p)
      ? [{ label: t('playlist.refresh'), icon: 'refresh', onSelect: refresh }]
      : [{ label: t('playlist.activate'), icon: 'check', variant: 'primary', onSelect: () => activate(p) }];
    list.push({ label: t('playlist.edit.short'), icon: 'edit', onSelect: () => go({ name: 'playlistForm', id: p.id }) });
    list.push({ label: confirm() === p.id ? t('playlist.removeConfirm') : t('playlist.remove'), icon: 'trash', variant: 'danger', onSelect: () => remove(p) });
    return list;
  };

  return (
    <Panel title={t('settings.playlists')}>
      <ActionRow actions={() => [{ label: t('playlist.add'), icon: 'plus', onSelect: () => go({ name: 'playlistForm' }) }]} />
      <For each={settings.playlists}>
        {(p) => (
          <div class="playlist-card stack g16" classList={{ 'is-active': active(p) }}>
            <div class="row g16">
              <span class="playlist-card__avatar">{(p.name || '?')[0].toUpperCase()}</span>
              <div class="stack g4 grow">
                <span class="t-section">{p.name}</span>
                <span class="t-caption c-2">
                  {p.type === 'xtream' ? `Xtream · ${p.username} · ${t('playlist.serverHidden')}` : 'M3U'}
                </span>
              </div>
              <Show when={active(p)}>
                <Badge tone="ok">{t('playlist.active')}</Badge>
              </Show>
            </div>
            <Show when={active(p) && stats()}>
              <div class="playlist-card__stats">
                <Stat value={stats()!.live} label={t('stats.channels')} />
                <Stat value={stats()!.movies} label={t('stats.movies')} />
                <Stat value={stats()!.series} label={t('stats.series')} />
                <Stat value={stats()!.epgUntil ? fmtDay(stats()!.epgUntil) : '—'} label={t('stats.epgDays')} />
              </div>
              <span class="t-caption c-3">{stats()!.catalogAt ? t('playlist.updatedAgo', { t: fmtAgo(stats()!.catalogAt) }) : ''}</span>
            </Show>
            <ActionRow actions={() => playlistActions(p)} />
          </div>
        )}
      </For>
    </Panel>
  );
}

function Stat(props: { value: number | string; label: string }) {
  return (
    <div class="stat stack g4">
      <span class="stat__value">{typeof props.value === 'number' ? props.value.toLocaleString() : props.value}</span>
      <span class="t-caption c-3">{props.label}</span>
    </div>
  );
}

function ParentalPanel() {
  const [flow, setFlow] = createSignal<null | 'unlock' | 'current' | 'new' | 'confirm'>(null);
  let pendingPin = '';
  const items = (): OptionItem[] => [
    { id: 'adult', label: t('parental.hideAdult'), icon: 'lock', right: () => <Toggle on={settings.hideAdult} /> },
    { id: 'pin', label: t('parental.changePin'), icon: 'edit' },
  ];
  const onSelect = (id: string) => {
    if (id === 'adult') {
      if (settings.hideAdult) setFlow('unlock');
      else {
        setSetting('hideAdult', true);
        applyFilters();
      }
    } else setFlow('current');
  };
  const submit = (pin: string): string | null => {
    const f = flow();
    if (f === 'unlock' || f === 'current') {
      if (pin !== settings.pin) return t('parental.wrongPin');
      if (f === 'unlock') {
        setSetting('hideAdult', false);
        applyFilters();
        setFlow(null);
      } else setFlow('new');
      return null;
    }
    if (f === 'new') {
      pendingPin = pin;
      setFlow('confirm');
      return null;
    }
    if (pin !== pendingPin) {
      setFlow('new');
      return t('parental.mismatch');
    }
    setSetting('pin', pin);
    setFlow(null);
    toast(t('parental.changed'));
    return null;
  };
  const title = () => {
    const f = flow();
    return f === 'new' ? t('parental.newPin') : f === 'confirm' ? t('parental.confirmPin') : f === 'current' ? t('parental.currentPin') : t('parental.enterPin');
  };
  return (
    <Panel title={t('settings.parental')}>
      <OptionList items={items} onSelect={onSelect} />
      <Show when={settings.pin === '0000'}>
        <p class="t-caption" style={{ color: 'var(--warn)' }}>
          {t('parental.defaultWarning')}
        </p>
      </Show>
      <Show when={flow()} keyed>
        {(f) => f && <PinDialog title={title()} onSubmit={submit} onClose={() => setFlow(null)} />}
      </Show>
    </Panel>
  );
}

function PlayerPanel() {
  const qualities = (): OptionItem[] => [
    { id: 'auto', label: t('player.auto'), hint: 'FHD → HD → SD' },
    { id: '4K', label: '4K', hint: t('player.unstable') },
    { id: 'FHD', label: 'Full HD' },
    { id: 'HD', label: 'HD' },
    { id: 'SD', label: 'SD', hint: t('player.economy') },
  ];
  const other = (): OptionItem[] => [
    { id: 'auto-switch', label: t('player.autoSwitch'), hint: t('player.settings.autoHint'), right: () => <Toggle on={settings.autoQuality} /> },
    { id: 'format', label: t('player.settings.format'), hint: settings.streamFormat === 'ts' ? t('player.settings.ts') : t('player.settings.hls') },
  ];
  const nextAt = (): OptionItem[] => [
    { id: '0', label: t('common.off') },
    { id: '30', label: '30 s' },
    { id: '60', label: '1 min' },
    { id: '90', label: '1 min 30 s' },
    { id: '120', label: '2 min' },
    { id: '180', label: '3 min' },
  ];
  return (
    <Panel title={t('player.settings.quality')}>
      <OptionList items={qualities} selected={() => settings.quality} onSelect={(id) => setSetting('quality', id as QualityPref)} />
      <h3 class="t-card settings__subtitle">{t('player.settings.nextAt')}</h3>
      <p class="t-caption c-3">{t('player.settings.nextAtHint')}</p>
      <div class="settings__chips">
        <OptionList axis="row" class="settings__inline" items={nextAt} selected={() => String(settings.nextEpisodeAt)} onSelect={(id) => setSetting('nextEpisodeAt', Number(id))} />
      </div>
      <OptionList
        items={other}
        onSelect={(id) => {
          if (id === 'auto-switch') setSetting('autoQuality', !settings.autoQuality);
          else setSetting('streamFormat', settings.streamFormat === 'ts' ? 'm3u8' : 'ts');
        }}
      />
    </Panel>
  );
}

function CategoriesPanel() {
  const [cats] = createResource(dataVersion, async () => {
    const kinds: Kind[] = ['live', 'movie', 'series'];
    const all = await Promise.all(kinds.map((k) => call('categories', k, true)));
    return ([] as Category[]).concat(...all);
  });
  const hidden = createMemo(() => new Set(settings.hiddenCategories));
  const kindLabel = (k: Kind) => (k === 'live' ? t('search.channels') : k === 'movie' ? t('search.movies') : t('search.series'));
  const toggle = (c: Category) => {
    const set = new Set(settings.hiddenCategories);
    if (set.has(c.id)) set.delete(c.id);
    else set.add(c.id);
    setSetting('hiddenCategories', Array.from(set));
    applyFilters();
  };
  return (
    <Panel title={t('settings.categories')} hint={t('categories.hint')}>
      <VGrid<Category>
        items={() => cats() || []}
        cols={1}
        cellW={1000}
        cellH={72}
        gapX={0}
        gapY={8}
        height={720}
        onSelect={toggle}
        render={(c, f) => (
          <div class="option" classList={{ 'is-focused': f() }}>
            <div class="stack g4 grow">
              <span class="option__label ellipsis">{c().name}</span>
              <span class="option__hint">
                {kindLabel(c().kind)} · {c().count}
              </span>
            </div>
            <span class="t-caption" classList={{ 'c-3': !hidden().has(c().id) }}>
              {hidden().has(c().id) ? t('categories.hidden') : t('categories.visible')}
            </span>
            <Toggle on={!hidden().has(c().id)} />
          </div>
        )}
      />
    </Panel>
  );
}

function UpdateBlock() {
  const text = () => {
    const s = updateStatus();
    switch (s.kind) {
      case 'checking': return t('update.checking');
      case 'current': return t('update.current');
      case 'ready': return t('update.ready', { v: s.v });
      case 'reinstall': return t('update.reinstall', { v: s.v });
      case 'error': return t('update.error');
      default: return t('update.idle');
    }
  };
  const actions = (): Action[] => {
    const s = updateStatus();
    if (s.kind === 'ready') return [{ label: t('update.apply'), icon: 'refresh', onSelect: applyUpdate }];
    if (s.kind === 'checking') return [];
    return [{ label: t('update.check'), icon: 'refresh', onSelect: () => void checkForUpdate() }];
  };
  return (
    <div class="stack g16 settings__update">
      <h3 class="t-section">{t('update.title')}</h3>
      <span class="t-body c-2">{text()}</span>
      <ActionRow actions={actions} />
    </div>
  );
}

function StoragePanel() {
  const [mb] = createResource(dataVersion, () => call('storageMB'));
  return (
    <Panel title={t('settings.storage')} hint={t('storage.reloadHint')}>
      <span class="t-section">{t('storage.used', { n: mb() || 0 })}</span>
      <ActionRow
        actions={() => [
          {
            label: t('storage.reload'),
            icon: 'refresh',
            onSelect: () => {
              toast(t('sync.live'), 60000);
              runSync()
                .then(() => toast(t('toast.updated')))
                .catch((err) => toast(t('sync.error', { msg: String((err as Error).message || err) }), 5000));
            },
          },
        ]}
      />
    </Panel>
  );
}

function HistoryPanel() {
  const [confirm, setConfirm] = createSignal<string | null>(null);
  const items = (): OptionItem[] => [
    { id: 'movie', label: t('history.movies'), icon: 'movies' },
    { id: 'episode', label: t('history.series'), icon: 'series' },
    { id: 'channels', label: t('history.channels'), icon: 'live' },
    { id: 'all', label: t('history.all'), icon: 'trash' },
  ];
  const run = (id: string) => {
    // ação destrutiva: pede um segundo OK
    if (confirm() !== id) {
      setConfirm(id);
      toast(t('history.confirm'));
      return;
    }
    setConfirm(null);
    call('clearHistory', id as 'movie' | 'episode' | 'channels' | 'all').then(() => {
      toast(t('history.cleared'));
      setDataVersion(dataVersion() + 1);
    });
  };
  return (
    <Panel title={t('settings.history')} hint={t('history.hint')}>
      <OptionList items={items} onSelect={run} onFocusItem={(id) => confirm() !== id && setConfirm(null)} />
    </Panel>
  );
}

function TmdbPanel() {
  const status = () => (!settings.tmdbKey ? t('tmdb.noKey') : settings.tmdbEnabled ? t('tmdb.on') : t('tmdb.off'));
  const items = (): OptionItem[] => [{ id: 'use', label: t('tmdb.use'), hint: status(), right: () => <Toggle on={settings.tmdbEnabled && !!settings.tmdbKey} /> }];
  return (
    <Panel title={t('settings.tmdb')} hint={t('tmdb.hint')}>
      <OptionList items={items} onSelect={() => setSetting('tmdbEnabled', !settings.tmdbEnabled)} />
      <TmdbKeyField />
    </Panel>
  );
}

/** Campo da chave: OK abre o teclado da TV; Salvar grava. */
function TmdbKeyField() {
  let input: HTMLInputElement | undefined;
  const [value, setValue] = createSignal(settings.tmdbKey);
  const field = useList({ axis: 'col', count: () => 1, onSelect: () => input && input.focus() });
  return (
    <div class="stack g16">
      <label class="field" classList={{ 'is-focused': field.isFocused(0) }} ref={field.ref}>
        <span class="field__label">{t('tmdb.key')}</span>
        <input ref={input} class="field__input" type="text" value={value()} autocomplete="off" spellcheck={false} onChange={(e) => setValue(e.currentTarget.value.trim())} onBlur={(e) => setValue(e.currentTarget.value.trim())} />
      </label>
      <ActionRow
        actions={() => [
          {
            label: t('common.save'),
            icon: 'check',
            onSelect: () => {
              setSetting('tmdbKey', value());
              toast(t('tmdb.saved'));
            },
          },
        ]}
      />
    </div>
  );
}
