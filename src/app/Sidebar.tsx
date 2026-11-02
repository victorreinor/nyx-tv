// Menu lateral: trilho de ícones que abre os nomes quando recebe o foco.
import { createEffect, For, on } from 'solid-js';
import { Icon, type IconName, Logo } from '../ui/Icon';
import { useList } from './focus';
import { type MessageKey, t } from './i18n';
import { goSection, isSection, type Section, SECTIONS, stack } from './router';

const ICONS: Record<Section, IconName> = {
  search: 'search',
  home: 'home',
  live: 'live',
  movies: 'movies',
  series: 'series',
  favorites: 'favorites',
  settings: 'settings',
};

export function Sidebar(props: { enabled: () => boolean }) {
  const current = (): Section => {
    const s = stack();
    for (let i = s.length - 1; i >= 0; i--) if (isSection(s[i])) return s[i].name as Section;
    return 'home';
  };
  const list = useList({
    axis: 'col',
    count: () => SECTIONS.length,
    enabled: props.enabled,
    initial: SECTIONS.indexOf('home'),
    onSelect: (i) => goSection(SECTIONS[i]),
  });
  // Ao entrar no menu, o foco começa na seção atual.
  createEffect(on(list.isActive, (a) => a && list.setIndex(SECTIONS.indexOf(current()))));

  return (
    <nav class="sidebar" classList={{ hidden: !props.enabled(), 'is-open': list.isActive() }} ref={list.ref}>
      <div class="sidebar__logo">
        <Logo size={48} />
        <span class="sidebar__brand">nyx</span>
      </div>
      <For each={SECTIONS}>
        {(s, i) => (
          <div
            class="sidebar__item"
            classList={{ 'is-current': current() === s, 'is-focused': list.isFocused(i()), 'sidebar__item--bottom': s === 'settings' }}
          >
            <span class="sidebar__icon">
              <Icon name={ICONS[s]} size={30} />
            </span>
            <span class="sidebar__label">{t(('nav.' + s) as MessageKey)}</span>
          </div>
        )}
      </For>
    </nav>
  );
}
