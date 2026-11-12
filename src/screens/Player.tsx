// Player em tela cheia: canal ao vivo (qualidade automática) ou filme/episódio (progresso salvo).
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from 'solid-js';
import { call } from '../data/client';
import type { ChannelRow, Episode, PlaySource, Quality } from '../data/types';
import { FocusZone, pushKeyHandler, trapCount } from '../app/focus';
import { fmtClock, fmtTime, type MessageKey, t } from '../app/i18n';
import { keyName, type KeyName } from '../app/keys';
import { back, type Media, replace } from '../app/router';
import { setSetting, settings } from '../app/settings';
import { saveProgress as storeProgress } from '../app/progress';
import { setLastChannel, toast, toggleFav } from '../app/state';
import { checkHealth, healthLine } from '../app/health';
import type { HealthReport } from '../data/types';
import { type Aspect, ASPECTS, FULL, player, type Tracks } from '../player/engine';
import { SLEEP_OPTIONS, setSleepTimer, sleepAt, sleepChoice } from '../player/sleep';
import { VGrid } from '../ui/VGrid';
import { nextFallback, pickStart, StallMonitor, stallRules } from '../player/quality';
import { OptionList, type OptionItem } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Badge, ColorKeys, Img, LiveBadge, ProgressBar, Spinner } from '../ui/primitives';
import { useClock } from '../ui/useClock';

/** Qualidade que desceu sozinha nesta sessão do app (não é salva: amanhã tenta de novo a melhor). */
const learned = new Map<string, Quality>();

const SAVE_EVERY_MS = 5000;
const OVERLAY_MS = 5000;
const NEXT_EPISODE_S = 8;
const SEEK_COMMIT_MS = 700;
/** Filme/episódio grande pode demorar para começar no AVPlay; canal ao vivo usa o StallMonitor. */
const VOD_STARTUP_MS = 25000;
/** CH▲▼ seguidos: só sintoniza quando para de apertar. */
const ZAP_MS = 700;
/** Filme/episódio carregando no meio da reprodução por mais que isso: mostra erro com "tentar de novo". */
const VOD_STALL_S = 30;
/** "Tocando" mas o tempo parado por isso: o vídeo travou em silêncio (comum em 4K com servidor lento). */
const SILENT_STALL_MS = 4000;
const ADVANCE_MS = 1000;

