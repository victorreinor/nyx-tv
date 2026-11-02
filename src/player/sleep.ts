// Timer para dormir: desliga o vídeo e fecha o app no horário marcado.
// Vale para o app inteiro (sobrevive à troca de canal/episódio).
import { createSignal } from 'solid-js';

export const SLEEP_OPTIONS = [0, 15, 30, 60, 90];

const [sleepAt, setSleepAt] = createSignal<number | null>(null);
/** Minutos escolhidos (para marcar a opção no painel). 0 = desligado. */
const [sleepChoice, setSleepChoice] = createSignal(0);
export { sleepAt, sleepChoice };

export function setSleepTimer(minutes: number) {
  setSleepChoice(minutes);
  setSleepAt(minutes > 0 ? Date.now() + minutes * 60000 : null);
}

/** "Continuar assistindo" no aviso: empurra o desligamento. */
export function extendSleep(minutes: number) {
  setSleepAt(Date.now() + minutes * 60000);
}

export function sleepNow() {
  setSleepAt(Date.now());
}
