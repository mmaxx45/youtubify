// One app-wide context menu (Spotify shows a single menu at the pointer).

import { shallowRef } from "vue";

export interface MenuItem {
  label: string;
  icon?: string;
  // Shown as a check / green text, e.g. a playlist that already has the song
  checked?: boolean;
  disabled?: boolean;
  action?: () => void;
  // Opens a flyout; loaded lazily on hover (e.g. the user's playlists)
  submenu?: () => MenuEntry[] | Promise<MenuEntry[]>;
  // Submenus can offer a filter box like Spotify's "Find a playlist"
  searchable?: boolean;
}

export type MenuEntry = MenuItem | "divider";

export const menu = shallowRef<{ x: number; y: number; items: MenuEntry[] } | null>(null);

export function openMenu(event: MouseEvent, items: MenuEntry[]) {
  event.preventDefault();
  event.stopPropagation();
  menu.value = { x: event.clientX, y: event.clientY, items };
}

/** Open below/left of a "…" button instead of at the pointer. */
export function openMenuAt(el: HTMLElement, items: MenuEntry[]) {
  const r = el.getBoundingClientRect();
  menu.value = { x: r.left, y: r.bottom + 4, items };
}

export const closeMenu = (): void => {
  menu.value = null;
};
