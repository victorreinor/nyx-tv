// Peças pequenas do design system. Todas são só visuais: o foco vem de quem as usa (useList).
import { createSignal, For, type JSX, Show } from 'solid-js';
import type { Quality } from '../data/types';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button(props: { label: string; icon?: IconName; variant?: ButtonVariant; focused?: boolean; class?: string }) {
  return (
    <div class={`btn btn--${props.variant || 'secondary'} ${props.class || ''}`} classList={{ 'is-focused': !!props.focused }}>
      <Show when={props.icon}>
        <Icon name={props.icon!} size={24} />
      </Show>
      <span>{props.label}</span>
    </div>
  );
}

export function Badge(props: { children: JSX.Element; tone?: 'default' | 'muted' | 'accent' | 'ok' | 'warn' | 'live' }) {
  return <span class={`badge badge--${props.tone || 'default'}`}>{props.children}</span>;
}

export function LiveBadge(props: { label: string }) {
  return (
    <span class="badge badge--live">
      <span class="live-dot" />
      {props.label}
    </span>
  );
}

const QUALITY_TONE: Record<Quality, 'accent' | 'default' | 'muted'> = { '4K': 'accent', FHD: 'default', HD: 'default', SD: 'muted', '': 'muted' };

export function QualityBadges(props: { qualities: Quality[] }) {
  return (
    <span class="row g8">
      <For each={props.qualities.filter((q) => !!q)}>{(q) => <Badge tone={QUALITY_TONE[q]}>{q}</Badge>}</For>
    </span>
  );
}

export function Chip(props: { label: string; count?: number | string; focused?: boolean; selected?: boolean }) {
  return (
    <div class="chip" classList={{ 'is-focused': !!props.focused, 'is-selected': !!props.selected }}>
      <span>{props.label}</span>
      <Show when={props.count !== undefined}>
        <span class="chip__count">{props.count}</span>
      </Show>
    </div>
  );
}

export function Toggle(props: { on: boolean }) {
  return (
    <span class="toggle" classList={{ 'is-on': props.on }}>
      <span class="toggle__knob" />
    </span>
  );
}

export function ProgressBar(props: { value: number; tone?: 'accent' | 'live' | 'muted'; height?: number }) {
  return (
    <div class="progress" style={{ height: `${props.height || 6}px` }}>
      <div class={`progress__bar progress__bar--${props.tone || 'accent'}`} style={{ transform: `scaleX(${Math.max(0, Math.min(1, props.value))})` }} />
    </div>
  );
}

export function Spinner(props: { size?: number }) {
  return <div class="spinner" style={{ width: `${props.size || 48}px`, height: `${props.size || 48}px` }} />;
}

/** Imagem com carregamento preguiçoso e plano B (monograma) quando falha. */
export function Img(props: { src: string; alt?: string; class?: string; fallback?: string }) {
  const [broken, setBroken] = createSignal(false);
  return (
    <Show when={props.src && !broken()} fallback={<div class={`img-fallback ${props.class || ''}`}>{monogram(props.fallback || props.alt || '')}</div>}>
      <img class={props.class} src={props.src} alt={props.alt || ''} loading="lazy" decoding="async" onError={() => setBroken(true)} />
    </Show>
  );
}

export function monogram(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  if (!words[0]) return '•';
  return (words.length > 1 && words[0].length <= 3 ? words[0] : words[0].slice(0, 3)).toUpperCase();
}

/** Legenda das teclas coloridas do controle. */
export function ColorKeys(props: { keys: { color: 'red' | 'green' | 'yellow' | 'blue'; label: string }[] }) {
  return (
    <div class="row g32 colorkeys">
      <For each={props.keys}>
        {(k) => (
          <span class="row g8">
            <span class={`colorkey colorkey--${k.color}`} />
            {k.label}
          </span>
        )}
      </For>
    </div>
  );
}
