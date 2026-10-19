// YouTube Music data + playback for the Youtubify UI. Requests run inside the hidden YTM view
// (window.ytf.innertube) so they use the user's signed-in session.

import type {
  ArtistPage,
  ArtistRef,
  BrowseGroup,
  Card,
  CategoryPage,
  CollectionPage,
  HomePage,
  PlayEndpoint,
  PlaylistOption,
  SearchFilter,
  SearchPage,
  SearchResults,
  Shelf,
  ShelfPage,
  Track
} from "./models";
import * as parse from "./parse";

const call = <T = unknown>(endpoint: string, body: Record<string, unknown>) => window.ytf.innertube<T>(endpoint, JSON.parse(JSON.stringify(body)));
const browse = (body: Record<string, unknown>) => call("browse", body);

// Search filter params (from ytmusicapi); they restrict results to a single type.
const searchFilters = {
  songs: "EgWKAQIIAWoKEAkQBRAKEAMQBA==",
  videos: "EgWKAQIQAWoKEAkQChAFEAMQBA==",
  albums: "EgWKAQIYAWoKEAkQChAFEAMQBA==",
  artists: "EgWKAQIgAWoKEAkQChAFEAMQBA==",
  playlists: "EgeKAQQoAEABagoQAxAEEAoQCRAF",
  // From the chip cloud of an unfiltered search
  featuredPlaylists: "EgeKAQQoADgBahIQBRAJEAMQChAEEA4QEBAVEBE%3D",
  podcasts: "EgWKAQJQAWoSEAUQCRADEAoQBBAOEBAQFRAR",
  profiles: "EgWKAQJYAWoSEAUQCRADEAoQBBAOEBAQFRAR"
} as const;

export async function getHome(chipParams?: string, minShelves = 8): Promise<HomePage> {
  const page = parse.parseHome(await browse({ browseId: "FEmusic_home", params: chipParams }));
  // The first response only carries a few shelves; pull more so the page isn't sparse
  let n = 1;
  while (page.continuation && page.shelves.length < minShelves && n < 4) {
    const next = await getHomeMore(page.continuation, n++);
    page.shelves.push(...next.shelves);
    page.continuation = next.continuation;
  }
  return page;
}

export async function getHomeMore(continuation: string, page: number): Promise<{ shelves: Shelf[]; continuation?: string }> {
  return parse.parseHomeContinuation(await browse({ continuation }), page);
}

export async function getCollection(id: string): Promise<CollectionPage> {
  const page = parse.parseCollection(await browse({ browseId: id }), id);
  // Liked music and some playlists have no play button in their header
  if (!page.play && page.kind === "playlist") page.play = { watchPlaylistEndpoint: { playlistId: id.replace(/^VL/, "") } };
  return page;
}

export async function getCollectionMore(id: string, continuation: string, offset: number): Promise<{ tracks: Track[]; continuation?: string }> {
  return parse.parseCollectionContinuation(await browse({ continuation }), id, offset);
}

export async function getArtist(id: string): Promise<ArtistPage> {
  return parse.parseArtist(await browse({ browseId: id }), id);
}

/** The full list behind a shelf's "Show all": its browse page, or that page reloaded with a filter/sort token. */
export async function getShelfPage(target: { browseId: string; params?: string } | { continuation: string }): Promise<ShelfPage> {
  return parse.parseShelfPage(await browse(target), "all");
}

export async function getShelfPageMore(continuation: string, offset: number): Promise<{ cards: Card[]; tracks: Track[]; continuation?: string }> {
  return parse.parseShelfPageContinuation(await browse({ continuation }), `all-${offset}`);
}

export async function search(query: string): Promise<SearchPage> {
  const [top, songs, artists, albums, playlists] = await Promise.all([
    call("search", { query }),
    call("search", { query, params: searchFilters.songs }),
    call("search", { query, params: searchFilters.artists }),
    call("search", { query, params: searchFilters.albums }),
    call("search", { query, params: searchFilters.playlists })
  ]);
  const page: SearchPage = { ...parse.parseSearchTop(top, query) };
  // Prefer the dedicated filtered results; the mixed list only fills gaps
  const pick = <T>(filtered: T[], mixed: T[]) => (filtered.length ? filtered : mixed);
  page.songs = pick(parse.parseSearchFiltered(songs, "s-songs").tracks, page.songs);
  page.artists = pick(parse.parseSearchFiltered(artists, "s-artists").cards, page.artists);
  page.albums = pick(parse.parseSearchFiltered(albums, "s-albums").cards, page.albums);
  page.playlists = pick(parse.parseSearchFiltered(playlists, "s-playlists").cards, page.playlists);
  return page;
}

