// Busca: teclado na tela à esquerda; à direita, ABAS com a contagem (Filmes · Séries · Canais)
// e a grade da aba escolhida. Nada fica escondido. Resultado a cada tecla (debounce de 250 ms).
import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { latest } from '../data/client';
import type { CardItem, SearchResult } from '../data/types';
import { FocusZone, useList } from '../app/focus';
import { t } from '../app/i18n';
import { openItem } from '../app/play';
import { setSetting, settings } from '../app/settings';
import { PosterCard } from '../ui/cards';
import { ChipRow } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Keyboard } from '../ui/Keyboard';
import { Img, Spinner } from '../ui/primitives';

const search = latest('search');
/** Resultados por aba. Ao bater no limite, a aba mostra "60+". */
const LIMIT = 60;

export function Search() {
  const [q, setQ] = createSignal('');
  const [res, setRes] = createSignal<SearchResult | null>(null);
  /** Entre a tecla e o resultado: mostra "Buscando…" (debounce de 250 ms + busca no worker). */
  const [searching, setSearching] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  createEffect(
    on(q, (value) => {
      clearTimeout(timer);
      if (!value.trim()) {
        setSearching(false);
        return setRes(null);
      }
      setSearching(true);
      // espera a próxima tecla (debounce); respostas antigas são descartadas por latest()
      timer = setTimeout(
        () =>
          search(value, LIMIT).then((r) => {
            if (!r) return; // já existe uma busca mais nova
            setRes(r);
            setSearching(false);
          }),
        250,
      );
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

  type TabId = 'movies' | 'series' | 'live';
  const [tab, setTab] = createSignal<TabId>('movies');
  const groups = () => {
    const r = res();
    if (!r) return [];
    return [
      { id: 'movies' as TabId, label: t('search.movies'), items: r.movies },
      { id: 'series' as TabId, label: t('search.series'), items: r.series },
      { id: 'live' as TabId, label: t('search.channels'), items: r.live },
    ].filter((g) => g.items.length);
  };
  // aba atual sem resultado na busca nova: vai para a primeira que tem
  createEffect(
    on(res, () => {
      const gs = groups();
      if (gs.length && !gs.some((g) => g.id === tab())) setTab(gs[0].id);
    }),
  );
  const current = () => groups().find((g) => g.id === tab()) || groups()[0];

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

      <main class="search__results" classList={{ 'is-searching': searching() }}>
        <Show when={searching() && !res()}>
          <div class="row g16 search__busy">
            <Spinner size={36} />
            <span class="t-body c-2">{t('search.searching')}</span>
          </div>
        </Show>
        <Show when={res()} fallback={<Show when={!searching()}><p class="c-3 t-body search__hint">{t('search.hint')}</p></Show>}>
          <div class="row g24 search__meta">
            <Show when={searching()} fallback={<span class="c-3 t-caption">{t('search.results', { n: res()!.total, ms: res()!.ms })}</span>}>
              <span class="row g12 c-2 t-caption">
                <Spinner size={22} />
                {t('search.searching')}
              </span>
            </Show>
          </div>
          <Show when={res()!.total} fallback={<p class="c-2 t-body search__hint">{t('search.noResults', { q: q() })}</p>}>
            <div class="search__viewport">
            <FocusZone axis="col" class="stack g24 search__groups">
              <ChipRow items={() => groups().map((g) => ({ id: g.id, label: g.label, count: g.items.length >= LIMIT ? `${LIMIT}+` : g.items.length }))} selected={tab} onSelect={(id) => setTab(id as TabId)} />
              <Show when={current()} keyed>
                {(g) => <ResultGrid items={g.items} live={g.id === 'live'} onOpen={open} />}
              </Show>
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

/** Resultados da aba em grade (até 60 itens: sem virtualização). O foco rola a área até o item. */
function ResultGrid(props: { items: CardItem[]; live: boolean; onOpen: (it: CardItem) => void }) {
  // 4 pôsteres (ou 3 canais) por linha cabem inteiros nos 1.008 px da área de resultados
  const cols = props.live ? 3 : 4;
  const list = useList({ axis: 'grid', cols: () => cols, count: () => props.items.length, onSelect: (i) => props.onOpen(props.items[i]) });
  return (
    <section class="search__grid">
      <div class="result-grid" classList={{ 'result-grid--live': props.live }} ref={list.ref}>
        <For each={props.items}>
          {(it, i) => (
            <div ref={(el) => createEffect(() => list.isFocused(i()) && el.scrollIntoView({ block: 'nearest' }))}>
              {props.live ? <ChannelPill item={() => it} focused={() => list.isFocused(i())} /> : <PosterCard item={() => it} focused={() => list.isFocused(i())} />}
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
