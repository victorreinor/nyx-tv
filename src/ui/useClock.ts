import { createSignal, onCleanup } from 'solid-js';

/** Relógio reativo (ms), atualizado a cada `everyMs`. Um timer por tela que precisa. */
export function useClock(everyMs = 20000) {
  const [now, setNow] = createSignal(Date.now());
  const id = setInterval(() => setNow(Date.now()), everyMs);
  onCleanup(() => clearInterval(id));
  return now;
}
