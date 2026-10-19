// YouTube Music data + playback for the Youtubify UI. Requests run inside the hidden YTM view
// (window.ytf.innertube) so they use the user's signed-in session.

import type { ArtistPage, BrowseGroup, Card, CategoryPage, CollectionPage, HomePage, PlayEndpoint, PlaylistOption, SearchPage, Shelf, Track } from "./models";
import * as parse from "./parse";

const call = <T = unknown>(endpoint: string, body: Record<string, unknown>) => window.ytf.innertube<T>(endpoint, JSON.parse(JSON.stringify(body)));
const browse = (body: Record<string, unknown>) => call("browse", body);

// Search filter params (from ytmusicapi); they restrict results to a single type.
const searchFilters = {
  songs: "EgWKAQIIAWoKEAkQBRAKEAMQBA==",
  videos: "EgWKAQIQAWoKEAkQChAFEAMQBA==",
  albums: "EgWKAQIYAWoKEAkQChAFEAMQBA==",
  artists: "EgWKAQIgAWoKEAkQChAFEAMQBA==",
  playlists: "EgeKAQQoAEABagoQAxAEEAoQCRAF"
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
