import { createEffect, createSignal, on, Show } from 'solid-js';
import { call } from '../data/client';
import type { CardItem, ChannelRow } from '../data/types';
import { FocusZone } from '../app/focus';
import { t } from '../app/i18n';
import { openItem, playChannel } from '../app/play';
import { top } from '../app/router';
import { dataVersion } from '../app/state';
import { CHANNEL, ChannelCard, POSTER, PosterCard } from '../ui/cards';
import { Rail } from '../ui/Rail';
import { EmptyState } from './Browse';

export function Favorites() {
  const [channels, setChannels] = createSignal<ChannelRow[]>([]);
  const [movies, setMovies] = createSignal<CardItem[]>([]);
  const [series, setSeries] = createSignal<CardItem[]>([]);
  const [loaded, setLoaded] = createSignal(false);

  createEffect(
    on([dataVersion, () => top().name === 'favorites'], ([, visible]) => {
      if (!visible) return;
      const now = Date.now() / 1000;
      Promise.all([
        call('guide', 'fav', null, 60, now, now + 3600),
        call('page', 'movie', 'fav', 'added', null, 60),
        call('page', 'series', 'fav', 'added', null, 60),
      ]).then(([c, m, s]) => {
        setChannels(c.items);
        setMovies(m.items);
        setSeries(s.items);
        setLoaded(true);
      });
    }),
  );

  const empty = () => loaded() && !channels().length && !movies().length && !series().length;

  return (
    <div class="page">
      <h1 class="t-title page__title">{t('fav.title')}</h1>
      <FocusZone axis="col" class="stack g48">
        <Show when={channels().length}>
          <Rail<ChannelRow>
            title={t('search.channels')}
            items={channels}
            itemWidth={CHANNEL.w}
            gap={CHANNEL.gap}
            height={CHANNEL.h + 10}
            onSelect={(r) => playChannel(r.id, 'fav')}
            render={(r, f) => <ChannelCard row={r} focused={f} />}
          />
        </Show>
        <Show when={movies().length}>
          <Rail title={t('search.movies')} items={movies} itemWidth={POSTER.w} gap={POSTER.gap} height={POSTER.h + 72} onSelect={(it) => openItem(it)} render={(it, f) => <PosterCard item={it} focused={f} />} />
        </Show>
        <Show when={series().length}>
          <Rail title={t('search.series')} items={series} itemWidth={POSTER.w} gap={POSTER.gap} height={POSTER.h + 72} onSelect={(it) => openItem(it)} render={(it, f) => <PosterCard item={it} focused={f} />} />
        </Show>
      </FocusZone>
      <EmptyState show={empty} text={t('fav.empty')} />
    </div>
  );
}
