// Ícones de traço (24×24). Um único <path> por ícone: barato de renderizar na TV.
const PATHS = {
  search: 'M18 11a7 7 0 1 1-14 0a7 7 0 1 1 14 0z M21 21l-4.3-4.3',
  home: 'M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z',
  live: 'M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M8 3l4 3 4-3',
  movies: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4',
  series: 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5',
  favorites: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  settings: 'M4 6h10M4 12h4M12 12h8M4 18h12 M19 6a2 2 0 1 1-4 0a2 2 0 1 1 4 0z M12 12a2 2 0 1 1-4 0a2 2 0 1 1 4 0z M20 18a2 2 0 1 1-4 0a2 2 0 1 1 4 0z',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7z M14 4h3v16h-3z',
  check: 'M5 12l5 5 9-10',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  lock: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z M8 11V8a4 4 0 0 1 8 0v3',
  globe: 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  alert: 'M12 8v5M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  info: 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0z M12 11v6 M12 7.5h.01',
  rewind: 'M11 6l-8 6 8 6z M21 6l-8 6 8 6z',
  forward: 'M13 6l8 6-8 6z M3 6l8 6-8 6z',
  layers: 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5',
  storage: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  tv: 'M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M8 3l4 3 4-3',
} as const;

export type IconName = keyof typeof PATHS;

const FILLED: Partial<Record<IconName, true>> = { play: true, pause: true, rewind: true, forward: true };

export function Icon(props: { name: IconName; size?: number; color?: string; fill?: boolean; class?: string }) {
  const size = () => props.size || 28;
  const filled = () => props.fill || FILLED[props.name];
  return (
    <svg
      class={props.class}
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill={filled() ? props.color || 'currentColor' : 'none'}
      stroke={filled() ? 'none' : props.color || 'currentColor'}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[props.name]} />
    </svg>
  );
}

/** Logo: lua crescente com uma estrela. */
export function Logo(props: { size?: number }) {
  return (
    <svg width={props.size || 48} height={props.size || 48} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z" fill="var(--accent)" />
      <circle cx="18" cy="5" r="1.2" fill="var(--t1)" />
    </svg>
  );
}
