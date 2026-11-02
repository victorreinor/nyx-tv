// Camada de vídeo do app (sempre montada, atrás das telas). Na TV o <object> do AVPlay
// "fura" a camada da interface no retângulo dele e o vídeo aparece por baixo.
import { Show } from 'solid-js';
import { attachVideoElement, currentUrl, hasNativePlayer, rect } from './engine';

export function VideoLayer() {
  const style = () => {
    const r = rect();
    return { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` };
  };
  return (
    <Show when={hasNativePlayer()} fallback={<video ref={attachVideoElement} class="video-layer" classList={{ hidden: !currentUrl() }} style={style()} autoplay />}>
      <object type="application/avplayer" class="video-layer" classList={{ hidden: !currentUrl() }} style={style()} />
    </Show>
  );
}
