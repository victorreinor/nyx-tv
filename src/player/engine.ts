// Motor de vídeo ÚNICO do app: AVPlay (decodificação por hardware da Samsung) na TV,
// <video> HTML5 no navegador do Mac (só para desenvolver a interface).
//
// É um singleton porque o AVPlay é um só. A camada <object> fica fixa no App (VideoLayer).
import { createSignal } from 'solid-js';

export interface EngineEvents {
  onBuffering: () => void;
  onPlaying: () => void;
  onTime: (ms: number) => void;
  onEnd: () => void;
  onError: (msg: string) => void;
  /** Legenda embutida: o AVPlay entrega o texto e o app desenha. */
  onSubtitle?: (text: string, durationMs: number) => void;
}

/** Faixa de áudio ou legenda do stream. `lang` é o código ISO que o stream informar (pode vir vazio). */
export interface Track {
  index: number;
  lang: string;
}

export interface Tracks {
  audio: Track[];
  text: Track[];
  audioCurrent: number;
  textCurrent: number; // -1 = legenda desligada
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL: Rect = { x: 0, y: 0, w: 1920, h: 1080 };

/**
 * Proporção da imagem. `fit` mantém a do stream (faixas pretas), `fill` estica para a tela toda
 * (stream SD/4:3 ou que informa a proporção errada), `auto` deixa a TV decidir pelo stream.
 */
export type Aspect = 'fit' | 'fill' | 'auto';
export const ASPECTS: Aspect[] = ['fit', 'auto', 'fill'];

const DISPLAY_MODE: Record<Aspect, string> = {
  fit: 'PLAYER_DISPLAY_MODE_LETTER_BOX',
  fill: 'PLAYER_DISPLAY_MODE_FULL_SCREEN',
  auto: 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO',
};

const noop: EngineEvents = { onBuffering() {}, onPlaying() {}, onTime() {}, onEnd() {}, onError() {} };

interface AVPlay {
  open(url: string): void;
  close(): void;
  stop(): void;
  play(): void;
  pause(): void;
  prepareAsync(ok: () => void, err: (e: unknown) => void): void;
  seekTo(ms: number, ok?: () => void, err?: (e: unknown) => void): void;
  setDisplayRect(x: number, y: number, w: number, h: number): void;
  setDisplayMethod(m: string): void;
  setListener(l: Record<string, (...a: any[]) => void>): void;
  getCurrentTime(): number;
  getDuration(): number;
  getState(): string;
  getTotalTrackInfo?(): { index: number; type: string; extra_info: string }[];
  getCurrentStreamInfo?(): { index: number; type: string }[];
  setSelectTrack?(type: string, index: number): void;
  setSilentSubtitle?(silent: boolean): void;
}

function parseLang(extra: string): string {
  try {
    const info = JSON.parse(extra || '{}');
    return String(info.language || info.track_lang || info.lang || '').toLowerCase();
  } catch {
    return '';
  }
}

function avplay(): AVPlay | null {
  const w = window as any;
  return w.webapis && w.webapis.avplay ? (w.webapis.avplay as AVPlay) : null;
}

export function hasNativePlayer(): boolean {
  return !!avplay();
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback; // estado inválido do AVPlay (ex.: stop num player já fechado)
  }
}

/** Retângulo onde o vídeo aparece (a camada de vídeo do App segue este sinal). */
const [rect, setRectSignal] = createSignal<Rect>(FULL);
/** URL aberta agora ('' = nada tocando). */
const [currentUrl, setCurrentUrl] = createSignal('');
/** No Mac a camada <video> segue este sinal (object-fit); na TV vai para o AVPlay. */
const [aspect, setAspectSignal] = createSignal<Aspect>('fit');
export { aspect, currentUrl, rect };

let events: EngineEvents = noop;
let subtitleOn = false;

let opened = 0;
let video: HTMLVideoElement | undefined;

/** Chamado pela camada de vídeo do App (no Mac é um <video>; na TV, o <object> do AVPlay). */
export function attachVideoElement(el: HTMLVideoElement | undefined) {
  video = el;
  if (!el) return;
  el.onwaiting = () => events.onBuffering();
  el.onplaying = () => events.onPlaying();
  el.ontimeupdate = () => events.onTime(el.currentTime * 1000);
  el.onended = () => events.onEnd();
  el.onerror = () => events.onError(el.error ? `media error ${el.error.code}` : 'media error');
}

