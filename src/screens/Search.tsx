// Busca: teclado na tela à esquerda, resultados em fileiras à direita. Resultado a cada tecla.
import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { latest } from '../data/client';
import type { CardItem, SearchResult } from '../data/types';
import { active, FocusZone, type ListHandle } from '../app/focus';
import { t } from '../app/i18n';
import { openItem } from '../app/play';
import { setSetting, settings } from '../app/settings';
import { POSTER, PosterCard } from '../ui/cards';
import { ChipRow } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Keyboard } from '../ui/Keyboard';
import { Img } from '../ui/primitives';
import { Rail } from '../ui/Rail';

const search = latest('search');

export function Search() {
  const [q, setQ] = createSignal('');
  const [res, setRes] = createSignal<SearchResult | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  createEffect(
    on(q, (value) => {
      clearTimeout(timer);
      if (!value.trim()) return setRes(null);
      // espera a próxima tecla por um instante; respostas antigas são descartadas
      timer = setTimeout(() => search(value, 30).then((r) => r && setRes(r)), 120);
    }),
  );

  const remember = () => {
    const v = q().trim();
    if (!v) return;
    setSetting('recentSearches', [v].concat(settings.recentSearches.filter((x) => x !== v)).slice(0, 8));
  };
  const open = (it: CardItem) => {
    remember();
    openItem(it);
  };

  const groups = () => {
    const r = res();
    if (!r) return [];
    return [
      { key: 'live', title: t('search.channels'), items: r.live },
      { key: 'movies', title: t('search.movies'), items: r.movies },
      { key: 'series', title: t('search.series'), items: r.series },
    ].filter((g) => g.items.length);
  };

  // rola os resultados para a fileira focada (a de séries fica abaixo da dobra)
  const handles: Record<string, ListHandle | undefined> = {};
  const HEIGHT: Record<string, number> = { live: 184, movies: 460, series: 460 };
  const offset = createMemo(() => {
    active();
    const list = groups();
    const i = list.findIndex((g) => handles[g.key] && handles[g.key]!.isActive());
    let y = 0;
    for (let k = 0; k < i; k++) y += HEIGHT[list[k].key];
    return i > 0 ? Math.max(0, y - 40) : 0;
  });


  return (
    <FocusZone axis="row" class="search">
      <aside class="search__panel stack g24">
        <span class="t-micro c-3">{t('search.label')}</span>
        <div class="search__input row g16">
          <Icon name="search" size={30} color="var(--t2)" />
          <span class="search__query ellipsis">{q()}</span>
          <span class="search__caret" />
        </div>
        <Keyboard value={q} onChange={setQ} autofocus exitRight={() => !!res() && res()!.total > 0} />
        <Show when={!q() && settings.recentSearches.length}>
          <div class="stack g12 search__recent">
            <span class="t-micro c-3">{t('search.recent')}</span>
            <ChipRow items={() => settings.recentSearches.map((s) => ({ id: s, label: s }))} selected={() => ''} onSelect={(s) => setQ(s)} />
          </div>
        </Show>
      </aside>

      <main class="search__results">
        <Show when={res()} fallback={<p class="c-3 t-body search__hint">{t('search.hint')}</p>}>
          <div class="row g24 search__meta">
            <span class="c-3 t-caption">{t('search.results', { n: res()!.total, ms: res()!.ms })}</span>
          </div>
          <Show when={res()!.total} fallback={<p class="c-2 t-body search__hint">{t('search.noResults', { q: q() })}</p>}>
            <div class="search__viewport">
            <FocusZone axis="col" class="stack g32 search__groups" style={{ transform: `translate3d(0,${-offset()}px,0)` }}>
              <For each={groups()}>
                {(g) => (
                  <Rail
                    title={g.title}
                    items={() => g.items}
                    itemWidth={g.key === 'live' ? 300 : POSTER.w}
                    gap={g.key === 'live' ? 16 : 24}
                    height={g.key === 'live' ? 96 : POSTER.h + 72}
                    visible={g.key === 'live' ? 3 : 5}
                    handle={(h) => (handles[g.key] = h)}
                    onSelect={open}
                    render={(it, f) => (g.key === 'live' ? <ChannelPill item={it} focused={f} /> : <PosterCard item={it} focused={f} />)}
                  />
                )}
              </For>
            </FocusZone>
            </div>
          </Show>
        </Show>
      </main>
    </FocusZone>
  );
}

function ChannelPill(props: { item: () => CardItem; focused: () => boolean }) {
  return (
    <div class="channel-pill" classList={{ 'is-focused': props.focused() }}>
      <Img class="channel-pill__logo" src={props.item().image} alt={props.item().title} />
      <div class="stack g4" style={{ 'min-width': 0 }}>
        <span class="t-card ellipsis" style={{ 'font-size': '21px' }}>
          {props.item().title}
        </span>
        <Show when={props.item().sub}>
          <span class="t-caption c-3 ellipsis" style={{ 'font-size': '17px' }}>
            {props.item().sub}
          </span>
        </Show>
      </div>
    </div>
  );
}
