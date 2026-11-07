import { createMemo, createResource, createSignal, Show } from 'solid-js';
import { call } from '../data/client';
import type { CardItem, Episode, Progress } from '../data/types';
import { active, FocusZone, type ListHandle } from '../app/focus';
import { fmtDuration, t } from '../app/i18n';
import { openItem, playEpisode } from '../app/play';
import { openYouTube } from '../app/youtube';
import { top } from '../app/router';
import { toast } from '../app/state';
import { displayTitle, tmdbImage } from '../data/normalize';
import { isStarted, WATCHED } from '../data/user';
import { CastCard, EPISODE, POSTER, PosterCard, WideCard } from '../ui/cards';
import { type Action, ActionRow, ChipRow } from '../ui/controls';
import { Rail } from '../ui/Rail';
import { Spinner } from '../ui/primitives';
import { DetailHero } from './DetailHero';
import { certLabel, realPlot } from './MovieDetail';

export function ShowDetail(props: { id: string }) {
  const seriesId = Number(props.id);
  const [info] = createResource(() => call('seriesInfo', seriesId));
  // TMDB só complementa (sinopse, fundo, elenco, episódios, semelhantes); null = segue com o provedor
  const [tm] = createResource(() => call('tmdbSeriesView', seriesId));
  call('markSeriesSeen', seriesId);
  const [progress] = createResource(
    () => top().name === 'show' && props.id,
    () => call('seriesProgress', seriesId),
  );
  const [fav, setFav] = createSignal(false);
  call('isFav', 'series', props.id).then(setFav);
  const [season, setSeason] = createSignal<number | null>(null);
  const [episodes, setEpisodesHandle] = createSignal<ListHandle>();

  const byEpisode = createMemo(() => {
    const map = new Map<string, Progress>();
    (progress() || []).forEach((p) => map.set(p.id, p));
    return map;
  });

  /** Onde continuar: último episódio mexido (ou o seguinte, se terminou). */
  const resume = createMemo(() => {
    const i = info();
    const last = (progress() || [])[0];
    if (!i || !last) return null;
    const pct = last.duration ? last.position / last.duration : 0;
    if (pct < WATCHED) return { episodeId: last.id, position: last.position, season: last.season || 1, episode: last.episode || 1, left: last.duration - last.position };
    if (last.next) return { episodeId: last.next.id, position: 0, season: last.next.season, episode: last.next.episode, left: 0 };
    return null;
  });

  const currentSeason = () => {
    if (season() !== null) return season()!;
    const r = resume();
    if (r) return r.season;
    const i = info();
    return i && i.seasons[0] ? i.seasons[0].season : 1;
  };

  const seasonEpisodes = (): Episode[] => {
    const i = info();
    const s = i ? i.seasons.find((x) => x.season === currentSeason()) : undefined;
    return s ? s.episodes : [];
  };

  // nomes/imagens/resumos dos episódios da temporada atual (TMDB), se houver
  const [tmEpisodes] = createResource(
    () => (tm() ? `${tm()!.id}:${currentSeason()}` : null),
    (key) => {
      const [tv, se] = key.split(':').map(Number);
      return call('tmdbSeasonView', tv, se);
    },
  );
  const cards = createMemo<CardItem[]>(() =>
    seasonEpisodes().map((e) => {
      const p = byEpisode().get(e.id);
      const extra = (tmEpisodes() || []).find((x) => x.episode === e.episode);
      const providerTitle = e.title.replace(/^.*?S\d+\s*E\d+\s*[-–]?\s*/i, '');
      // título genérico do provedor ("Capítulo 3", vazio) dá lugar ao do TMDB
      const title = extra && extra.name && (!providerTitle || /^(cap[ií]tulo|epis[oó]dio|episode|ep\.?)\s*\d+$/i.test(providerTitle)) ? extra.name : providerTitle;
      const pct = p && p.duration ? p.position / p.duration : 0;
      const watched = pct >= WATCHED;
      return {
        kind: 'series',
        id: e.id,
        title: `E${e.episode} · ${title || t('detail.episode', { n: e.episode })}`,
        image: e.image || (extra && extra.still) || (info() ? tmdbImage(info()!.series.backdrop || info()!.series.poster, 'w780') : ''),
        sub: watched ? t('detail.watched') : p && isStarted(p) ? t('common.left', { t: fmtDuration(p.duration - p.position) }) : e.duration ? fmtDuration(e.duration) : '',
        progress: p && isStarted(p) ? pct : undefined,
        resume: { position: watched ? 0 : p ? p.position : 0 },
      } as CardItem;
    }),
  );

  const play = (episodeId: string, position: number) => {
    const i = info();
    if (i) playEpisode(i, episodeId, position);
  };

  const actions = (): Action[] => {
    const i = info();
    if (!i) return [];
    const r = resume();
    const first = i.seasons[0] && i.seasons[0].episodes[0];
    const list: Action[] = [];
    if (r) {
      const ep = t('common.seasonEp', { s: r.season, e: r.episode });
      list.push({
        label: r.left > 60 ? t('detail.continueEp', { ep, t: fmtDuration(r.left) }) : t('detail.startEp', { ep }),
        icon: 'play',
        variant: 'primary',
        onSelect: () => play(r.episodeId, r.position),
      });
    } else if (first) {
      list.push({ label: t('detail.startEp', { ep: t('common.seasonEp', { s: first.season, e: first.episode }) }), icon: 'play', variant: 'primary', onSelect: () => play(first.id, 0) });
    }
    if (tm() && tm()!.trailer) list.push({ label: t('detail.trailer'), icon: 'movies', onSelect: () => openYouTube(tm()!.trailer).then((ok) => ok || toast(t('tmdb.trailerFail'))) });
    list.push({
      label: fav() ? t('common.favorited') : t('common.favorite'),
      icon: 'favorites',
      onSelect: () =>
        call('toggleFav', 'series', props.id).then((on) => {
          setFav(on);
          toast(on ? t('toast.favAdded') : t('toast.favRemoved'));
        }),
    });
    return list;
  };

  // fileiras abaixo dos episódios (elenco, semelhantes): rola até a focada
  const handles: Record<string, ListHandle | undefined> = {};
  const offset = createMemo(() => {
    active();
    if (handles.similar && handles.similar.isActive()) return handles.cast ? 640 : 340;
    if (handles.cast && handles.cast.isActive()) return 340;
    return 0;
  });

  const seasonChips = () => (info() ? info()!.seasons.map((s) => ({ id: String(s.season), label: t('common.season', { n: s.season }), count: s.episodes.length })) : []);

  return (
    <div class="detail">
      <Show when={info()} fallback={<div class="fill center"><Spinner size={64} /></div>}>
        <div class="detail__scroll" style={{ transform: `translate3d(0,${-offset()}px,0)` }}>
        <DetailHero
          backdrop={tmdbImage(info()!.series.backdrop, 'w1280') || (tm() ? tm()!.backdrop : '') || tmdbImage(info()!.series.poster, 'w780')}
          title={displayTitle(info()!.series.name)}
          meta={[
            info()!.series.year ? String(info()!.series.year) : '',
            info()!.seasons.length === 1 ? t('detail.oneSeason') : t('detail.seasons', { n: info()!.seasons.length }),
            info()!.series.genre || (tm() ? tm()!.genres.slice(0, 3).join(', ') : ''),
            tm() ? certLabel(tm()!.certification) : '',
            tm() && tm()!.rating ? `★ ${tm()!.rating.toFixed(1)}` : info()!.series.rating ? `★ ${(info()!.series.rating * 2).toFixed(1)}` : '',
          ]}
          plot={realPlot(info()!.series.plot) || (tm() ? tm()!.overview : '')}
        >
          <FocusZone axis="row" autofocus>
            <ActionRow actions={actions} class="detail__actions" />
          </FocusZone>
        </DetailHero>
        <FocusZone axis="col" class="detail__episodes stack g24">
          <Show when={info()!.seasons.length > 1}>
            <ChipRow
              items={seasonChips}
              selected={() => String(currentSeason())}
              onSelect={(id) => {
                setSeason(Number(id));
                const h = episodes();
                if (h) h.setIndex(0);
              }}
            />
          </Show>
          <Rail
            items={cards}
            itemWidth={EPISODE.w}
            gap={EPISODE.gap}
            height={EPISODE.h + 80}
            visible={4}
            handle={setEpisodesHandle}
            onSelect={(c) => play(c.id, c.resume ? c.resume.position : 0)}
            render={(c, f) => <WideCard item={c} focused={f} size={EPISODE} tag={resume() && resume()!.episodeId === c().id ? t('common.resume') : undefined} />}
          />
          <Show when={tm() && tm()!.cast.length}>
            <Rail
              title={t('detail.castTitle')}
              items={() => tm()!.cast}
              itemWidth={180}
              gap={24}
              height={250}
              handle={(h) => (handles.cast = h)}
              render={(c, f) => <CastCard person={c} focused={f} />}
            />
          </Show>
          <Show when={tm() && tm()!.similar.length}>
            <Rail
              title={t('detail.similar')}
              items={() => tm()!.similar}
              itemWidth={POSTER.w}
              gap={POSTER.gap}
              height={POSTER.h + 72}
              handle={(h) => (handles.similar = h)}
              onSelect={(it) => openItem(it)}
              render={(it, f) => <PosterCard item={it} focused={f} />}
            />
          </Show>
        </FocusZone>
        </div>
      </Show>
    </div>
  );
}
