// Detalhe do filme: abre na hora com o provedor; o TMDB (se houver) só complementa:
// sinopse, gêneros, classificação, fundo, trailer, elenco com foto e "semelhantes que você tem".
import { createMemo, createResource, createSignal, Show } from 'solid-js';
import { call } from '../data/client';
import { displayTitle, tmdbImage } from '../data/normalize';
import { STARTED, WATCHED } from '../data/user';
import { active, FocusZone, type ListHandle } from '../app/focus';
import { fmtDuration, t } from '../app/i18n';
import { openItem, playMovie } from '../app/play';
import { top } from '../app/router';
import { toast } from '../app/state';
import { openYouTube } from '../app/youtube';
import { CastCard, POSTER, PosterCard } from '../ui/cards';
import { type Action, ActionRow } from '../ui/controls';
import { ProgressBar, Spinner } from '../ui/primitives';
import { Rail } from '../ui/Rail';
import { DetailHero } from './DetailHero';

/** Classificação indicativa do Brasil: "L" → "Livre", "12" → "12 anos". */
export function certLabel(cert: string): string {
  if (!cert) return '';
  return cert === 'L' ? t('detail.ageFree') : /^\d+$/.test(cert) ? t('detail.age', { n: cert }) : cert;
}

/** Sinopse "de verdade" do provedor (às vezes vem vazia ou "Sinopse não disponível"). */
export function realPlot(plot: string): string {
  const p = (plot || '').trim();
  return p.length > 25 && !/n[aã]o dispon[ií]vel|not available|no disponible/i.test(p) ? p : '';
}

export function MovieDetail(props: { id: string }) {
  const [info] = createResource(() => call('movieInfo', Number(props.id)));
  const [tm] = createResource(() => call('tmdbMovieView', Number(props.id)));
  const [progress] = createResource(
    () => top().name === 'movie' && props.id,
    () => call('getProgress', 'm:' + props.id),
  );
  const [fav, setFav] = createSignal(false);
  call('isFav', 'movie', props.id).then(setFav);

  const pct = () => {
    const p = progress();
    return p && p.duration ? p.position / p.duration : 0;
  };
  const resumable = () => pct() >= STARTED && pct() < WATCHED;
  const trailer = () => (tm() && tm()!.trailer) || (info() && info()!.trailer) || '';

  const actions = (): Action[] => {
    const i = info();
    if (!i) return [];
    const item = { id: props.id, title: displayTitle(i.movie.name), image: i.movie.poster };
    const list: Action[] = [];
    if (resumable()) {
      list.push({ label: `${t('common.resume')} · ${fmtDuration(progress()!.duration - progress()!.position)}`, icon: 'play', variant: 'primary', onSelect: () => playMovie(item, progress()!.position) });
      list.push({ label: t('common.fromStart'), onSelect: () => playMovie(item, 0) });
    } else {
      list.push({ label: t('common.play'), icon: 'play', variant: 'primary', onSelect: () => playMovie(item, 0) });
    }
    if (trailer()) list.push({ label: t('detail.trailer'), icon: 'movies', onSelect: () => openYouTube(trailer()).then((ok) => ok || toast(t('tmdb.trailerFail'))) });
    list.push({
      label: fav() ? t('common.favorited') : t('common.favorite'),
      icon: 'favorites',
      onSelect: () =>
        call('toggleFav', 'movie', props.id).then((on) => {
          setFav(on);
          toast(on ? t('toast.favAdded') : t('toast.favRemoved'));
        }),
    });
    return list;
  };

  const meta = () => {
    const i = info()!;
    const d = tm();
    return [
      i.movie.year ? String(i.movie.year) : '',
      i.duration ? fmtDuration(i.duration) : d && d.runtime ? fmtDuration(d.runtime * 60) : '',
      i.genre || (d ? d.genres.slice(0, 3).join(', ') : ''),
      d ? certLabel(d.certification) : '',
      d && d.rating ? `★ ${d.rating.toFixed(1)}` : i.movie.rating ? `★ ${(i.movie.rating * 2).toFixed(1)}` : '',
    ];
  };

  // fileiras abaixo (elenco, semelhantes): rola para a focada
  const handles: Record<string, ListHandle | undefined> = {};
  const offset = createMemo(() => {
    active();
    return handles.similar && handles.similar.isActive() && handles.cast ? 300 : 0;
  });

  return (
    <div class="detail">
      <Show when={info()} fallback={<div class="fill center"><Spinner size={64} /></div>}>
        <div class="detail__scroll" style={{ transform: `translate3d(0,${-offset()}px,0)` }}>
          <DetailHero
            backdrop={tmdbImage(info()!.backdrop, 'w1280') || (tm() ? tm()!.backdrop : '') || tmdbImage(info()!.movie.poster, 'w780')}
            title={displayTitle(info()!.movie.name)}
            meta={meta()}
            plot={realPlot(info()!.plot) || (tm() ? tm()!.overview : '')}
          >
            <Show when={resumable()}>
              <div style={{ width: '480px' }}>
                <ProgressBar value={pct()} />
              </div>
            </Show>
            <FocusZone axis="row" autofocus>
              <ActionRow actions={actions} class="detail__actions" />
            </FocusZone>
          </DetailHero>
          <FocusZone axis="col" class="detail__more stack g32">
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
