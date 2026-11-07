// Smart Hub Preview: mantém as fileiras do ícone em dia e abre o quadro clicado.
// Atualiza 5 s depois de abrir, ao sair do player (o progresso acabou de ser salvo), quando a lista muda
// e quando o app vai para segundo plano. pushPreview só chama o serviço se o JSON mudou.
import { createEffect, on, onCleanup } from 'solid-js';
import { openPreviewAction, pushPreview, readPreviewAction } from './preview';
import { top } from './router';
import { dataVersion } from './state';

export function PreviewWatcher() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void pushPreview(), ms);
  };

  const openFromControl = () => {
    const a = readPreviewAction();
    if (a) void openPreviewAction(a);
  };
  // app fechado: o quadro clicado chega no app-control da abertura
  openFromControl();

  const onVisibility = () => {
    if (!document.hidden) return;
    clearTimeout(timer);
    void pushPreview();
  };
  // app aberto em segundo plano: o clique chega como evento, sem recarregar (eden_resume, reload="disable")
  window.addEventListener('appcontrol', openFromControl);
  document.addEventListener('visibilitychange', onVisibility);
  schedule(5000);

  createEffect(on(dataVersion, () => schedule(3000), { defer: true }));
  createEffect(
    on(
      () => top().name === 'player',
      (playing, was) => {
        if (was && !playing) schedule(1500);
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    clearTimeout(timer);
    window.removeEventListener('appcontrol', openFromControl);
    document.removeEventListener('visibilitychange', onVisibility);
  });
  return null;
}
