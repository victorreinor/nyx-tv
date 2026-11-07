// Smart Hub Preview do lado do app: monta as fileiras (previewFeed.ts) e entrega ao serviço do pacote
// (public/service/preview.js), que repassa para a TV. O clique num quadro abre (ou retoma) o app com o PAYLOAD.
// Fora da TV (sem `tizen`) não faz nada.
import { call } from '../data/client';
import { t } from './i18n';
import { playChannel, resumeItem } from './play';
import { buildPreviewFeed, parsePreviewPayload, type PreviewAction } from './previewFeed';
import { back, go, top } from './router';
import { activePlaylist } from './settings';

const SERVICE_ID = 'NyxTvApp01.preview';
/** Último JSON entregue: não chama o serviço à toa se nada mudou. */
const LAST_KEY = 'nyx.preview';

function tz(): any {
  return (window as any).tizen;
}

function lastSent(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/**
 * Atualiza as fileiras se mudaram. Não confie em `systeminfo.getCapability('…/web.service')`:
 * na UN50AU7700 ela diz falso e o serviço funciona.
 */
export async function pushPreview(): Promise<void> {
  const tizen = tz();
  if (!tizen || !tizen.application || !tizen.ApplicationControl || !activePlaylist()) return;
  const home = await call('home').catch(() => null);
  if (!home) return;
  const json = buildPreviewFeed(home, {
    continue: t('home.continue'),
    newEpisodes: t('home.newEpisodes'),
    favLive: t('home.favLive'),
    recentLive: t('home.recentLive'),
  });
  if (!json || json === lastSent()) return;
  try {
    const ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/pick', null, null, null, [
      new tizen.ApplicationControlData('caller', ['ForegroundApp']),
      new tizen.ApplicationControlData('preview', [json]),
    ]);
    tizen.application.launchAppControl(
      ctrl,
      SERVICE_ID,
      () => {
        try {
          localStorage.setItem(LAST_KEY, json);
        } catch {
          // sem storage: só manda de novo da próxima vez
        }
      },
      (e: Error) => console.warn('preview: serviço falhou', e && e.message),
    );
  } catch (e) {
    console.warn('preview: serviço falhou', e);
  }
}

/** Quadro que abriu (ou retomou) o app, lido do app-control atual. */
export function readPreviewAction(): PreviewAction | null {
  const tizen = tz();
  if (!tizen || !tizen.application) return null;
  try {
    const req = tizen.application.getCurrentApplication().getRequestedAppControl();
    const data: { key: string; value: string[] }[] = (req && req.appControl && req.appControl.data) || [];
    for (const d of data) if (d.key === 'PAYLOAD' && d.value[0]) return parsePreviewPayload(d.value[0]);
  } catch {
    // app-control ilegível: abre normal
  }
  return null;
}

/** Abre o que o quadro pede, por cima da tela atual (Voltar volta para onde estava). */
export async function openPreviewAction(a: PreviewAction): Promise<void> {
  // sem lista ou ainda sincronizando a primeira vez: abre normal
  if (!activePlaylist() || top().name === 'welcome' || top().name === 'sync') return;
  // já estava num vídeo: fecha antes (libera a conexão)
  if (top().name === 'player') back();
  if (a.k === 'live') return playChannel(a.id);
  if (a.k === 'movie' || a.k === 'series') {
    // progresso de agora (pode ter mudado depois que o preview foi montado)
    const home = await call('home').catch(() => null);
    const card = home && home.continueItems.find((c) => c.kind === a.k && c.id === a.id);
    if (card) return resumeItem(card);
  }
  go(a.k === 'movie' ? { name: 'movie', id: a.id } : { name: 'show', id: a.id });
}
