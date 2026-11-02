// Topo das telas de detalhe: fundo, título, metadados e sinopse.
import { type JSX, Show } from 'solid-js';
import { Img } from '../ui/primitives';

export function DetailHero(props: { backdrop: string; eyebrow?: string; title: string; meta: string[]; plot?: string; children?: JSX.Element }) {
  return (
    <>
      <div class="detail__backdrop">
        <Img class="detail__backdrop-img" src={props.backdrop} alt="" />
        <div class="detail__scrim" />
      </div>
      <section class="detail__hero stack g16">
        <Show when={props.eyebrow}>
          <span class="t-caption c-3">{props.eyebrow}</span>
        </Show>
        <h1 class="t-hero clamp-2">{props.title}</h1>
        <div class="row g12 t-caption c-2">{props.meta.filter(Boolean).join('  ·  ')}</div>
        <Show when={props.plot}>
          <p class="t-caption c-2 clamp-3 detail__plot">{props.plot}</p>
        </Show>
        {props.children}
      </section>
    </>
  );
}