/** First page of results of one type, for Spotify's filter chips (Songs, Artists, ...). */
export async function searchFiltered(query: string, filter: SearchFilter): Promise<SearchResults> {
  if (filter !== "playlists") return parse.parseSearchFiltered(await call("search", { query, params: searchFilters[filter] }), `sf-${filter}`);
  // Like Spotify's own playlists coming first: YTM's featured ones (a single page), then community playlists
  const [featured, community] = await Promise.all([
    call("search", { query, params: searchFilters.featuredPlaylists })
      .then(j => parse.parseSearchFiltered(j, "sf-featured").cards)
      .catch((): Card[] => []),
    call("search", { query, params: searchFilters.playlists }).then(j => parse.parseSearchFiltered(j, "sf-playlists"))
  ]);
  const seen = new Set<string>();
  community.cards = [...featured, ...community.cards].filter(c => !c.browse || (!seen.has(c.browse.browseId) && !!seen.add(c.browse.browseId)));
  return community;
}

/** The next page of filtered search results; `offset` (results so far) keeps item keys unique. */
export async function searchMore(continuation: string, offset: number): Promise<SearchResults> {
  return parse.parseSearchContinuation(await call("search", { continuation }), `sf-${offset}`);
}

export async function getMoods(): Promise<BrowseGroup[]> {
  return parse.parseMoods(await browse({ browseId: "FEmusic_moods_and_genres" }));
}

export async function getCategory(browseId: string, params?: string): Promise<CategoryPage> {
  return parse.parseCategory(await browse({ browseId, params }));
}

export async function getSuggestions(input: string): Promise<string[]> {
  if (!input.trim()) return [];
  return parse.parseSuggestions(await call("music/get_search_suggestions", { input }));
}

export async function getLibrary(): Promise<{ playlists: Card[]; albums: Card[]; artists: Card[] }> {
  const [playlists, albums, artists] = await Promise.all([
    browse({ browseId: "FEmusic_liked_playlists" }).then(j => parse.parseLibraryGrid(j, "lib-pl")),
    browse({ browseId: "FEmusic_liked_albums" })
      .then(j => parse.parseLibraryGrid(j, "lib-al"))
      .catch((): Card[] => []),
    browse({ browseId: "FEmusic_library_corpus_track_artists" })
      .then(j => parse.parseLibraryGrid(j, "lib-ar"))
      .catch((): Card[] => [])
  ]);
  return { playlists, albums, artists };
}

/** Creates a private playlist like Spotify's "Create" button and returns its browse id. */
export async function createPlaylist(title: string, videoIds: string[] = []): Promise<string> {
  const res = await call<{ playlistId?: string }>("playlist/create", { title, privacyStatus: "PRIVATE", videoIds });
  if (!res.playlistId) throw new Error("YouTube Music didn't return the new playlist");
  return `VL${res.playlistId}`;
}

/* ---------------------------------------------------------------- library actions */

/** Like / unlike a song (Spotify's "Save to your Liked Songs"). */
export const rateSong = (videoId: string, like: boolean) => call(like ? "like/like" : "like/removelike", { target: { videoId } });

/** Save / remove a playlist or album (by its plain playlist id) in the user's library. */
export const savePlaylist = (playlistId: string, save: boolean) => call(save ? "like/like" : "like/removelike", { target: { playlistId } });

/** Follow / unfollow an artist (YouTube subscription). */
export const followArtist = (channelId: string, follow: boolean) =>
  call(follow ? "subscription/subscribe" : "subscription/unsubscribe", { channelIds: [channelId] });

