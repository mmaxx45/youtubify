// In-app navigation with Spotify-style back/forward history.

import { computed, ref } from "vue";
import type { BrowseTarget, SearchFilter } from "../ytm/models";

export type Route =
  | { name: "home"; chip?: string }
  // filter: one result type (Spotify's chips); none = the "All" overview
  | { name: "search"; query: string; filter?: SearchFilter }
  | { name: "collection"; id: string }
  | { name: "artist"; id: string }
  | { name: "category"; id: string; params?: string; title: string }
  // A shelf's "Show all" page: its YTM browse page if it has one, else the stashed shelf (state/shelves.ts)
  | { name: "shelf"; title: string; browseId?: string; params?: string; stash?: string }
  | { name: "lyrics" }
  | { name: "settings" };

const stack = ref<Route[]>([{ name: "home" }]);
const index = ref(0);

export const route = computed(() => stack.value[index.value]);
export const canGoBack = computed(() => index.value > 0);
export const canGoForward = computed(() => index.value < stack.value.length - 1);

const sameRoute = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b);

export function navigate(to: Route, replace = false) {
  if (sameRoute(to, route.value)) return;
  if (replace) {
    stack.value = [...stack.value.slice(0, index.value), to, ...stack.value.slice(index.value + 1)];
    return;
  }
  stack.value = [...stack.value.slice(0, index.value + 1), to];
  index.value = stack.value.length - 1;
}

export const back = () => canGoBack.value && index.value--;
export const forward = () => canGoForward.value && index.value++;

/** Route for a YTM browse target, or null if the UI has no page for it yet. */
export function routeFor(target?: BrowseTarget): Route | null {
  if (!target) return null;
  switch (target.pageType) {
    case "artist":
    case "user":
      return { name: "artist", id: target.browseId };
    case "album":
    case "playlist":
      return { name: "collection", id: target.browseId };
  }
  if (target.browseId.startsWith("VL") || target.browseId.startsWith("MPRE")) return { name: "collection", id: target.browseId };
  if (target.browseId.startsWith("UC")) return { name: "artist", id: target.browseId };
  return null;
}

export function open(target?: BrowseTarget) {
  const r = routeFor(target);
  if (r) navigate(r);
}
