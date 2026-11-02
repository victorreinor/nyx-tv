// TV ao vivo: grade de programação. ◀ ▶ andam no tempo, ▲ ▼ trocam de canal, OK assiste.
import { createEffect, createMemo, createResource, createSignal, For, on, Show, untrack } from 'solid-js';
import { call } from '../data/client';
import type { ChannelRow, Program } from '../data/types';
import { FocusZone, type ListHandle } from '../app/focus';
import { fmtDay, fmtTime, t } from '../app/i18n';
import { playChannel } from '../app/play';
import { usePaged } from '../app/paged';
import { dataVersion, stats, toast } from '../app/state';
import { top } from '../app/router';
import { ChipRow, type ChipItem } from '../ui/controls';
import { Img, LiveBadge, QualityBadges, ColorKeys } from '../ui/primitives';
import { VGrid } from '../ui/VGrid';
import { useClock } from '../ui/useClock';

const CH_COL = 360;
const TIMELINE_W = 1280;
const SPAN = 2 * 3600; // janela visível: 2 h
const PX = TIMELINE_W / SPAN;
const STEP = 1800;
const ROW_H = 88;
const ROW_GAP = 8;

const floorHalfHour = (s: number) => Math.floor(s / STEP) * STEP;

function programAt(list: Program[], at: number): number {
  for (let i = 0; i < list.length; i++) if (list[i].start <= at && list[i].stop > at) return i;
  return -1;
}

export function Live() {
  const clock = useClock(30000);
  const nowSec = () => clock() / 1000;
  const [category, setCategory] = createSignal('all');
  const [cursor, setCursor] = createSignal(Date.now() / 1000);
  const [winStart, setWinStart] = createSignal(floorHalfHour(Date.now() / 1000));
  const [range, setRange] = createSignal({ from: Date.now() / 1000 - 3 * 3600, to: Date.now() / 1000 + 12 * 3600 });
  const [grid, setGrid] = createSignal<ListHandle>();
  const [chips, setChips] = createSignal<ListHandle>();

  const [cats] = createResource(dataVersion, () => call('categories', 'live'));
  const chipItems = createMemo<ChipItem[]>(() => [
    { id: 'all', label: t('common.all') },
    { id: 'fav', label: t('nav.favorites') },
    { id: 'recent', label: t('common.recent') },
    ...(cats() || []).map((c) => ({ id: c.id, label: c.name, count: c.count })),
  ]);

  const rows = usePaged(
    (c) => call('guide', category(), c, 40, range().from, range().to),
    () => [category(), range(), dataVersion()],
  );

  // Voltou do player para a grade: ela volta para "agora".
  const isTop = () => top().name === 'live';
  createEffect(on(isTop, (visible, was) => visible && was === false && untrack(goNow)));

  const focusedRow = () => {
    const g = grid();
    return g ? rows.items()[g.index()] : undefined;
  };
  const focusedProgram = (): Program | undefined => {
    const r = focusedRow();
    if (!r) return undefined;
    const i = programAt(r.programs, cursor());
    return i === -1 ? undefined : r.programs[i];
  };

  function moveCursor(to: number) {
    const now = nowSec();
    const st = stats();
    const max = st && st.epgUntil ? st.epgUntil - 60 : now + 7 * 86400;
    const next = Math.min(max, Math.max(now - 3 * 3600, to));
    setCursor(next);
    if (next < winStart()) setWinStart(floorHalfHour(next));
    else if (next >= winStart() + SPAN - STEP / 2) setWinStart(floorHalfHour(next) - STEP);
    // os programas carregados cobrem uma janela; saiu dela (para frente OU para trás), recarrega
    const r = range();
    if (next < r.from + 3600 || next > r.to - 3 * 3600) setRange({ from: next - 3 * 3600, to: next + 12 * 3600 });
  }

  function goNow() {
    moveCursor(nowSec());
    setWinStart(floorHalfHour(nowSec()));
  }

  function onGridKey(k: string, row: ChannelRow): boolean {
    if (k === 'back') {
      // longe do horário atual: o primeiro Voltar traz a grade para "agora"
      if (Math.abs(cursor() - nowSec()) > STEP || winStart() !== floorHalfHour(nowSec())) {
        goNow();
        return true;
      }
      const c = chips();
      if (c) c.focus(Math.max(0, chipItems().findIndex((x) => x.id === category())));
      return true;
    }
    if (k === 'left' || k === 'right') {
      const list = row.programs;
      const i = programAt(list, cursor());
      if (k === 'right') moveCursor(i !== -1 && list[i + 1] ? list[i + 1].start : cursor() + STEP);
      else moveCursor(i > 0 ? Math.max(list[i - 1].start, cursor() - 6 * 3600) : cursor() - STEP);
      return true;
    }
    if (k === 'red') {
      goNow();
      return true;
    }
    if (k === 'green') {
      const c = chips();
      if (c) c.focus(Math.max(0, chipItems().findIndex((x) => x.id === category())));
      return true;
    }
    if (k === 'blue') {
      call('toggleFav', 'live', row.id).then((on) => {
        toast(on ? t('toast.favAdded') : t('toast.favRemoved'));
        if (category() === 'fav') rows.reload();
      });
      return true;
    }
    return false;
  }

  const ticks = createMemo(() => [0, 1, 2, 3].map((i) => winStart() + i * STEP));
  const nowX = () => (nowSec() - winStart()) * PX;

  return (
    <div class="live">
      <section class="live__preview">
        <div class="stack g12 grow">
          <Show when={focusedRow()}>
            <div class="row g16">
              <Img class="channel-logo" src={focusedRow()!.logo} alt={focusedRow()!.name} />
              <span class="t-caption c-2" style={{ 'font-weight': 700 }}>
                {focusedRow()!.num < 99999 ? focusedRow()!.num + ' · ' : ''}
                {focusedRow()!.name}
              </span>
              <QualityBadges qualities={focusedRow()!.qualities} />
            </div>
            <h1 class="t-title clamp-2">{focusedProgram() ? focusedProgram()!.title : focusedRow()!.name}</h1>
            <Show when={focusedProgram()}>
              <p class="t-caption c-ring" style={{ 'font-weight': 700 }}>
                {fmtDay(focusedProgram()!.start)} · {fmtTime(focusedProgram()!.start)} – {fmtTime(focusedProgram()!.stop)}
              </p>
              <p class="t-caption c-2 clamp-2" style={{ 'max-width': '1040px' }}>
                {focusedProgram()!.desc}
              </p>
            </Show>
          </Show>
        </div>
        <div class="live__thumb">
          <Show when={focusedRow()}>
            <Img class="live__thumb-logo" src={focusedRow()!.logo} alt={focusedRow()!.name} />
          </Show>
          <Show when={focusedProgram() && focusedProgram()!.start <= nowSec()}>
            <span class="live__thumb-badge">
              <LiveBadge label={t('live.liveBadge')} />
            </span>
          </Show>
        </div>
      </section>

      <FocusZone axis="col" class="stack g20">
        <ChipRow
          items={chipItems}
          selected={category}
          handle={setChips}
          onSelect={(id) => {
            setCategory(id);
            const g = grid();
            if (g) g.setIndex(0);
          }}
          onKey={(k) => {
            const g = grid();
            if (k === 'down' && g && rows.items().length) {
              g.focus();
              return true;
            }
            return false;
          }}
        />

        <div class="guide">
          <div class="guide__ruler">
            <span class="guide__day t-micro c-3">{fmtDay(winStart())}</span>
            <div class="guide__ticks">
              <For each={ticks()}>{(tk) => <span class="guide__tick" style={{ left: `${(tk - winStart()) * PX}px` }}>{fmtTime(tk)}</span>}</For>
              <Show when={nowX() >= 0 && nowX() <= TIMELINE_W}>
                <span class="guide__now-label" style={{ left: `${nowX()}px` }}>
                  {fmtTime(nowSec())}
                </span>
              </Show>
            </div>
          </div>
          <div class="guide__rows">
            <Show when={nowX() >= 0 && nowX() <= TIMELINE_W}>
              <div class="guide__now-line" style={{ left: `${CH_COL + nowX()}px` }} />
            </Show>
            <VGrid<ChannelRow>
              items={rows.items}
              cols={1}
              cellW={CH_COL + TIMELINE_W}
              cellH={ROW_H}
              gapX={0}
              gapY={ROW_GAP}
              height={5 * (ROW_H + ROW_GAP) - ROW_GAP}
              handle={setGrid}
              onEnd={rows.more}
              onSelect={(r) => playChannel(r.id, category())}
              onKey={(k, r) => onGridKey(k, r)}
              render={(r, focused) => <GuideRow row={r} focused={focused} cursor={cursor} winStart={winStart} now={nowSec} />}
            />
          </div>
        </div>
      </FocusZone>

      <footer class="live__footer row g32">
        <ColorKeys
          keys={[
            { color: 'red', label: t('live.now') },
            { color: 'green', label: t('live.category') },
            { color: 'blue', label: t('live.fav') },
          ]}
        />
        <span class="c-3">{t('live.hintTime')}</span>
      </footer>
    </div>
  );
}

