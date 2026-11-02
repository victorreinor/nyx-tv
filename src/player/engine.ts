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
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL: Rect = { x: 0, y: 0, w: 1920, h: 1080 };

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
export { currentUrl, rect };

let events: EngineEvents = noop;

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

  open(url: string, startMs = 0): Promise<void> {
    const mine = ++opened;
    setCurrentUrl(url);
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
        av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        av.setListener({
          onbufferingstart: () => mine === opened && events.onBuffering(),
          onbufferingprogress: () => undefined,
          onbufferingcomplete: () => mine === opened && events.onPlaying(),
          oncurrentplaytime: (ms: number) => mine === opened && events.onTime(ms),
          onstreamcompleted: () => mine === opened && events.onEnd(),
          onerror: (e: unknown) => mine === opened && events.onError(String(e)),
          onevent: () => undefined,
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

  stop() {
    opened++;
    setCurrentUrl('');
    const av = avplay();
    if (av) {
      safe(() => av.stop(), undefined);
      safe(() => av.close(), undefined);
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
    if (av) return new Promise((resolve) => safe(() => av.seekTo(target, () => resolve(), () => resolve()), resolve()));
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
