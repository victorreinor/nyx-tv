// Início: destaque (continuar/novidade) + fileiras. Rola na vertical para a fileira focada.
import { createEffect, createMemo, createResource, createSignal, For, on, Show } from 'solid-js';
import { call } from '../data/client';
import type { CardItem, ChannelRow, HomeData } from '../data/types';
import { active, type ListHandle } from '../app/focus';
import { fmtTime, t } from '../app/i18n';
import { openItem, playChannel, resumeItem } from '../app/play';
import { top } from '../app/router';
import { activePlaylist } from '../app/settings';
import { dataVersion } from '../app/state';
import { CHANNEL, ChannelCard, POSTER, PosterCard, WIDE, WideCard } from '../ui/cards';
import { type Action, ActionRow } from '../ui/controls';
import { Img, ProgressBar } from '../ui/primitives';
import { Rail } from '../ui/Rail';
import { useClock } from '../ui/useClock';

type SectionKind = 'continue' | 'live' | 'movies' | 'series';
const HEIGHT: Record<SectionKind, number> = { continue: 370, live: 216, movies: 472, series: 472 };
const RAILS_TOP = 640;

export function continueLabel(it: CardItem): string {
  if (!it.resume) return it.sub || '';
  const ep = it.resume.season ? t('common.seasonEp', { s: it.resume.season, e: it.resume.episode || 1 }) + ' · ' : '';
  const left = it.progress && it.progress > 0 && it.sub ? it.sub.split('·').pop()!.trim() : '';
  return ep + (left ? t('common.left', { t: left }) : '');
}

export function Home() {
  const isTop = () => top().name === 'home';
  const [data, setData] = createSignal<HomeData | null>(null);
  createEffect(on([dataVersion, isTop], ([, visible]) => visible && call('home').then(setData)));

  const handles: Partial<Record<string, ListHandle>> = {};

  const sections = createMemo(() => {
    const d = data();
    if (!d) return [] as SectionKind[];
    const out: SectionKind[] = [];
    if (d.continueItems.length) out.push('continue');
    if (d.favChannels.length) out.push('live');
    if (d.recentMovies.length) out.push('movies');
    if (d.recentSeries.length) out.push('series');
    return out;
  });

  const offset = createMemo(() => {
    active(); // recalcula a cada troca de foco (os handles chegam depois do primeiro cálculo)
    const list = sections();
    const i = list.findIndex((k) => handles[k] && handles[k]!.isActive());
    if (i <= 0) return 0;
    let y = RAILS_TOP;
    for (let k = 0; k < i; k++) y += HEIGHT[list[k]];
    return y - 150;
  });

  const hero = () => (data() ? data()!.hero : null);
  const [heroInfo] = createResource(
    () => (hero() && hero()!.kind === 'movie' ? Number(hero()!.id) : null),
    (id) => call('movieInfo', id),
  );
  const heroImage = () => {
    const h = hero();
    if (!h) return '';
    if (h.backdrop) return h.backdrop;
    const info = heroInfo();
    return (info && info.backdrop) || h.image;
  };

  const heroActions = (): Action[] => {
    const h = hero();
    if (!h) return [];
    if (h.resume) {
      return [
        { label: h.kind === 'series' && h.resume.season ? `${t('common.resume')} ${t('common.seasonEp', { s: h.resume.season, e: h.resume.episode || 1 })}` : t('common.resume'), icon: 'play', variant: 'primary', onSelect: () => resumeItem(h) },
        { label: h.kind === 'series' ? t('home.episodes') : t('home.details'), onSelect: () => openItem(h) },
      ];
    }
    return [
      { label: h.kind === 'series' ? t('home.episodes') : t('common.play'), icon: 'play', variant: 'primary', onSelect: () => openItem(h) },
    ];
  };

  const clock = useClock();

  return (
    <div class="home">
      <Show when={hero()}>
        <div class="home__backdrop" classList={{ 'is-away': offset() > 0 }}>
          <Img class="home__backdrop-img" src={heroImage()} alt="" />
          <div class="home__scrim" />
        </div>
      </Show>
      <header class="home__header row g24">
        <span class="c-2">{activePlaylist() ? activePlaylist()!.name : ''}</span>
        <span class="t-card">{fmtTime(clock() / 1000)}</span>
      </header>

      <div class="home__content" style={{ transform: `translate3d(0,${-offset()}px,0)` }}>
        <Show when={hero()}>
          <section class="home__hero stack g20" classList={{ 'is-away': offset() > 0 }}>
            <span class="t-micro c-ring">{hero()!.resume ? t('home.heroContinue') : t('home.heroNew')}</span>
            <h1 class="t-hero clamp-2">{hero()!.title}</h1>
            <p class="t-body c-2">{hero()!.resume ? continueLabel(hero()!) : heroInfoPlot(heroInfo(), hero()!)}</p>
            <Show when={hero()!.progress}>
              <div style={{ width: '480px' }}>
                <ProgressBar value={hero()!.progress || 0} />
              </div>
            </Show>
            <ActionRow actions={heroActions} class="home__actions" />
          </section>
        </Show>

        <div class="home__rails stack" style={{ 'margin-top': hero() ? '0' : `${RAILS_TOP}px` }}>
          <For each={sections()}>
            {(kind) => (
              <div style={{ height: `${HEIGHT[kind]}px` }}>
                <HomeRail kind={kind} data={data()!} handle={(h) => (handles[kind] = h)} />
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

function heroInfoPlot(info: { plot: string; duration: number } | null | undefined, item: CardItem): string {
  if (info && info.plot) return info.plot;
  return item.sub || '';
}

function HomeRail(props: { kind: SectionKind; data: HomeData; handle: (h: ListHandle) => void }) {
  if (props.kind === 'continue') {
    return (
      <Rail
        title={t('home.continue')}
        items={() => props.data.continueItems}
        itemWidth={WIDE.w}
        gap={WIDE.gap}
        height={WIDE.h + 80}
        handle={props.handle}
        onSelect={(it) => resumeItem(it)}
        render={(it, f) => <WideCard item={() => ({ ...it(), sub: continueLabel(it()) })} focused={f} />}
      />
    );
  }
  if (props.kind === 'live') {
    return (
      <Rail<ChannelRow>
        title={t('home.favLive')}
        items={() => props.data.favChannels}
        itemWidth={CHANNEL.w}
        gap={CHANNEL.gap}
        height={CHANNEL.h + 20}
        handle={props.handle}
        onSelect={(row) => playChannel(row.id, row.fav ? 'fav' : 'recent')}
        render={(row, f) => <ChannelCard row={row} focused={f} />}
      />
    );
  }
  const items = () => (props.kind === 'movies' ? props.data.recentMovies : props.data.recentSeries);
  return (
    <Rail
      title={props.kind === 'movies' ? t('home.recentMovies') : t('home.recentSeries')}
      items={items}
      itemWidth={POSTER.w}
      gap={POSTER.gap}
      height={POSTER.h + 80}
      handle={props.handle}
      onSelect={(it) => openItem(it)}
      render={(it, f) => <PosterCard item={it} focused={f} />}
    />
  );
}
