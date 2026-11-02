// Teclas do controle Samsung (e equivalentes no teclado, para desenvolver no Mac).

export type KeyName =
  | 'up' | 'down' | 'left' | 'right' | 'enter' | 'back'
  | 'red' | 'green' | 'yellow' | 'blue'
  | 'play' | 'pause' | 'playpause' | 'stop' | 'ff' | 'rw'
  | 'chup' | 'chdown' | 'info'
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

const BY_CODE: Record<number, KeyName> = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter',
  10009: 'back', 27: 'back', 8: 'back',
  403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
  415: 'play', 19: 'pause', 10252: 'playpause', 413: 'stop', 417: 'ff', 412: 'rw',
  427: 'chup', 428: 'chdown', 457: 'info',
  33: 'chup', 34: 'chdown', // PageUp/PageDown no Mac
};

// No Mac: F1–F4 fazem as teclas coloridas, espaço = play/pause.
const BY_KEY: Record<string, KeyName> = { F1: 'red', F2: 'green', F3: 'yellow', F4: 'blue', ' ': 'playpause', i: 'info' };

export function keyName(e: KeyboardEvent): KeyName | null {
  if (e.keyCode >= 48 && e.keyCode <= 57) return String(e.keyCode - 48) as KeyName;
  if (e.keyCode >= 96 && e.keyCode <= 105) return String(e.keyCode - 96) as KeyName;
  return BY_CODE[e.keyCode] || BY_KEY[e.key] || null;
}

/** Teclas que a TV só entrega ao app se forem registradas. */
export function registerTizenKeys() {
  const w = window as any;
  if (!w.tizen || !w.tizen.tvinputdevice) return;
  const names = [
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
    'ChannelUp', 'ChannelDown', 'Info',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  ];
  for (const n of names) {
    try {
      w.tizen.tvinputdevice.registerKey(n);
    } catch {
      // tecla inexistente neste modelo
    }
  }
}

export function exitApp() {
  const w = window as any;
  try {
    w.tizen.application.getCurrentApplication().exit();
  } catch {
    window.close();
  }
}
