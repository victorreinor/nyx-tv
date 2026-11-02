import { createResource, createSignal, Show } from 'solid-js';
import { call } from '../data/client';
import { FocusZone } from '../app/focus';
import { fmtDuration, t } from '../app/i18n';
import { playMovie } from '../app/play';
import { top } from '../app/router';
import { toast } from '../app/state';
import { displayTitle, tmdbImage } from '../data/normalize';
import { type Action, ActionRow } from '../ui/controls';
import { ProgressBar, Spinner } from '../ui/primitives';
import { DetailHero } from './DetailHero';
import { STARTED, WATCHED } from '../data/user';

export function MovieDetail(props: { id: string }) {
  const [info] = createResource(() => call('movieInfo', Number(props.id)));
  // recarrega o progresso ao voltar do player
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

  return (
    <div class="detail">
      <Show when={info()} fallback={<div class="fill center"><Spinner size={64} /></div>}>
        <DetailHero
          backdrop={tmdbImage(info()!.backdrop, 'w1280') || tmdbImage(info()!.movie.poster, 'w780')}
          title={displayTitle(info()!.movie.name)}
          meta={[
            info()!.movie.year ? String(info()!.movie.year) : '',
            info()!.duration ? fmtDuration(info()!.duration) : '',
            info()!.genre,
            info()!.movie.rating ? `★ ${info()!.movie.rating.toFixed(1)}` : '',
          ]}
          plot={info()!.plot}
        >
          <Show when={resumable()}>
            <div style={{ width: '480px' }}>
              <ProgressBar value={pct()} />
            </div>
          </Show>
          <FocusZone axis="row" autofocus>
            <ActionRow actions={actions} class="detail__actions" />
          </FocusZone>
          <Show when={info()!.cast || info()!.director}>
            <p class="t-caption c-3 clamp-2 detail__credits">
              {info()!.director ? `${t('detail.director')}: ${info()!.director}` : ''}
              {info()!.director && info()!.cast ? '  ·  ' : ''}
              {info()!.cast ? `${t('detail.cast')}: ${info()!.cast}` : ''}
            </p>
          </Show>
        </DetailHero>
      </Show>
    </div>
  );
}
