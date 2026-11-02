// Cards. Recebem accessors para atualizar só a classe de foco (sem recriar DOM).
import { Show } from 'solid-js';
import type { CardItem, ChannelRow } from '../data/types';
import { fmtTime, t } from '../app/i18n';
import { Img, ProgressBar, QualityBadges } from './primitives';

export const POSTER = { w: 200, h: 300, gap: 28 };
export const WIDE = { w: 352, h: 198, gap: 24 };
export const EPISODE = { w: 400, h: 225, gap: 24 };
export const CHANNEL = { w: 352, h: 120, gap: 24 };

/** Selo da capa: "T2 E5" onde parou na série, ou "Visto". */
function posterTag(item: CardItem): string {
  if (item.newEpisode) return t('card.newEpisode');
  if (item.tag) {
    const [s, e] = item.tag.split('|');
    return t('common.seasonEp', { s, e });
  }
  return item.watched ? '✓ ' + t('detail.watched') : '';
}

export function PosterCard(props: { item: () => CardItem; focused: () => boolean }) {
  return (
    <div class="card card--poster" classList={{ 'is-focused': props.focused(), 'is-started': !!props.item().progress, 'is-watched': !!props.item().watched, 'is-new': !!props.item().newEpisode }}>
      <div class="card__frame">
        <Img class="card__img" src={props.item().image} alt={props.item().title} />
        <Show when={posterTag(props.item())}>
          <span class="card__tag card__tag--progress">{posterTag(props.item())}</span>
        </Show>
        <Show when={props.item().progress}>
          <div class="card__progress">
            <ProgressBar value={props.item().progress || 0} />
          </div>
        </Show>
      </div>
      <div class="card__title ellipsis">{props.item().title}</div>
      <Show when={props.item().sub}>
        <div class="card__sub ellipsis">{props.item().sub}</div>
      </Show>
    </div>
  );
}

export function WideCard(props: { item: () => CardItem; focused: () => boolean; size?: { w: number; h: number }; tag?: string }) {
  const size = () => props.size || WIDE;
  return (
    <div class="card card--wide" classList={{ 'is-focused': props.focused() }} style={{ width: `${size().w}px` }}>
      <div class="card__frame" style={{ width: `${size().w}px`, height: `${size().h}px` }}>
        <Img class="card__img" src={props.item().backdrop || props.item().image} alt={props.item().title} />
        <Show when={props.tag}>
          <span class="card__tag">{props.tag}</span>
        </Show>
        <Show when={props.item().progress !== undefined}>
          <div class="card__progress">
            <ProgressBar value={props.item().progress || 0} />
          </div>
        </Show>
      </div>
      <div class="card__title ellipsis">{props.item().title}</div>
      <Show when={props.item().sub}>
        <div class="card__sub ellipsis">{props.item().sub}</div>
      </Show>
    </div>
  );
}

/** Canal ao vivo com o programa de agora e a barra de andamento. */
export function ChannelCard(props: { row: () => ChannelRow; focused: () => boolean }) {
  const now = () => Date.now() / 1000;
  const cur = () => props.row().programs.find((p) => p.start <= now() && p.stop > now());
  const pct = () => {
    const p = cur();
    return p ? (now() - p.start) / (p.stop - p.start) : 0;
  };
  return (
    <div class="channel-card" classList={{ 'is-focused': props.focused() }}>
      <Img class="channel-logo" src={props.row().logo} alt={props.row().name} />
      <div class="stack g4 grow">
        <span class="t-card ellipsis" style={{ 'font-size': '22px' }}>
          {props.row().name}
        </span>
        <span class="t-caption c-2 ellipsis">{cur() ? cur()!.title : t('live.noGuide')}</span>
        <Show when={cur()}>
          <ProgressBar value={pct()} tone="live" height={4} />
        </Show>
      </div>
    </div>
  );
}

/** Linha de canal (lista/busca). */
export function ChannelLine(props: { row: () => ChannelRow; focused: () => boolean }) {
  const now = () => Date.now() / 1000;
  const cur = () => props.row().programs.find((p) => p.start <= now() && p.stop > now());
  return (
    <div class="channel-line" classList={{ 'is-focused': props.focused() }}>
      <span class="channel-line__num">{props.row().num < 99999 ? props.row().num : ''}</span>
      <Img class="channel-logo" src={props.row().logo} alt={props.row().name} />
      <div class="stack g4 grow">
        <span class="t-card ellipsis">{props.row().name}</span>
        <span class="t-caption c-2 ellipsis">{cur() ? `${t('live.now')}: ${cur()!.title} · ${fmtTime(cur()!.stop)}` : t('live.noGuide')}</span>
      </div>
      <QualityBadges qualities={props.row().qualities} />
    </div>
  );
}