function GuideRow(props: { row: () => ChannelRow; focused: () => boolean; cursor: () => number; winStart: () => number; now: () => number }) {
  const cells = createMemo(() => {
    const ws = props.winStart();
    const we = ws + SPAN;
    return props.row()
      .programs.filter((p) => p.stop > ws && p.start < we)
      .map((p) => {
        const left = (Math.max(p.start, ws) - ws) * PX;
        const right = (Math.min(p.stop, we) - ws) * PX;
        return { p, left, width: Math.max(0, right - left - 6) };
      });
  });
  return (
    <div class="guide-row" classList={{ 'is-focused': props.focused() }}>
      <div class="guide-row__channel">
        <span class="guide-row__num">{props.row().num < 99999 ? props.row().num : ''}</span>
        <Img class="guide-row__logo" src={props.row().logo} alt={props.row().name} />
        <div class="stack g4" style={{ 'min-width': 0 }}>
          <span class="guide-row__name ellipsis">{props.row().name}</span>
          <span class="t-micro c-3 ellipsis">{props.row().qualities.filter(Boolean).join(' · ')}</span>
        </div>
        <Show when={props.row().fav}>
          <span class="guide-row__fav">★</span>
        </Show>
      </div>
      <div class="guide-row__timeline">
        <Show when={cells().length} fallback={<div class="guide-cell guide-cell--empty" style={{ left: '0px', width: `${TIMELINE_W - 6}px` }}>{t('live.noGuide')}</div>}>
          <For each={cells()}>
            {(c) => (
              <div
                class="guide-cell"
                classList={{
                  'is-live': c.p.start <= props.now() && c.p.stop > props.now(),
                  'is-past': c.p.stop <= props.now(),
                  'is-focused': props.focused() && c.p.start <= props.cursor() && c.p.stop > props.cursor(),
                }}
                style={{ left: `${c.left}px`, width: `${c.width}px` }}
              >
                <span class="guide-cell__title ellipsis">{c.p.title}</span>
                <span class="guide-cell__time">
                  {fmtTime(c.p.start)} – {fmtTime(c.p.stop)}
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
