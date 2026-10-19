// "Show all" pages for shelves. Shelves without a YTM page of their own (e.g. "Fans might also
// like", Quick picks) are stashed here so their page can show the items again, also after
// back/forward, for the rest of the session.

import { toRaw } from "vue";
import type { Shelf } from "../ytm/models";
import { routeFor, type Route } from "./router";

const stash = new Map<string, Shelf>();
const ids = new WeakMap<Shelf, string>();

function stashShelf(shelf: Shelf): string {
  const raw = toRaw(shelf);
  let id = ids.get(raw);
  if (!id) {
    id = `s${stash.size + 1}`;
    ids.set(raw, id);
    stash.set(id, raw);
  }
  return id;
}

export const stashedShelf = (id?: string): Shelf | undefined => (id ? stash.get(id) : undefined);

/** Where a shelf's title / "Show all" leads. */
export function showAllRoute(shelf: Shelf, title = shelf.title): Route {
  const more = shelf.more;
  const target = routeFor(more);
  // A real playlist behind the link (an artist's "Videos") already has a full page
  if (target?.name === "collection") return target;
  // "Featured playlists" links to YTM's Moods & genres, which is our Browse all page
  if (more?.browseId === "FEmusic_moods_and_genres") return { name: "search", query: "" };
  // A bare artist link (home's "Similar to X" title) is not a list of the shelf's items
  if (more && (!target || more.params)) return { name: "shelf", title, browseId: more.browseId, params: more.params, stash: stashShelf(shelf) };
  return { name: "shelf", title, stash: stashShelf(shelf) };
}

/** Artist shelves that open the artist's discography (Albums, Singles & EPs). */
export const isDiscography = (shelf: Shelf): boolean => !!shelf.more?.browseId.startsWith("MPAD");