/** Playlists the song can be added to, with whether it's already in them. */
export async function getPlaylistOptions(videoId: string): Promise<PlaylistOption[]> {
  return parse.parseAddToPlaylist(await call("playlist/get_add_to_playlist", { videoIds: [videoId] }));
}

export const addToPlaylist = (playlistId: string, videoId: string) =>
  call("browse/edit_playlist", { playlistId, actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: videoId, dedupeOption: "DEDUPE_OPTION_SKIP" }] });

export const removeFromPlaylist = (playlistId: string, videoId: string, setVideoId: string) =>
  call("browse/edit_playlist", { playlistId, actions: [{ action: "ACTION_REMOVE_VIDEO", removedVideoId: videoId, setVideoId }] });

type Lyrics = { lines: string[]; source: string } | null;
const lyricsCache = new Map<string, Promise<Lyrics>>();

/** Lyrics for a song, or null if YouTube Music has none (cached per song). */
export function getLyrics(videoId: string): Promise<Lyrics> {
  if (!lyricsCache.has(videoId)) {
    const request = (async () => {
      const browseId = parse.lyricsBrowseId(await call("next", { videoId, isAudioOnly: true }));
      return browseId ? parse.parseLyrics(await browse({ browseId })) : null;
    })();
    // Don't cache failures, so a retry can succeed
    request.catch(() => lyricsCache.delete(videoId));
    lyricsCache.set(videoId, request);
  }
  return lyricsCache.get(videoId)!;
}

/**
 * Add a song or a whole playlist/album to the play queue (end, or right after the current song).
 * Returns false when nothing is playing yet; callers then just start playback instead.
 */
export async function addToQueue(target: { videoId?: string; playlistId?: string }, next = false): Promise<boolean> {
  return window.ytf.queueAdd({ ...target, next });
}

/*
 * Queue editing. `index` is the song's position in the engine's queue (player.queueItems) and
 * `videoId` the song expected there; edits on a queue that changed meanwhile return false.
 */
export const removeFromQueue = (index: number, videoId: string) => window.ytf.queueEdit({ op: "remove", index, videoId }) as Promise<boolean>;
export const moveInQueue = (index: number, to: number, videoId: string) => window.ytf.queueEdit({ op: "move", index, to, videoId }) as Promise<boolean>;
/** Removes every song after the current one; resolves to how many were removed. */
export const clearQueue = () => window.ytf.queueEdit({ op: "clear" }) as Promise<number>;

/** Artist / album links of a queued song (the engine's queue only carries plain text). */
export async function getQueueItemLinks(index: number, videoId: string): Promise<{ artists: ArtistRef[]; album?: ArtistRef }> {
  const runs = await window.ytf.queueEdit({ op: "details", index, videoId });
  return parse.parseBylineLinks(Array.isArray(runs) ? runs : []);
}

/** Spotify's "Recently played": the YouTube Music listening history (needs a signed-in account). */
export async function getHistory(): Promise<{ tracks: Track[]; signInRequired: boolean }> {
  return parse.parseHistory(await browse({ browseId: "FEmusic_history" }));
}

/* ---------------------------------------------------------------- playback */

// Values from Vue state are reactive Proxies, which Electron IPC cannot clone: send plain copies
const plain = <T>(value: T): T => (value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value);

export const play = (endpoint: PlayEndpoint) => window.ytf.command("navigate", plain(endpoint));

/** Play a track inside its list (playlist/album) so the rest of the list becomes the queue. */
export function playTrackInList(track: Track, listPlaylistId?: string, index?: number) {
  const watch = (track.play as { watchEndpoint?: Record<string, unknown> }).watchEndpoint;
  if (watch && listPlaylistId) play({ watchEndpoint: { ...watch, playlistId: watch.playlistId ?? listPlaylistId, index } });
  else play(track.play);
}

export const playlistIdOf = (page: CollectionPage): string | undefined => {
  const p = page.play as { watchEndpoint?: { playlistId?: string }; watchPlaylistEndpoint?: { playlistId?: string } } | undefined;
  return p?.watchEndpoint?.playlistId ?? p?.watchPlaylistEndpoint?.playlistId ?? (page.id.startsWith("VL") ? page.id.slice(2) : undefined);
};

export const command = (name: string, value?: unknown) => window.ytf.command(name, plain(value));
