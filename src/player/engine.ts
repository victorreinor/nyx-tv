// Motor de vídeo: AVPlay (decodificação por hardware da Samsung) na TV,
// <video> HTML5 no navegador do Mac (só para desenvolver a interface).

export interface EngineEvents {
  onBuffering: () => void;
  onPlaying: () => void;
  onTime: (ms: number) => void;
  onEnd: () => void;
  onError: (msg: string) => void;
}

export interface Engine {
  open(url: string, startMs?: number): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seek(ms: number): void;
  time(): number;
  duration(): number;
  paused(): boolean;
}

interface AVPlay {
  open(url: string): void;
  close(): void;
  stop(): void;
  play(): void;
  pause(): void;
  prepareAsync(ok: () => void, err: (e: unknown) => void): void;
  seekTo(ms: number, ok?: () => void, err?: () => void): void;
  setDisplayRect(x: number, y: number, w: number, h: number): void;
  setDisplayMethod(m: string): void;
  setListener(l: Record<string, (...a: any[]) => void>): void;
  setTimeoutForBuffering?(s: number): void;
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

function createAVPlayEngine(av: AVPlay, ev: EngineEvents): Engine {
  let opened = 0;
  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      // estado inválido do AVPlay (ex.: stop num player já fechado)
    }
  };
  return {
    open(url, startMs) {
      const mine = ++opened;
      safe(() => av.stop());
      safe(() => av.close());
      return new Promise((resolve, reject) => {
        try {
          av.open(url);
          av.setDisplayRect(0, 0, 1920, 1080);
          av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
          av.setListener({
            onbufferingstart: () => mine === opened && ev.onBuffering(),
            onbufferingprogress: () => undefined,
            onbufferingcomplete: () => mine === opened && ev.onPlaying(),
            oncurrentplaytime: (ms: number) => mine === opened && ev.onTime(ms),
            onstreamcompleted: () => mine === opened && ev.onEnd(),
            onerror: (e: unknown) => mine === opened && ev.onError(String(e)),
            onevent: () => undefined,
          });
          av.prepareAsync(
            () => {
              if (mine !== opened) return resolve();
              const start = () => {
                safe(() => av.play());
                ev.onPlaying();
                resolve();
              };
              if (startMs && startMs > 0) av.seekTo(startMs, start, start);
              else start();
            },
            (e) => reject(new Error(String(e))),
          );
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
    play: () => safe(() => av.play()),
    pause: () => safe(() => av.pause()),
    stop() {
      opened++;
      safe(() => av.stop());
      safe(() => av.close());
    },
    seek: (ms) => safe(() => av.seekTo(Math.max(0, ms))),
    time: () => {
      try {
        return av.getCurrentTime();
      } catch {
        return 0;
      }
    },
    duration: () => {
      try {
        return av.getDuration();
      } catch {
        return 0;
      }
    },
    paused: () => {
      try {
        return av.getState() === 'PAUSED';
      } catch {
        return false;
      }
    },
  };
}

function createHtml5Engine(video: HTMLVideoElement, ev: EngineEvents): Engine {
  video.onwaiting = () => ev.onBuffering();
  video.onplaying = () => ev.onPlaying();
  video.ontimeupdate = () => ev.onTime(video.currentTime * 1000);
  video.onended = () => ev.onEnd();
  video.onerror = () => ev.onError(video.error ? `media error ${video.error.code}` : 'media error');
  return {
    async open(url, startMs) {
      video.src = import.meta.env.DEV ? '/__proxy?url=' + encodeURIComponent(url) : url;
      if (startMs) video.currentTime = startMs / 1000;
      await video.play();
    },
    play: () => void video.play(),
    pause: () => video.pause(),
    stop() {
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
    seek: (ms) => (video.currentTime = Math.max(0, ms / 1000)),
    time: () => video.currentTime * 1000,
    duration: () => (isFinite(video.duration) ? video.duration * 1000 : 0),
    paused: () => video.paused,
  };
}

export function createEngine(ev: EngineEvents, video?: HTMLVideoElement): Engine {
  const av = avplay();
  if (av) return createAVPlayEngine(av, ev);
  if (!video) throw new Error('sem player disponível');
  return createHtml5Engine(video, ev);
}
