// Filmes e Séries: categorias em fileira + grade virtualizada paginada por cursor.
import { createEffect, createMemo, createResource, createSignal, on } from 'solid-js';
import { call } from '../data/client';
import type { CardItem, SortKey } from '../data/types';
import { FocusZone, type ListHandle } from '../app/focus';
import { type MessageKey, t } from '../app/i18n';
import { openItem } from '../app/play';
import { usePaged } from '../app/paged';
import { dataVersion, toast } from '../app/state';
import { POSTER, PosterCard } from '../ui/cards';
import { ChipRow, type ChipItem } from '../ui/controls';
import { ColorKeys } from '../ui/primitives';
import { VGrid } from '../ui/VGrid';

const SORTS: SortKey[] = ['added', 'name', 'rating'];
const COLS = 7;

export function Browse(props: { kind: 'movie' | 'series' }) {
  const [category, setCategory] = createSignal('all');
  const [sort, setSort] = createSignal<SortKey>('added');
  const [grid, setGrid] = createSignal<ListHandle>();
  const [chipsHandle, setChipsHandle] = createSignal<ListHandle>();
  const [cats] = createResource(dataVersion, () => call('categories', props.kind));

  const chips = createMemo<ChipItem[]>(() => [
    { id: 'all', label: t('common.all') },
    { id: 'fav', label: t('nav.favorites') },
    ...(cats() || []).map((c) => ({ id: c.id, label: c.name, count: c.count })),
  ]);

  const page = usePaged(
    (cursor) => call('page', props.kind, category(), sort(), cursor, 70),
    () => [category(), sort(), dataVersion()],
  );

  // Ao abrir, o foco vai para os pôsteres (não para as categorias).
  createEffect(
    on(page.loaded, (loaded) => {
      const c = chipsHandle();
      const g = grid();
      if (loaded && g && c && c.isActive() && page.items().length) g.focus(0);
    }),
  );

  const onKey = (k: string, item?: CardItem): boolean => {
    // voltar na grade → categorias (de lá, voltar vai para o menu)
    if (k === 'back' && item) {
      const c = chipsHandle();
      if (c) c.focus(Math.max(0, chips().findIndex((x) => x.id === category())));
      return true;
    }
    if (k === 'red') {
      setSort(SORTS[(SORTS.indexOf(sort()) + 1) % SORTS.length]);
      toast(t('sort.label', { s: t(('sort.' + sort()) as MessageKey) }));
      return true;
    }
    if (k === 'blue' && item) {
      call('toggleFav', props.kind, item.id).then((on) => {
        toast(on ? t('toast.favAdded') : t('toast.favRemoved'));
        if (category() === 'fav') page.reload();
      });
      return true;
    }
    return false;
  };

  return (
    <div class="browse">
      <header class="browse__header row g24">
        <h1 class="t-title">{props.kind === 'movie' ? t('nav.movies') : t('nav.series')}</h1>
        <span class="c-3 t-caption">{page.loaded() ? t('common.items', { n: page.total().toLocaleString() }) : ''}</span>
        <span class="browse__sort">
          <ColorKeys keys={[{ color: 'red', label: t('sort.label', { s: t(('sort.' + sort()) as MessageKey) }) }, { color: 'blue', label: t('common.favorite') }]} />
        </span>
      </header>
      <FocusZone axis="col" class="stack g24">
        <ChipRow
          items={chips}
          selected={category}
          handle={setChipsHandle}
          onSelect={(id) => {
            setCategory(id);
            const g = grid();
            if (g) g.setIndex(0);
          }}
          onKey={(k) => onKey(k)}
        />
        <VGrid<CardItem>
          items={page.items}
          cols={COLS}
          cellW={POSTER.w}
          cellH={POSTER.h + 76}
          gapX={POSTER.gap}
          gapY={36}
          height={760}
          handle={setGrid}
          onEnd={page.more}
          onSelect={(it) => openItem(it)}
          onKey={(k, it) => onKey(k, it)}
          render={(it, f) => <PosterCard item={it} focused={f} />}
        />
      </FocusZone>
      <EmptyState show={() => page.loaded() && !page.items().length} />
    </div>
  );
}

export function EmptyState(props: { show: () => boolean; text?: string }) {
  return <div class="empty" classList={{ hidden: !props.show() }}>{props.text || t('common.empty')}</div>;
}