export const player = {
  /** Troca quem recebe os eventos (player em tela cheia ↔ prévia da grade). */
  setEvents(ev: EngineEvents | null) {
    events = ev || noop;
  },

  setRect(r: Rect) {
    setRectSignal(r);
    const av = avplay();
    if (av && currentUrl()) safe(() => av.setDisplayRect(r.x, r.y, r.w, r.h), undefined);
  },

  /** Vale para o vídeo aberto agora (se houver) e para os próximos. */
  setAspect(a: Aspect) {
    setAspectSignal(a);
    const av = avplay();
    if (av && currentUrl()) safe(() => av.setDisplayMethod(DISPLAY_MODE[a]), undefined);
  },

  open(url: string, startMs = 0): Promise<void> {
    const mine = ++opened;
    setCurrentUrl(url);
    subtitleOn = false;
    const av = avplay();
    if (!av) {
      if (!video) return Promise.reject(new Error('sem player disponível'));
      video.src = import.meta.env.DEV ? '/__proxy?url=' + encodeURIComponent(url) : url;
      if (startMs) video.currentTime = startMs / 1000;
      return video.play();
    }
    safe(() => av.stop(), undefined);
    safe(() => av.close(), undefined);
    return new Promise((resolve, reject) => {
      try {
        av.open(url);
        const r = rect();
        av.setDisplayRect(r.x, r.y, r.w, r.h);
        av.setDisplayMethod(DISPLAY_MODE[aspect()]);
        av.setListener({
          onbufferingstart: () => mine === opened && events.onBuffering(),
          onbufferingprogress: () => undefined,
          onbufferingcomplete: () => mine === opened && events.onPlaying(),
          oncurrentplaytime: (ms: number) => mine === opened && events.onTime(ms),
          onstreamcompleted: () => mine === opened && events.onEnd(),
          onerror: (e: unknown) => mine === opened && events.onError(String(e)),
          onevent: () => undefined,
          onsubtitlechange: (duration: number, text: string) => mine === opened && events.onSubtitle && events.onSubtitle(String(text || ''), Number(duration) || 0),
        });
        av.prepareAsync(
          () => {
            if (mine !== opened) return resolve();
            const start = () => {
              safe(() => av.play(), undefined);
              events.onPlaying();
              resolve();
            };
            if (startMs > 0) av.seekTo(startMs, start, start);
            else start();
          },
          (e) => reject(new Error(String(e))),
        );
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  },

  play() {
    const av = avplay();
    if (av) safe(() => av.play(), undefined);
    else if (video) void video.play();
  },

  pause() {
    const av = avplay();
    if (av) safe(() => av.pause(), undefined);
    else if (video) video.pause();
  },

  /**
   * `defer`: deixa a tela trocar antes de fechar o AVPlay. stop/close no meio de abrir ou saltar
   * podem segurar a TV por segundos; assim quem apertou Voltar já vê a tela anterior.
   * Se outro vídeo abrir (ou alguém parar de novo) antes disso, o fechamento adiado não faz nada.
   */
  stop(defer = false) {
    const mine = ++opened;
    setCurrentUrl('');
    const av = avplay();
    if (av) {
      const release = () => {
        if (mine !== opened) return;
        safe(() => av.stop(), undefined);
        safe(() => av.close(), undefined);
      };
      if (defer) requestAnimationFrame(() => setTimeout(release, 30));
      else release();
    } else if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  },

  /** Resolve quando o salto terminou (o vídeo ainda pode carregar depois disso). */
  seek(ms: number): Promise<void> {
    const target = Math.max(0, ms);
    const av = avplay();
    if (av) {
      // seekTo antes de PLAYING/PAUSED/READY prende o AVPlay (e a TV) em arquivo lento
      const state = safe(() => av.getState(), 'NONE');
      if (state !== 'PLAYING' && state !== 'PAUSED' && state !== 'READY') return Promise.resolve();
      return new Promise((resolve) => safe(() => av.seekTo(target, () => resolve(), () => resolve()), resolve()));
    }
    if (!video) return Promise.resolve();
    const v = video;
    return new Promise((resolve) => {
      v.onseeked = () => {
        v.onseeked = null;
        resolve();
      };
      v.currentTime = target / 1000;
    });
  },

  /** Faixas do stream atual (AVPlay). No navegador do Mac não há faixas. */
  tracks(): Tracks {
    const empty: Tracks = { audio: [], text: [], audioCurrent: -1, textCurrent: -1 };
    const av = avplay();
    if (!av || !av.getTotalTrackInfo) return empty;
    const all = safe(() => av.getTotalTrackInfo!(), []);
    const cur = safe(() => (av.getCurrentStreamInfo ? av.getCurrentStreamInfo() : []), []);
    const pick = (type: string) => all.filter((t) => t.type === type).map((t) => ({ index: Number(t.index), lang: parseLang(t.extra_info) }));
    const curOf = (type: string) => {
      const c = cur.find((t) => t.type === type);
      return c ? Number(c.index) : -1;
    };
    return { audio: pick('AUDIO'), text: pick('TEXT'), audioCurrent: curOf('AUDIO'), textCurrent: subtitleOn ? curOf('TEXT') : -1 };
  },

  selectAudio(index: number) {
    const av = avplay();
    if (av && av.setSelectTrack) safe(() => av.setSelectTrack!('AUDIO', index), undefined);
  },

  /** Liga a legenda da faixa `index`, ou desliga com -1. */
  selectText(index: number) {
    const av = avplay();
    if (!av) return;
    subtitleOn = index >= 0;
    if (index >= 0 && av.setSelectTrack) safe(() => av.setSelectTrack!('TEXT', index), undefined);
    if (av.setSilentSubtitle) safe(() => av.setSilentSubtitle!(index < 0), undefined);
  },

  time(): number {
    const av = avplay();
    if (av) return safe(() => av.getCurrentTime(), 0);
    return video ? video.currentTime * 1000 : 0;
  },

  duration(): number {
    const av = avplay();
    if (av) return safe(() => av.getDuration(), 0);
    return video && isFinite(video.duration) ? video.duration * 1000 : 0;
  },
};
