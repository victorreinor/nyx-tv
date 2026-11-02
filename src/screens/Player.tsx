// Player em tela cheia: canal ao vivo (qualidade automática) ou filme/episódio (progresso salvo).
import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { call } from '../data/client';
import type { ChannelRow, Episode, PlaySource, Quality } from '../data/types';
import { pushKeyHandler } from '../app/focus';
import { fmtClock, fmtTime, t } from '../app/i18n';
import type { KeyName } from '../app/keys';
import { back, type Media, replace } from '../app/router';
import { settings } from '../app/settings';
import { toast } from '../app/state';
import { createEngine, type Engine, hasNativePlayer } from '../player/engine';
import { nextFallback, pickStart, StallMonitor } from '../player/quality';
import { OptionList, type OptionItem } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Badge, Img, LiveBadge, ProgressBar, Spinner } from '../ui/primitives';
import { FocusZone } from '../app/focus';
import { useClock } from '../ui/useClock';

/** Qualidade que desceu sozinha nesta sessão do app (não é salva: amanhã tenta de novo a melhor). */
const learned = new Map<string, Quality>();

const SAVE_EVERY_MS = 10000;
const OVERLAY_MS = 5000;
const NEXT_EPISODE_S = 8;

export function Player(props: { media: Media }) {
  const m = props.media;
  const clock = useClock(30000);
  let video: HTMLVideoElement | undefined;
  let engine: Engine | undefined;

  const [status, setStatus] = createSignal<'loading' | 'playing' | 'buffering' | 'error'>('loading');
  const [overlay, setOverlay] = createSignal(true);
  const [panel, setPanel] = createSignal(false);
  const [pos, setPos] = createSignal(0);
  const [dur, setDur] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [seekTarget, setSeekTarget] = createSignal<number | null>(null);
  const [nextIn, setNextIn] = createSignal(0);

  // ao vivo
  const [channelId, setChannelId] = createSignal(m.kind === 'live' ? m.channelId : '');
  const [row, setRow] = createSignal<ChannelRow | null>(null);
  const [sources, setSources] = createSignal<PlaySource[]>([]);
  const [srcIndex, setSrcIndex] = createSignal(-1);
  const [manual, setManual] = createSignal<Quality | null>(null);
  const monitor = new StallMonitor();
  let tried = new Set<number>();

  // vod
  const epIndex = () => (m.kind === 'episode' ? m.index : 0);
  const episode = (): Episode | null => (m.kind === 'episode' ? m.episodes[epIndex()] || null : null);
  let lastSave = 0;

  let overlayTimer: ReturnType<typeof setTimeout> | undefined;
  let seekTimer: ReturnType<typeof setTimeout> | undefined;
  let nextTimer: ReturnType<typeof setInterval> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;

  function showOverlay() {
    setOverlay(true);
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => !paused() && status() === 'playing' && setOverlay(false), OVERLAY_MS);
  }

  // ---------- ao vivo ----------

  async function openChannel(id: string) {
    setChannelId(id);
    setStatus('loading');
    showOverlay();
    call('touchChannel', id);
    const now = Date.now() / 1000;
    const [src, saved, r] = await Promise.all([
      call('sources', 'live', id, settings.streamFormat),
      call('channelQuality', id),
      call('channelRow', id, now - 60, now + 4 * 3600),
    ]);
    if (channelId() !== id) return;
    setRow(r);
    setSources(src);
    setManual(saved);
    tried = new Set();
    playSource(pickStart(src, settings.quality, saved || learned.get(id) || null));
  }

  function playSource(i: number) {
    if (i < 0 || !engine) {
      setStatus('error');
      return;
    }
    setSrcIndex(i);
    tried.add(i);
    setStatus('loading');
    monitor.reset();
    engine.open(sources()[i].url).catch(() => fallback());
  }

  /** Qualidade atual não aguentou: tenta a próxima (desce primeiro). */
  function fallback() {
    if (m.kind !== 'live') {
      setStatus('error');
      return;
    }
    const cur = srcIndex();
    const next = nextFallback(sources(), tried, cur);
    if (next === -1) {
      setStatus('error');
      return;
    }
    const from = sources()[cur] ? sources()[cur].quality : '';
    const to = sources()[next].quality;
    if (from && to && from !== to) {
      toast(t('player.downgraded', { from, to }), 4000);
      learned.set(channelId(), to);
    }
    playSource(next);
  }

  function zap(step: number) {
    if (m.kind !== 'live') return;
    call('neighbor', channelId(), m.category, step).then((id) => {
      if (id) openChannel(id);
    });
  }

  function chooseQuality(q: Quality | 'auto') {
    const id = channelId();
    setPanel(false);
    if (q === 'auto') {
      call('setChannelQuality', id, '');
      learned.delete(id);
      setManual(null);
      tried = new Set();
      playSource(pickStart(sources(), settings.quality, null));
      return;
    }
    call('setChannelQuality', id, q);
    setManual(q);
    tried = new Set();
    playSource(sources().findIndex((s) => s.quality === q));
  }

  // ---------- filme / episódio ----------

  function saveProgress(force = false) {
    if (m.kind === 'live' || !dur()) return;
    const now = Date.now();
    if (!force && now - lastSave < SAVE_EVERY_MS) return;
    lastSave = now;
    const position = pos() / 1000;
    const duration = dur() / 1000;
    if (m.kind === 'movie') {
      call('saveProgress', { key: 'm:' + m.id, kind: 'movie', id: m.id, position, duration, updatedAt: now, title: m.title, image: m.image });
      return;
    }
    const ep = episode();
    if (!ep) return;
    const nx = m.episodes[epIndex() + 1];
    call('saveProgress', {
      key: 'e:' + ep.id,
      kind: 'episode',
      id: ep.id,
      seriesId: m.seriesId,
      season: ep.season,
      episode: ep.episode,
      ext: ep.ext,
      position,
      duration,
      updatedAt: now,
      title: m.seriesTitle,
      image: m.image,
      next: nx ? { id: nx.id, season: nx.season, episode: nx.episode, ext: nx.ext, title: nx.title } : undefined,
    });
  }

  async function openVod(startSec: number) {
    if (!engine) return;
    setStatus('loading');
    setPos(startSec * 1000);
    setDur(0);
    showOverlay();
    monitor.reset();
    let src: PlaySource[];
    if (m.kind === 'movie') src = await call('sources', 'movie', m.id, settings.streamFormat);
    else {
      const ep = episode();
      if (!ep) return setStatus('error');
      src = await call('sources', 'episode', ep.id, settings.streamFormat, ep.ext, ep.url || '');
    }
    if (!src[0]) return setStatus('error');
    engine.open(src[0].url, startSec * 1000).catch(() => setStatus('error'));
  }

  function onEnded() {
    if (m.kind === 'live') return fallback();
    setPos(dur());
    saveProgress(true);
    if (m.kind === 'episode' && m.episodes[epIndex() + 1]) {
      setNextIn(NEXT_EPISODE_S);
      nextTimer = setInterval(() => {
        if (nextIn() <= 1) playNextEpisode();
        else setNextIn(nextIn() - 1);
      }, 1000);
      return;
    }
    back();
  }

  function playNextEpisode() {
    clearInterval(nextTimer);
    setNextIn(0);
    if (m.kind !== 'episode') return;
    const i = epIndex() + 1;
    if (!m.episodes[i]) return back();
    replace({ name: 'player', media: { ...m, index: i, position: 0 } });
  }

  function seekBy(deltaSec: number) {
    const base = seekTarget() !== null ? seekTarget()! : pos();
    const target = Math.max(0, Math.min(dur() || Infinity, base + deltaSec * 1000));
    setSeekTarget(target);
    clearTimeout(seekTimer);
    seekTimer = setTimeout(() => {
      if (engine) engine.seek(target);
      setPos(target);
      setSeekTarget(null);
    }, 600);
  }

  function togglePause() {
    if (!engine) return;
    if (paused()) engine.play();
    else engine.pause();
    setPaused(!paused());
    showOverlay();
  }

  // ---------- teclas ----------

  function onKey(k: KeyName): boolean {
    if (panel()) return false; // painel de qualidade usa o foco normal
    if (nextIn() > 0) {
      if (k === 'enter') playNextEpisode();
      else if (k === 'back') {
        clearInterval(nextTimer);
        setNextIn(0);
        back();
      }
      return true;
    }
    if (k === 'back' || k === 'stop') {
      saveProgress(true);
      back();
      return true;
    }
    showOverlay();
    if (status() === 'error' && k === 'enter') {
      if (m.kind === 'live') openChannel(channelId());
      else openVod(pos() / 1000);
      return true;
    }
    if (m.kind === 'live') {
      if (k === 'chup' || k === 'up') zap(1);
      else if (k === 'chdown' || k === 'down') zap(-1);
      else if (k === 'yellow') setPanel(true);
      else if (k === 'blue') call('toggleFav', 'live', channelId()).then((on) => toast(on ? t('toast.favAdded') : t('toast.favRemoved')));
      return true;
    }
    if (k === 'enter' || k === 'playpause') togglePause();
    else if (k === 'play' && paused()) togglePause();
    else if (k === 'pause' && !paused()) togglePause();
    else if (k === 'left') seekBy(-10);
    else if (k === 'right') seekBy(10);
    else if (k === 'rw') seekBy(-30);
    else if (k === 'ff') seekBy(30);
    return true;
  }

  onMount(() => {
    try {
      engine = createEngine(
        {
          onBuffering: () => {
            setStatus('buffering');
            monitor.buffering();
          },
          onPlaying: () => {
            setStatus('playing');
            monitor.playing();
            if (engine) setDur(engine.duration());
          },
          onTime: (ms) => {
            if (seekTarget() === null) setPos(ms);
            if (status() !== 'playing') {
              setStatus('playing');
              monitor.playing();
            }
            if (!dur() && engine) setDur(engine.duration());
            saveProgress();
          },
          onEnd: onEnded,
          onError: () => (m.kind === 'live' ? fallback() : setStatus('error')),
        },
        video,
      );
    } catch {
      setStatus('error');
      return;
    }
    const pop = pushKeyHandler(onKey);
    onCleanup(pop);
    if (m.kind === 'live') openChannel(m.channelId);
    else openVod(m.position || 0);
    watchdog = setInterval(() => {
      if (status() === 'error') return;
      const v = monitor.verdict();
      if (!v) return;
      if (m.kind === 'live' && (settings.autoQuality || v === 'startup')) fallback();
      else if (m.kind !== 'live' && v === 'startup' && status() === 'loading') setStatus('error');
    }, 1000);
  });

  onCleanup(() => {
    saveProgress(true);
    clearTimeout(overlayTimer);
    clearTimeout(seekTimer);
    clearInterval(nextTimer);
    clearInterval(watchdog);
    if (engine) engine.stop();
  });

  // ---------- visual ----------

  const now = () => clock() / 1000;
  const current = createMemo(() => {
    const r = row();
    return r ? r.programs.find((p) => p.start <= now() && p.stop > now()) : undefined;
  });
  const upNext = createMemo(() => {
    const r = row();
    const c = current();
    return r && c ? r.programs.find((p) => p.start >= c.stop) : undefined;
  });
  const quality = () => (sources()[srcIndex()] ? sources()[srcIndex()].quality : '');
  const shownPos = () => (seekTarget() !== null ? seekTarget()! : pos());
  const vodTitle = () => (m.kind === 'movie' ? m.title : m.kind === 'episode' ? m.seriesTitle : '');
  const vodSub = () => {
    const ep = episode();
    return ep ? `${t('common.seasonEp', { s: ep.season, e: ep.episode })}${ep.title ? ' · ' + ep.title : ''}` : '';
  };
  const qualityOptions = createMemo<OptionItem[]>(() => {
    const seen: Quality[] = [];
    sources().forEach((s) => s.quality && seen.indexOf(s.quality) === -1 && seen.push(s.quality));
    return [
      { id: 'auto', label: t('player.auto'), hint: manual() ? undefined : t('player.autoNow', { q: quality() || '—' }) },
      ...seen.map((q) => ({ id: q, label: q === 'FHD' ? 'Full HD' : q, hint: q === 'SD' ? t('player.economy') : undefined })),
    ];
  });

  return (
    <div class="player">
      <Show when={hasNativePlayer()} fallback={<video ref={video} class="player__video" autoplay />}>
        <object type="application/avplayer" class="player__video" />
      </Show>

      <Show when={status() === 'loading' || status() === 'buffering'}>
        <div class="player__center">
          <Spinner size={72} />
        </div>
      </Show>
      <Show when={status() === 'error'}>
        <div class="player__center stack g16" style={{ 'justify-items': 'center' }}>
          <Icon name="alert" size={56} color="var(--warn)" />
          <span class="t-section">{t('player.failed')}</span>
          <span class="c-2">OK · {t('common.retry')}</span>
        </div>
      </Show>

      <div class="player__overlay" classList={{ 'is-hidden': !overlay() && !panel() && nextIn() === 0 }}>
        <div class="player__scrim" />
        <Show when={m.kind === 'live'}>
          <header class="player__top row g20">
            <Show when={row()}>
              <Img class="channel-logo" src={row()!.logo} alt={row()!.name} />
              <div class="stack g4">
                <span class="t-section">
                  {row()!.num < 99999 ? row()!.num + ' · ' : ''}
                  {row()!.name}
                </span>
              </div>
            </Show>
            <span class="player__clock t-card">{fmtTime(now())}</span>
          </header>
          <section class="player__bottom stack g16">
            <div class="row g12">
              <LiveBadge label={t('live.liveBadge')} />
              <Show when={quality()}>
                <Badge>{quality()}</Badge>
              </Show>
            </div>
            <h1 class="t-title clamp-2">{current() ? current()!.title : row() ? row()!.name : ''}</h1>
            <Show when={current()}>
              <div class="row g20 c-2 player__timeline">
                <span>{fmtTime(current()!.start)}</span>
                <ProgressBar value={(now() - current()!.start) / (current()!.stop - current()!.start)} tone="live" height={8} />
                <span>{fmtTime(current()!.stop)}</span>
              </div>
            </Show>
            <div class="row g32">
              <Show when={upNext()}>
                <span class="c-3">{t('player.next')}</span>
                <span style={{ 'font-weight': 700 }}>
                  {fmtTime(upNext()!.start)} · {upNext()!.title}
                </span>
              </Show>
              <span class="c-3 player__hint">{t('player.chHint')}</span>
            </div>
          </section>
        </Show>

        <Show when={m.kind !== 'live'}>
          <section class="player__bottom stack g16">
            <span class="t-micro c-ring">{vodSub()}</span>
            <h1 class="t-title clamp-2">{vodTitle()}</h1>
            <div class="row g20 c-2 player__timeline">
              <Icon name={paused() ? 'play' : 'pause'} size={28} color="var(--t1)" />
              <span>{fmtClock(shownPos() / 1000)}</span>
              <ProgressBar value={dur() ? shownPos() / dur() : 0} height={8} />
              <span>{fmtClock(dur() / 1000)}</span>
            </div>
            <span class="c-3">{t('player.vodHint')}</span>
          </section>
        </Show>
      </div>

      <Show when={nextIn() > 0 && m.kind === 'episode'}>
        <div class="player__next stack g12">
          <span class="t-micro c-ring">{t('player.nextEpisode', { n: nextIn() })}</span>
          <span class="t-card">
            {(() => {
              const nx = m.kind === 'episode' ? m.episodes[epIndex() + 1] : null;
              return nx ? `${t('common.seasonEp', { s: nx.season, e: nx.episode })} · ${nx.title}` : '';
            })()}
          </span>
          <span class="c-3">OK · {t('common.play')}</span>
        </div>
      </Show>

      <Show when={panel()}>
        <FocusZone axis="col" trap onKey={(k) => (k === 'back' || k === 'yellow' ? (setPanel(false), true) : false)} class="player__panel stack g12">
          <div class="row g12">
            <span class="colorkey colorkey--yellow" />
            <h2 class="t-section">{t('player.quality')}</h2>
          </div>
          <OptionList items={qualityOptions} selected={() => manual() || 'auto'} onSelect={(id) => chooseQuality(id as Quality | 'auto')} />
          <span class="t-caption c-3">{t('player.savedForChannel')}</span>
        </FocusZone>
      </Show>
    </div>
  );
}
