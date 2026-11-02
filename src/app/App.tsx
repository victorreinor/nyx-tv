// Casca do app: menu lateral, pilha de telas, teclas e inicialização.
import { createEffect, createSignal, For, type JSX, on, onCleanup, onMount, Show } from 'solid-js';
import { Spinner } from '../ui/primitives';
import { Toast } from '../ui/overlays';
import { focusSidebar, isSidebarActive, Sidebar } from './Sidebar';
import { VideoLayer } from '../player/VideoLayer';
import { player, stopPreview } from '../player/engine';
import { clearFocus, dispatchKey, FocusZone, focusZone, type Zone } from './focus';
import { t } from './i18n';
import { exitApp, keyName, registerTizenKeys } from './keys';
import { back, goSection, isSection, type Route, reset, stack, top } from './router';
import { activePlaylist, newId, upsertPlaylist } from './settings';
import { openActive, toast } from './state';
import { Home } from '../screens/Home';
import { Live } from '../screens/Live';
import { Browse } from '../screens/Browse';
import { MovieDetail } from '../screens/MovieDetail';
import { ShowDetail } from '../screens/ShowDetail';
import { Player } from '../screens/Player';
import { Search } from '../screens/Search';
import { Favorites } from '../screens/Favorites';
import { Settings } from '../screens/Settings';
import { PlaylistForm } from '../screens/PlaylistForm';
import { SyncScreen, Welcome } from '../screens/Onboarding';

function renderRoute(r: Route): JSX.Element {
  switch (r.name) {
    case 'home': return <Home />;
    case 'live': return <Live />;
    case 'movies': return <Browse kind="movie" />;
    case 'series': return <Browse kind="series" />;
    case 'search': return <Search />;
    case 'favorites': return <Favorites />;
    case 'settings': return <Settings />;
    case 'movie': return <MovieDetail id={r.id} />;
    case 'show': return <ShowDetail id={r.id} />;
    case 'player': return <Player media={r.media} />;
    case 'welcome': return <Welcome />;
    case 'sync': return <SyncScreen />;
    case 'playlistForm': return <PlaylistForm id={r.id} />;
  }
}

/** Em desenvolvimento, `./scripts/tv.sh --seed` injeta a lista do .env.local para não digitar na TV. */
function seedPlaylist() {
  const env = import.meta.env;
  if (activePlaylist() || !env.VITE_SEED_HOST) return;
  upsertPlaylist({ id: newId(), name: env.VITE_SEED_NAME || 'Lista', type: 'xtream', host: env.VITE_SEED_HOST, username: env.VITE_SEED_USER, password: env.VITE_SEED_PASS });
}

export function App() {
  const [booted, setBooted] = createSignal(false);
  const zones = new Map<Route, Zone>();
  let lastBack = 0;
  let lastArrow = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    const el = document.activeElement as HTMLElement | null;
    if (el && el.tagName === 'INPUT') {
      // teclado nativo da TV aberto: OK/Concluir/Cancelar/Voltar fecham e devolvem o controle
      if ([13, 65376, 65385, 10009, 27].indexOf(e.keyCode) !== -1) {
        el.blur();
        e.preventDefault();
      }
      return;
    }
    const k = keyName(e);
    if (!k) return;
    e.preventDefault();
    const arrow = k === 'up' || k === 'down' || k === 'left' || k === 'right';
    if (arrow && e.repeat) {
      // segurar a seta não pode atropelar a renderização da TV
      const now = Date.now();
      if (now - lastArrow < 70) return;
      lastArrow = now;
    }
    if (dispatchKey(k)) return;
    if (k !== 'back') return;
    // seção: conteúdo → menu → Início → sair
    if (isSection(top()) && !isSidebarActive() && focusSidebar()) return;
    if (back()) return;
    if (top().name !== 'home' && isSection(top())) return goSection('home');
    if (Date.now() - lastBack < 2000) return exitApp();
    lastBack = Date.now();
    toast(t('toast.exit'));
  };

  // App foi para segundo plano (botão Home, outro app): fecha o vídeo e libera a conexão.
  const onVisibility = () => {
    if (!document.hidden) return;
    stopPreview();
    if (top().name === 'player') back();
    player.stop();
  };

  onMount(async () => {
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', onVisibility);
    registerTizenKeys();
    seedPlaylist();
    if (!activePlaylist()) reset({ name: 'welcome' });
    else {
      const hasData = await openActive().catch((err) => {
        console.error('abrir lista falhou', err);
        return false;
      });
      reset({ name: hasData ? 'home' : 'sync' });
    }
    setBooted(true);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  // Trocou de tela: o foco vai para a tela do topo (onde ela estava, se já existia).
  createEffect(
    on(stack, () => {
      clearFocus();
      const r = top();
      document.body.classList.toggle('is-playing', r.name === 'player');
      queueMicrotask(() => {
        const z = zones.get(r);
        if (z) focusZone(z);
      });
    }),
  );

  const showSidebar = () => isSection(top());

  return (
    <Show when={booted()} fallback={<Splash />}>
      <VideoLayer />
      <Sidebar enabled={showSidebar} />
      <FocusZone axis="col" class="screens" classList={{ 'screens--rail': showSidebar() }}>
        <For each={stack()}>
          {(r, i) => {
            const isTop = () => i() === stack().length - 1;
            onCleanup(() => zones.delete(r));
            return (
              <FocusZone axis="col" enabled={isTop} ref={(z) => zones.set(r, z)} class="screen" classList={{ hidden: !isTop() }}>
                {renderRoute(r)}
              </FocusZone>
            );
          }}
        </For>
      </FocusZone>
      <Toast />
    </Show>
  );
}

function Splash() {
  return (
    <div class="fill" style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center' }}>
      <Spinner size={64} />
    </div>
  );
}