export function Player(props: { media: Media }) {
  const m = props.media;
  const clock = useClock(30000);
  player.setAspect(settings.aspect);
  player.setBuffer(settings.buffer);
  /** Buffer maior = o AVPlay espera mais para começar e para voltar: os limites crescem junto. */
  const bufferMs = settings.buffer * 1000;

  const [status, setStatus] = createSignal<'loading' | 'playing' | 'buffering' | 'error'>('loading');
  /** Último erro do AVPlay (detalhe técnico na tela de erro). */
  const [lastError, setLastError] = createSignal('');
  /** Teste da lista feito quando o vídeo não abriu: diz se é o servidor ou só este canal. */
  const [diag, setDiag] = createSignal<HealthReport | null>(null);
  const [overlay, setOverlay] = createSignal(true);
  const [panel, setPanel] = createSignal(false);
  const [pos, setPos] = createSignal(0);
  const [dur, setDur] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [seekTarget, setSeekTarget] = createSignal<number | null>(null);
  const [nextIn, setNextIn] = createSignal(0);
  const [tracks, setTracks] = createSignal<Tracks>({ audio: [], text: [], audioCurrent: -1, textCurrent: -1 });
  const [subtitle, setSubtitle] = createSignal('');
  const [guide, setGuide] = createSignal<{ rows: ChannelRow[]; index: number } | null>(null);
  /** Segundos esperando (carregando/travado), para dar feedback em vez de girar calado. */
  const [waitSec, setWaitSec] = createSignal(0);
  /** Destino do último salto enquanto o vídeo ainda não voltou a andar (filme/episódio). */
  const [landing, setLanding] = createSignal<number | null>(null);
  let lastBusyToast = 0;
  /** Último instante em que o tempo do vídeo andou de verdade. */
  let lastAdvanceAt = 0;
  let lastMs = 0;
  let waitTimer: ReturnType<typeof setInterval> | undefined;
  createEffect(
    on(status, (st) => {
      clearInterval(waitTimer);
      setWaitSec(0);
      if (st !== 'loading' && st !== 'buffering') return;
      const t0 = Date.now();
      waitTimer = setInterval(() => setWaitSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    }),
  );
  // não abriu: testa a lista (login, sem gastar conexão) para dizer se é o servidor ou só este vídeo
  createEffect(
    on(status, (st) => {
      if (st !== 'error') return;
      setDiag(null);
      checkHealth(false).then((r) => !disposed && status() === 'error' && setDiag(r));
    }),
  );
  const diagText = () => {
    const r = diag();
    if (!r) return '';
    // aviso de vencimento não explica o vídeo não abrir; telas cheias, sim
    if (r.state === 'fail' || (r.main && r.main.reason === 'connections')) return healthLine(r);
    return m.kind === 'live' ? t('player.listOk') : t('player.listOkVod');
  };
  let subTimer: ReturnType<typeof setTimeout> | undefined;
  let audioChecked = false; // escolha automática do áudio: uma vez por stream aberto
  let audioTimer: ReturnType<typeof setTimeout> | undefined;

  // ao vivo
  const [channelId, setChannelId] = createSignal(m.kind === 'live' ? m.channelId : '');
  const [row, setRow] = createSignal<ChannelRow | null>(null);
  const [sources, setSources] = createSignal<PlaySource[]>([]);
  const [srcIndex, setSrcIndex] = createSignal(-1);
  const [manual, setManual] = createSignal<Quality | null>(null);
  const monitor = new StallMonitor(stallRules(settings.buffer));
  let tried = new Set<number>();

  // vod
  const epIndex = () => (m.kind === 'episode' ? m.index : 0);
  const episode = (): Episode | null => (m.kind === 'episode' ? m.episodes[epIndex()] || null : null);
  let lastSave = 0;
  let seeking = false; // entre o salto e o vídeo voltar a andar
  /**
   * Filme/episódio: depois de abrir, saltar ou travar, só volta a "tocando" quando o tempo
   * andar ADVANCE_MS a partir do primeiro instante informado (resumeRef). Evita o pisca-pisca
   * do "carregando" com o AVPlay mandando o tempo em rajadas.
   */
  let resumeRef: number | null = null;
  let seekSteps = 0; // segurar a seta acelera os saltos
  let vodOpenedAt = 0;
  let vodRetries = 0;
  let zapTarget: string | null = null;
  let zapTimer: ReturnType<typeof setTimeout> | undefined;
  let zapChain: Promise<void> = Promise.resolve();
  /**
   * Saiu do player. Respostas do worker, timers e callbacks do AVPlay que chegam depois disso
   * não podem abrir vídeo nem saltar: o vídeo tocaria escondido atrás da outra tela.
   */
  let disposed = false;

  let overlayTimer: ReturnType<typeof setTimeout> | undefined;
  let seekTimer: ReturnType<typeof setTimeout> | undefined;
  let nextTimer: ReturnType<typeof setInterval> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;

  function showOverlay() {
    setOverlay(true);
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => !paused() && status() === 'playing' && seekTarget() === null && setOverlay(false), OVERLAY_MS);
  }

  // ---------- ao vivo ----------

  async function openChannel(id: string) {
    if (disposed) return;
    setChannelId(id);
    setLastChannel(id);
    showOverlay();
    call('touchChannel', id);
    setStatus('loading');
    const now = Date.now() / 1000;
    const [src, saved, r] = await Promise.all([
      call('sources', 'live', id, settings.streamFormat),
      call('channelQuality', id),
      call('channelRow', id, now - 60, now + 4 * 3600),
    ]);
    if (disposed || channelId() !== id) return;
    setRow(r);
    setSources(src);
    setManual(saved);
    tried = new Set();
    playSource(pickStart(src, settings.quality, saved || learned.get(id) || null));
  }

  function playSource(i: number) {
    if (disposed) return;
    if (i < 0) {
      setStatus('error');
      return;
    }
    setSrcIndex(i);
    tried.add(i);
    setStatus('loading');
    monitor.reset();
    audioChecked = false;
    clearTimeout(audioTimer);
    player.open(sources()[i].url).catch((e) => {
      setLastError(String((e as Error).message || e));
      fallback('open');
    });
  }

  /** Qualidade atual não aguentou: tenta a próxima (desce primeiro). */
  function fallback(why: 'open' | 'stall') {
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
      // não abriu ≠ travou: "sinal instável" só quando chegou a tocar
      toast(why === 'open' ? t('player.notOpened', { from, to }) : t('player.downgraded', { from, to }), 4000);
      learned.set(channelId(), to);
    }
    playSource(next);
  }

  /** CH▲▼: mostra o canal de destino na hora, mas só sintoniza quando para de apertar. */
  function zap(step: number) {
    if (m.kind !== 'live') return;
    showOverlay();
    zapChain = zapChain.then(async () => {
      const id = await call('neighbor', zapTarget || channelId(), liveCat, step);
      if (!id) return;
      zapTarget = id;
      const now = Date.now() / 1000;
      const r = await call('channelRow', id, now - 60, now + 4 * 3600);
      if (zapTarget === id) setRow(r);
      clearTimeout(zapTimer);
      zapTimer = setTimeout(() => {
        const target = zapTarget;
        zapTarget = null;
        if (target && target !== channelId()) openChannel(target);
        else if (target) call('channelRow', target, now - 60, now + 4 * 3600).then(setRow);
      }, ZAP_MS);
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

  // ---------- mini-grade (OK/◀ no canal) ----------

  // Categoria da mini-grade e do CH▲▼: resolvida uma vez ao abrir (`auto` = grupo do canal), para não
  // trocar de grupo ao zapear por um canal que está em mais de uma categoria.
  let liveCat = m.kind === 'live' ? m.category : 'all';
  if (m.kind === 'live') call('liveCategory', m.category, m.channelId).then((c) => (liveCat = c));

  async function openGuide() {
    const now = Date.now() / 1000;
    const g = await call('miniGuide', liveCat, channelId(), now - 60, now + 4 * 3600);
    setGuide(g);
  }

  function pickFromGuide(id: string) {
    setGuide(null);
    if (id !== channelId()) openChannel(id);
  }

  // ---------- opções (amarela): áudio, legenda, timer ----------

  function openOptions() {
    setTracks(player.tracks());
    setPanel(true);
  }

  /** Dublado por padrão: se o stream tem áudio no idioma do app, usa ele. */
  function autoAudio() {
    if (audioChecked) return;
    audioChecked = true;
    const tr = player.tracks();
    if (import.meta.env.VITE_REPORT_URL) {
      const av = (window as any).webapis && (window as any).webapis.avplay;
      let raw = 'sem getTotalTrackInfo';
      try {
        raw = av && av.getTotalTrackInfo ? JSON.stringify(av.getTotalTrackInfo()) : raw;
      } catch (e) {
        raw = 'erro: ' + String(e);
      }
      console.log('[tracks]', JSON.stringify(tr), 'bruto:', raw);
    }
    if (tr.audio.length < 2) return;
    const want = settings.locale === 'pt-BR' ? 'pt' : settings.locale;
    const match = tr.audio.find((a) => langKey(a.lang) === want);
    if (match && match.index !== tr.audioCurrent) player.selectAudio(match.index);
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
      storeProgress({ key: 'm:' + m.id, kind: 'movie', id: m.id, position, duration, updatedAt: now, title: m.title, image: m.image }, force);
      return;
    }
    const ep = episode();
    if (!ep) return;
    const nx = m.episodes[epIndex() + 1];
    storeProgress(
      {
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
      },
      force,
    );
  }

  async function openVod(startSec: number) {
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
    if (disposed) return;
    if (!src[0]) return setStatus('error');
    vodOpenedAt = Date.now();
    lastAdvanceAt = Date.now();
    resumeRef = null;
    audioChecked = false;
    clearTimeout(audioTimer);
    player.open(src[0].url, startSec * 1000).catch(() => retryVod());
  }

  /** Primeira falha costuma ser o servidor "acordando": tenta de novo sozinho uma vez. */
  function retryVod() {
    if (disposed) return;
    if (vodRetries < 1) {
      vodRetries++;
      openVod(pos() / 1000);
      return;
    }
    setStatus('error');
  }

  function onEnded() {
    if (m.kind === 'live') return fallback('stall');
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

  /** Acumula os saltos enquanto a seta é segurada; aplica quando solta (keyup) ou depois de 0,7 s parada. */
  function seekBy(direction: 1 | -1, base: number) {
    seekSteps++;
    const step = seekSteps > 40 ? 120 : seekSteps > 20 ? 60 : seekSteps > 8 ? 30 : base;
    const from = seekTarget() !== null ? seekTarget()! : pos();
    const target = Math.max(0, Math.min(dur() ? dur() - 2000 : Infinity, from + direction * step * 1000));
    setSeekTarget(target);
    clearTimeout(seekTimer);
    seekTimer = setTimeout(commitSeek, SEEK_COMMIT_MS);
  }

  /**
   * Aplica o salto: troca o quadradinho por "Indo para…" NA HORA, deixa a TV desenhar isso,
   * e só então chama o AVPlay (o seekTo pode segurar a TV em arquivo 4K lento).
   */
  function commitSeek() {
    clearTimeout(seekTimer);
    const target = seekTarget();
    if (target === null) return;
    seekSteps = 0;
    seeking = true;
    resumeRef = null;
    setPos(target);
    setSeekTarget(null);
    setLanding(target);
    setStatus('loading');
    requestAnimationFrame(() =>
      setTimeout(async () => {
        if (disposed) return;
        await player.seek(target);
        if (disposed) return;
        seeking = false;
        lastAdvanceAt = Date.now();
        if (paused()) {
          setStatus('playing');
          setLanding(null);
        }
      }, 50),
    );
  }

  function togglePause() {
    lastAdvanceAt = Date.now();
    if (paused()) player.play();
    else player.pause();
    setPaused(!paused());
    showOverlay();
  }

  // ---------- teclas ----------

  function onKey(k: KeyName): boolean {
    if (trapCount() > 0) return false; // painel/mini-grade/aviso usam o foco normal
    if (nextIn() > 0) {
      if (k === 'enter') playNextEpisode();
      else if (k === 'back') {
        clearInterval(nextTimer);
        setNextIn(0);
        back();
      }
      return true;
    }
    if (k === 'back' && !overlay() && status() === 'playing') {
      // primeiro Voltar mostra as informações; o segundo sai
      showOverlay();
      return true;
    }
    if (k === 'back' || k === 'stop') {
      saveProgress(true);
      back();
      return true;
    }
    if (k === 'enter' && showNextCta()) {
      playNextEpisode();
      return true;
    }
    showOverlay();
    if (status() === 'error' && k === 'green') {
      saveProgress(true);
      replace({ name: 'status' });
      return true;
    }
    if (status() === 'error' && k === 'enter') {
      if (m.kind === 'live') openChannel(channelId());
      else {
        const at = landing() !== null ? landing()! : pos();
        setLanding(null);
        openVod(at / 1000);
      }
      return true;
    }
    if (k === 'yellow') {
      openOptions();
      return true;
    }
    if (m.kind === 'live') {
      if (k === 'enter' || k === 'left') openGuide();
      else if (k === 'chup' || k === 'up') zap(1);
      else if (k === 'chdown' || k === 'down') zap(-1);
      else if (k === 'blue') void toggleFav('live', channelId());
      return true;
    }
    // carregando (abertura ou depois de um salto): só Voltar funciona, com aviso
    const busy = landing() !== null || ((status() === 'loading' || status() === 'buffering') && !paused());
    if (busy && k !== 'info') {
      if (Date.now() - lastBusyToast > 2500) {
        lastBusyToast = Date.now();
        toast(t('player.waitLoad'));
      }
      return true;
    }
    if (k === 'enter' || k === 'playpause') togglePause();
    else if (k === 'play' && paused()) togglePause();
    else if (k === 'pause' && !paused()) togglePause();
    else if (k === 'left') seekBy(-1, 10);
    else if (k === 'right') seekBy(1, 10);
    else if (k === 'rw') seekBy(-1, 30);
    else if (k === 'ff') seekBy(1, 30);
    return true;
  }

  onMount(() => {
    player.setRect(FULL);
    player.setEvents({
      onBuffering: () => {
        if (m.kind !== 'live') {
          // filme: só muda para carregando se estava tocando (e aí exige andar de novo)
          if (status() === 'playing' && !paused()) {
            resumeRef = null;
            setStatus('buffering');
          }
          return;
        }
        setStatus('buffering');
        monitor.buffering();
      },
      onPlaying: () => {
        setDur(player.duration());
        if (m.kind === 'live') {
          setStatus('playing');
          monitor.playing();
        }
        if (!audioChecked) {
          clearTimeout(audioTimer);
          audioTimer = setTimeout(autoAudio, 2000);
        }
      },
      onSubtitle: (text, durationMs) => {
        setSubtitle(text.replace(/<[^>]+>/g, ''));
        clearTimeout(subTimer);
        subTimer = setTimeout(() => setSubtitle(''), Math.max(800, durationMs || 3000));
      },
      onTime: (ms) => {
        if (seeking || seekTarget() !== null) return;
        if (Math.abs(ms - lastMs) > 200) {
          lastMs = ms;
          lastAdvanceAt = Date.now();
        }
        if (m.kind === 'live') {
          setPos(ms);
          if (status() !== 'playing') {
            setStatus('playing');
            monitor.playing();
            showOverlay();
          }
          return;
        }
        if (status() !== 'playing') {
          // só sai do "carregando" depois de andar 1 s de verdade a partir de onde parou
          if (resumeRef === null) resumeRef = ms;
          if (ms < resumeRef + ADVANCE_MS) return;
          setStatus('playing');
          setLanding(null);
          vodRetries = 0;
          showOverlay();
        }
        setPos(ms);
        if (!dur()) setDur(player.duration());
        saveProgress();
      },
      onEnd: onEnded,
      onError: (msg) => {
        setLastError(msg);
        if (m.kind === 'live') fallback('open');
        else retryVod();
      },
    });
    const pop = pushKeyHandler(onKey);
    onCleanup(pop);
    const onKeyUp = (e: KeyboardEvent) => {
      const k = keyName(e);
      if (seekTarget() !== null && (k === 'left' || k === 'right' || k === 'rw' || k === 'ff')) commitSeek();
    };
    document.addEventListener('keyup', onKeyUp, true);
    onCleanup(() => document.removeEventListener('keyup', onKeyUp, true));
    if (m.kind === 'live') openChannel(m.channelId);
    else openVod(m.position || 0);
    watchdog = setInterval(() => {
      if (status() === 'error' || seeking) return;
      if (m.kind !== 'live') {
        if (status() === 'loading' && landing() === null && vodOpenedAt && Date.now() - vodOpenedAt > VOD_STARTUP_MS + bufferMs) retryVod();
        else if (status() !== 'playing' && (status() === 'buffering' || landing() !== null) && waitSec() > VOD_STALL_S + settings.buffer) setStatus('error');
        else if (status() === 'playing' && !paused() && seekTarget() === null && lastAdvanceAt && Date.now() - lastAdvanceAt > SILENT_STALL_MS) {
          // diz que toca, mas o tempo não anda: mostra que está carregando (e o limite de 30 s vale)
          resumeRef = null;
          setStatus('buffering');
        }
        return;
      }
      const v = monitor.verdict();
      if (!v) return;
      // canal com uma qualidade só: não há para onde trocar, então travar segue carregando (não vira erro)
      const canSwitch = settings.autoQuality && sources().length > 1;
      if (m.kind === 'live' && (canSwitch || v === 'startup')) fallback(v === 'startup' ? 'open' : 'stall');
    }, 1000);
  });

  onCleanup(() => {
    saveProgress(true);
    disposed = true;
    clearTimeout(overlayTimer);
    clearTimeout(seekTimer);
    clearInterval(nextTimer);
    clearInterval(watchdog);
    clearTimeout(zapTimer);
    clearTimeout(subTimer);
    clearTimeout(audioTimer);
    clearInterval(waitTimer);
    player.setEvents(null);
    // a tela troca primeiro: fechar o AVPlay no meio de abrir/saltar pode segurar a TV
    player.stop(true);
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
  const showNextCta = () => {
    if (m.kind !== 'episode' || !m.episodes[epIndex() + 1] || !settings.nextEpisodeAt || !dur() || nextIn() > 0) return false;
    const left = (dur() - pos()) / 1000;
    return left > 0 && left <= settings.nextEpisodeAt;
  };
  const shownPos = () => (seekTarget() !== null ? seekTarget()! : pos());
  const seekDelta = () => (seekTarget() !== null ? (seekTarget()! - pos()) / 1000 : 0);
  const vodTitle = () => (m.kind === 'movie' ? m.title : m.kind === 'episode' ? m.seriesTitle : '');
  const vodSub = () => {
    const ep = episode();
    return ep ? `${t('common.seasonEp', { s: ep.season, e: ep.episode })}${ep.title ? ' · ' + ep.title : ''}` : '';
  };
  const audioOptions = createMemo<OptionItem[]>(() =>
    tracks().audio.map((a, i) => ({ id: String(a.index), label: langLabel(a.lang) || t('player.track', { n: i + 1 }) })),
  );
  const textOptions = createMemo<OptionItem[]>(() => [
    { id: '-1', label: t('player.subtitlesOff') },
    ...tracks().text.map((a, i) => ({ id: String(a.index), label: langLabel(a.lang) || t('player.track', { n: i + 1 }) })),
  ]);
  const sleepOptions = createMemo<OptionItem[]>(() =>
    SLEEP_OPTIONS.map((min) => ({
      id: String(min),
      label: min ? String(min) : t('common.off'),
      hint: min && min === sleepChoice() && sleepAt() ? t('player.sleepAt', { t: fmtTime(sleepAt()! / 1000) }) : undefined,
    })),
  );
  const aspectOptions = createMemo<OptionItem[]>(() => ASPECTS.map((a) => ({ id: a, label: t(('player.aspect.' + a) as MessageKey) })));
  /** Qualidades distintas do canal. Com uma só, não há o que escolher (nem "Automático"). */
  const qualities = createMemo(() => {
    const seen: Quality[] = [];
    sources().forEach((s) => s.quality && seen.indexOf(s.quality) === -1 && seen.push(s.quality));
    return seen;
  });
  const qualityOptions = createMemo<OptionItem[]>(() => {
    const seen = qualities();
    return [
      { id: 'auto', label: t('player.auto'), hint: manual() ? undefined : t('player.autoNow', { q: quality() || '—' }) },
      ...seen.map((q) => ({ id: q, label: q === 'FHD' ? 'Full HD' : q, hint: q === 'SD' ? t('player.economy') : undefined })),
    ];
  });

  return (
    <div class="player">
      <Show when={seekTarget() !== null}>
        <div class="player__center">
          <div class="player__seek stack g8">
            <span class="player__seek-time">{fmtClock(seekTarget()! / 1000)}</span>
            <span class="player__seek-delta">
              {seekDelta() >= 0 ? '+' : '−'}
              {fmtClock(Math.abs(seekDelta()))}
            </span>
          </div>
        </div>
      </Show>
      <Show when={seekTarget() === null && status() !== 'error' && (status() === 'loading' || status() === 'buffering' || landing() !== null)}>
        <div class="player__center stack g16" style={{ 'justify-items': 'center' }}>
          <Spinner size={72} />
          <div class="player__wait stack g8">
            <span class="t-card">
              {landing() !== null ? t('player.goingTo', { t: fmtClock(landing()! / 1000) }) : t('common.loading')}
              {waitSec() >= 3 ? `  ·  ${waitSec()} s` : ''}
            </span>
            <Show when={waitSec() >= 8}>
              <span class="t-caption c-2">{t('player.slow')}</span>
              <span class="t-caption c-3">{t('player.backToCancel')}</span>
            </Show>
          </div>
        </div>
      </Show>
      <Show when={status() === 'error'}>
        <div class="player__center">
          <div class="player__error stack g16">
            <Icon name="alert" size={56} color="var(--warn)" />
            <span class="t-section">{m.kind === 'live' ? t('player.failed') : t('player.failedVod')}</span>
            <Show when={diag()} fallback={<span class="c-2">{t('health.checking')}</span>}>
              <span class="t-body player__diag">{diagText()}</span>
            </Show>
            <Show when={lastError()}>
              <span class="t-caption c-3">{lastError()}</span>
            </Show>
            <div class="row g32">
              <span class="c-2">OK · {t('common.retry')}</span>
              <ColorKeys keys={[{ color: 'green', label: t('health.diagnose') }]} />
            </div>
          </div>
        </div>
      </Show>

      <div class="player__overlay" classList={{ 'is-hidden': (!overlay() && !panel() && nextIn() === 0) || !!guide() }}>
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

      <Show when={showNextCta()}>
        <div class="player__next-btn btn btn--primary is-focused">
          <span>{t('player.nextEpisodeBtn')}</span>
          <Icon name="next" size={26} />
        </div>
      </Show>

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

      <Show when={subtitle()}>
        <div class="player__subtitle">{subtitle()}</div>
      </Show>

      <Show when={guide()}>
        <FocusZone axis="col" trap onKey={(k) => (k === 'back' || k === 'left' ? (setGuide(null), true) : false)} class="player__guide">
          <h2 class="t-section player__guide-title">{t('player.channels')}</h2>
          <VGrid<ChannelRow>
            items={() => guide()!.rows}
            initial={guide()!.index}
            cols={1}
            cellW={540}
            cellH={96}
            gapX={0}
            gapY={8}
            height={930}
            anchorRow={4}
            onSelect={(r) => pickFromGuide(r.id)}
            render={(r, f) => <MiniGuideRow row={r} focused={f} playing={r().id === channelId()} />}
          />
        </FocusZone>
      </Show>

      <Show when={panel()}>
        <FocusZone axis="col" trap onKey={(k) => (k === 'back' || k === 'yellow' ? (setPanel(false), true) : false)} class="player__panel stack g12">
          <div class="row g12">
            <span class="colorkey colorkey--yellow" />
            <h2 class="t-section">{t('player.options')}</h2>
          </div>
          <Show when={m.kind === 'live' && qualities().length > 1}>
            <span class="t-micro c-3 player__panel-label">{t('player.quality')}</span>
            <OptionList items={qualityOptions} selected={() => manual() || 'auto'} onSelect={(id) => chooseQuality(id as Quality | 'auto')} />
          </Show>
          <Show when={tracks().audio.length > 1}>
            <span class="t-micro c-3 player__panel-label">{t('player.audio')}</span>
            <OptionList
              items={audioOptions}
              selected={() => String(tracks().audioCurrent)}
              onSelect={(id) => {
                player.selectAudio(Number(id));
                setTracks({ ...tracks(), audioCurrent: Number(id) });
              }}
            />
          </Show>
          <Show when={tracks().text.length > 0}>
            <span class="t-micro c-3 player__panel-label">{t('player.subtitles')}</span>
            <OptionList
              items={textOptions}
              selected={() => String(tracks().textCurrent)}
              onSelect={(id) => {
                player.selectText(Number(id));
                if (Number(id) < 0) setSubtitle('');
                setTracks({ ...tracks(), textCurrent: Number(id) });
              }}
            />
          </Show>
          <span class="t-micro c-3 player__panel-label">{t('player.aspect')}</span>
          <OptionList
            axis="row"
            class="player__sleep"
            items={aspectOptions}
            selected={() => settings.aspect}
            onSelect={(id) => {
              setSetting('aspect', id as Aspect);
              player.setAspect(id as Aspect);
            }}
          />
          <span class="t-micro c-3 player__panel-label">{t('player.sleepMin')}</span>
          <OptionList
            axis="row"
            class="player__sleep"
            items={sleepOptions}
            selected={() => String(sleepChoice())}
            onSelect={(id) => {
              setSleepTimer(Number(id));
              if (Number(id) > 0) toast(t('player.sleepSet', { t: fmtTime(sleepAt()! / 1000) }));
            }}
          />
        </FocusZone>
      </Show>
    </div>
  );
}

/** Linha da mini-grade: logo, número, nome, agora (com andamento) e a seguir. */
function MiniGuideRow(props: { row: () => ChannelRow; focused: () => boolean; playing: boolean }) {
  const now = () => Date.now() / 1000;
  const cur = () => props.row().programs.find((p) => p.start <= now() && p.stop > now());
  const next = () => props.row().programs.find((p) => p.start > now());
  return (
    <div class="mini-row" classList={{ 'is-focused': props.focused(), 'is-playing': props.playing }}>
      <Img class="mini-row__logo" src={props.row().logo} alt={props.row().name} />
      <div class="stack g4 grow" style={{ 'min-width': 0 }}>
        <span class="mini-row__name ellipsis">
          {props.row().num < 99999 ? props.row().num + ' · ' : ''}
          {props.row().name}
        </span>
        <span class="mini-row__now ellipsis">{cur() ? cur()!.title : t('live.noGuide')}</span>
        <Show when={cur()}>
          <ProgressBar value={(now() - cur()!.start) / (cur()!.stop - cur()!.start)} tone="live" height={3} />
        </Show>
        <Show when={props.focused() && next()}>
          <span class="mini-row__next ellipsis">
            {fmtTime(next()!.start)} · {next()!.title}
          </span>
        </Show>
      </div>
      <Show when={props.playing}>
        <Icon name="play" size={22} color="var(--ring)" />
      </Show>
    </div>
  );
}

/** "por"/"pt"/"pt-BR" → "pt". */
function langKey(code: string): string {
  const c = (code || '').toLowerCase();
  const map: Record<string, string> = { por: 'pt', pt: 'pt', eng: 'en', en: 'en', spa: 'es', es: 'es', fre: 'fr', fra: 'fr', fr: 'fr', ita: 'it', it: 'it', ger: 'de', deu: 'de', de: 'de', jpn: 'ja', ja: 'ja', kor: 'ko', ko: 'ko' };
  return map[c] || map[c.slice(0, 2)] || map[c.slice(0, 3)] || c;
}

function langLabel(code: string): string {
  const k = langKey(code);
  if (!k) return '';
  return ['pt', 'en', 'es', 'fr', 'it', 'de', 'ja', 'ko'].indexOf(k) !== -1 ? t(('lang.' + k) as MessageKey) : k.toUpperCase();
}
