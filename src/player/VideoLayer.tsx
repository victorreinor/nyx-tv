// Camada de vídeo do app (sempre montada, atrás das telas).
//
// Na TV, o <object> do AVPlay fica SEMPRE em tela cheia: é o único jeito comprovado nesta TV.
// Para a prévia, só o retângulo do AVPlay (setDisplayRect) muda e a interface cobre tudo
// menos o furo da caixinha (src/screens/Live.tsx). Encolher/mover o <object> deixava a prévia preta.
// No Mac (<video> HTML5) não existe setDisplayRect, então ali o elemento segue o retângulo.
import { Show } from 'solid-js';
import { attachVideoElement, currentUrl, hasNativePlayer, rect } from './engine';

export function VideoLayer() {
  const style = () => {
    const r = rect();
    return { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` };
  };
  return (
    <Show when={hasNativePlayer()} fallback={<video ref={attachVideoElement} class="video-layer" classList={{ hidden: !currentUrl() }} style={style()} autoplay />}>
      <object type="application/avplayer" class="video-layer video-layer--full" classList={{ hidden: !currentUrl() }} />
    </Show>
  );
}
