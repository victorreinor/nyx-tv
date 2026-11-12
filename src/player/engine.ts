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

/** Segundos de vídeo que o AVPlay junta antes de tocar e de voltar de uma travada (0 = a TV decide). */
export const BUFFER_OPTIONS = [0, 2, 5, 10, 15, 20];

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
  setBufferingParam?(option: string, unit: string, amount: number): void;
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
/** Buffer pedido pelo usuário, em segundos (0 = padrão da TV). Vale a partir do próximo vídeo aberto. */
let bufferSec = 0;

let events: EngineEvents = noop;
let subtitleOn = false;

let opened = 0;
let video: HTMLVideoElement | undefined;

/**
 * AVPlay abrindo (prepareAsync) ou saltando. stop/close no meio disso pode travar a TV de vez (o
 * sistema acaba fechando o app), então quem precisa fechar ou trocar de vídeo espera terminar.
 * Se o AVPlay não responder em BUSY_MAX_MS, segue mesmo assim para não ficar parado para sempre.
 */
const BUSY_MAX_MS = 20000;
let busy = 0;
let waiting: Array<() => void> = [];

function whenIdle(fn: () => void) {
  if (busy === 0) fn();
  else waiting.push(fn);
}

/** Marca o AVPlay como ocupado. Devolve quem libera (pode chamar mais de uma vez). */
function begin(): () => void {
  busy++;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    clearTimeout(cap);
    busy--;
    if (busy > 0) return;
    const run = waiting;
    waiting = [];
    run.forEach((fn) => fn());
  };
  const cap = setTimeout(end, BUSY_MAX_MS);
  return end;
}

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

  /** Vale para os próximos vídeos (o AVPlay só aceita antes do prepare). */
  setBuffer(sec: number) {
    bufferSec = sec > 0 ? sec : 0;
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
    return new Promise((resolve, reject) => {
      // outro vídeo ainda abrindo: troca só quando ele terminar (ou desiste, se já chegou outro pedido)
      whenIdle(() => (mine === opened ? load(resolve, reject) : resolve()));
    });

    function load(resolve: () => void, reject: (e: Error) => void) {
      if (!av) return resolve();
      safe(() => av.stop(), undefined);
      safe(() => av.close(), undefined);
      const end = begin();
      try {
        av.open(url);
        const r = rect();
        av.setDisplayRect(r.x, r.y, r.w, r.h);
        av.setDisplayMethod(DISPLAY_MODE[aspect()]);
        if (bufferSec && av.setBufferingParam) {
          try {
            av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', bufferSec);
            av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', bufferSec);
          } catch (e) {
            console.warn('[player] buffer ' + bufferSec + ' s recusado: ' + String(e));
          }
        }
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
            // saiu ou trocou enquanto abria: não toca (quem pediu o fechamento fecha agora)
            if (mine !== opened) {
              end();
              return resolve();
            }
            const start = () => {
              end();
              if (mine !== opened) return resolve();
              safe(() => av.play(), undefined);
              events.onPlaying();
              resolve();
            };
            if (startMs > 0) av.seekTo(startMs, start, start);
            else start();
          },
          (e) => {
            end();
            if (mine !== opened) resolve();
            else reject(new Error(String(e)));
          },
        );
      } catch (e) {
        end();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
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
   * Abrindo ou saltando, o fechamento espera o AVPlay terminar (ver `begin`). `defer`: deixa a tela
   * trocar antes de fechar, para quem apertou Voltar já ver a tela anterior.
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
      if (busy > 0) console.log('[player] fechamento espera o AVPlay terminar de abrir');
      if (defer) requestAnimationFrame(() => setTimeout(() => whenIdle(release), 30));
      else whenIdle(release);
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
      return new Promise((resolve) => {
        const end = begin();
        const done = () => {
          end();
          resolve();
        };
        try {
          av.seekTo(target, done, done);
        } catch {
          done();
        }
      });
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
