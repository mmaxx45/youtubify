// Converts YouTube Music innertube responses into the models in models.ts. The JSON is loosely
// typed and changes over time, so everything here reads defensively and falls back to empty values
// rather than throwing.

import type {
  ArtistPage,
  ArtistRef,
  BrowseGroup,
  BrowseTarget,
  BrowseTile,
  Card,
  CategoryPage,
  Chip,
  CollectionPage,
  HomePage,
  PageType,
  PlayEndpoint,
  PlaylistOption,
  SearchPage,
  Shelf,
  Thumb,
  Track
} from "./models";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export const text = (t: Json): string => (t?.runs ? t.runs.map((r: Json) => r.text).join("") : (t?.simpleText ?? ""));

const pageTypes: Record<string, PageType> = {
  MUSIC_PAGE_TYPE_PLAYLIST: "playlist",
  MUSIC_PAGE_TYPE_ALBUM: "album",
  MUSIC_PAGE_TYPE_AUDIOBOOK: "album",
  MUSIC_PAGE_TYPE_ARTIST: "artist",
  MUSIC_PAGE_TYPE_LIBRARY_ARTIST: "artist",
  MUSIC_PAGE_TYPE_USER_CHANNEL: "user",
  MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE: "podcast",
  MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_TRACK_PAGE: "episode"
};

/** Depth-first search for the first value stored under `key`. */
export function findKey(node: Json, key: string): Json {
  if (!node || typeof node !== "object") return undefined;
  if (key in node) return node[key];
  for (const v of Object.values(node)) {
    const found = findKey(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** All values stored under `key`, without descending into a match. */
export function findAll(node: Json, key: string, out: Json[] = []): Json[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const v of node) findAll(v, key, out);
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === key) out.push(v);
    else findAll(v, key, out);
  }
  return out;
}

export function thumbsOf(node: Json): Thumb[] {
  const list: Json[] = findKey(node, "thumbnails") ?? [];
  return list.filter(t => t?.url).map(t => ({ url: t.url, width: t.width ?? 0, height: t.height ?? 0 }));
}

/** Smallest thumbnail that is at least `size` px wide (YTM URLs also accept a size suffix). */
export function pickThumb(thumbs: Thumb[], size: number): string {
  if (!thumbs.length) return "";
  const sorted = [...thumbs].sort((a, b) => a.width - b.width);
  const best = sorted.find(t => t.width >= size) ?? sorted[sorted.length - 1];
  // googleusercontent/ggpht covers can be requested at any size via their =wNNN-hNNN suffix
  if (/(googleusercontent|ggpht)\.com/.test(best.url) && best.width < size) return best.url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
  return best.url;
}

const browseOf = (endpoint: Json): BrowseTarget | undefined => {
  const b = endpoint?.browseEndpoint;
  if (!b?.browseId) return undefined;
  const pageType = b.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
  return { browseId: b.browseId, pageType: pageTypes[pageType] ?? "other", params: b.params };
};

// Keep only what YTM's navigate needs; tracking params bloat IPC for no benefit.
const playOf = (endpoint: Json): PlayEndpoint | undefined => {
  if (endpoint?.watchEndpoint) {
    const { videoId, playlistId, index, params, playlistSetVideoId } = endpoint.watchEndpoint;
    return { watchEndpoint: { videoId, playlistId, index, params, playlistSetVideoId } };
  }
  if (endpoint?.watchPlaylistEndpoint) {
    const { playlistId, params } = endpoint.watchPlaylistEndpoint;
    return { watchPlaylistEndpoint: { playlistId, params } };
  }
  return undefined;
};

const cardKind = (browse: BrowseTarget | undefined, play: PlayEndpoint | undefined, subtitle: string, wide: boolean): Card["kind"] => {
  switch (browse?.pageType) {
    case "album":
      return "album";
    case "artist":
    case "user":
      return "artist";
    case "playlist":
      return "playlist";
    case "podcast":
      return "podcast";
    case "episode":
      return "episode";
  }
  if (play) return wide || /video/i.test(subtitle) ? "video" : "song";
  return "other";
};

// YTM only offers "Delete playlist" in the menus of the user's own playlists
const isOwnPlaylist = (r: Json): boolean => !!findKey(r.menu, "deletePlaylistEndpoint");

export function parseTwoRowItem(r: Json, key: string): Card {
  const title = text(r.title);
  const subtitle = text(r.subtitle);
  const browse = browseOf(r.navigationEndpoint);
  const overlayPlay = findKey(r.thumbnailOverlay, "playNavigationEndpoint");
  const play = playOf(r.navigationEndpoint) ?? playOf(overlayPlay);
  const wide = /RECTANGLE/.test(r.aspectRatio ?? "");
  const crop = findKey(r.thumbnailRenderer, "thumbnailCrop");
  const kind = cardKind(browse, play, subtitle, wide);
  return {
    key,
    kind,
    title,
    subtitle,
    thumbs: thumbsOf(r.thumbnailRenderer),
    round: crop === "MUSIC_THUMBNAIL_CROP_CIRCLE" || kind === "artist",
    wide,
    browse,
    play,
    owned: isOwnPlaylist(r)
  };
}

const columnRuns = (r: Json): Json[][] => (r.flexColumns ?? []).map((c: Json) => c.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []);

const durationPattern = /^\d{1,2}(:\d{2}){1,2}$/;

// Rows carry a like button in their menu with the user's current rating
const likeStatusOf = (r: Json): boolean | undefined => {
  const status = findKey(r.menu, "likeButtonRenderer")?.likeStatus;
  return status === undefined ? undefined : status === "LIKE";
};

/** True when a row's menu can remove it from the given playlist, i.e. the user owns that playlist. */
const canRemoveFrom = (r: Json, playlistId: string): boolean =>
  findAll(r.menu, "playlistEditEndpoint").some(
    (e: Json) => e.playlistId === playlistId && (e.actions ?? []).some((a: Json) => a.action === "ACTION_REMOVE_VIDEO")
  );

/** A list row is either a playable track or a browsable item (artist/album/playlist) shown as a card. */
export function parseListItem(r: Json, key: string, fallbackArtists: ArtistRef[] = []): { track?: Track; card?: Card } {
  const cols = columnRuns(r);
  const title = (cols[0] ?? []).map((x: Json) => x.text).join("");
  const browse = browseOf(r.navigationEndpoint);
  const thumbs = thumbsOf(r.thumbnail);
  const rest: Json[] = cols.slice(1).flat();
  const restText = cols
    .slice(1)
    .map(c => c.map((x: Json) => x.text).join(""))
    .filter(Boolean)
    .join(" • ");

  if (browse && !r.playlistItemData) {
    const kind = cardKind(browse, undefined, restText, false);
    return { card: { key, kind, title, subtitle: restText, thumbs, round: kind === "artist", wide: false, browse, owned: isOwnPlaylist(r) } };
  }

  const titleRun = cols[0]?.[0];
  const overlayPlay = findKey(r.overlay, "playNavigationEndpoint");
  const play = playOf(titleRun?.navigationEndpoint) ?? playOf(overlayPlay);
  const videoId: string | undefined = r.playlistItemData?.videoId ?? (play as Json)?.watchEndpoint?.videoId;
  if (!videoId || !play) return {};

  const artists: ArtistRef[] = rest
    .filter((x: Json) => {
      const t = browseOf(x.navigationEndpoint)?.pageType;
      return t === "artist" || t === "user";
    })
    .map((x: Json) => ({ name: x.text, browseId: x.navigationEndpoint.browseEndpoint.browseId }));
  const albumRun = rest.find((x: Json) => browseOf(x.navigationEndpoint)?.pageType === "album");
  const fixed = text(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text);
  const duration = durationPattern.test(fixed) ? fixed : (rest.map((x: Json) => x.text).find((t: string) => durationPattern.test(t)) ?? "");

  // Rows without linked artists (e.g. uploads, some search rows) still name them in plain text,
  // usually after a type label ("Song • Artist"). A lone segment is just that label (search
  // top-result rows), so the caller's fallback artist applies instead.
  let artistRefs = artists;
  if (!artistRefs.length) {
    const plain = (cols[1] ?? []).map((x: Json) => x.text).join("");
    const parts = plain.split(" • ").filter(p => p && !durationPattern.test(p));
    if (parts.length > 1) artistRefs = [{ name: parts[1] }];
    else if (fallbackArtists.length) artistRefs = fallbackArtists;
    else if (parts.length) artistRefs = [{ name: parts[0] }];
  }
  const isSearchStyle = cols.length === 2 && rest.length > 2;

  return {
    track: {
      key,
      videoId,
      title,
      artists: artistRefs,
      album: albumRun ? { name: albumRun.text, browseId: albumRun.navigationEndpoint.browseEndpoint.browseId } : undefined,
      duration,
      thumbs,
      explicit: findAll(r.badges, "musicInlineBadgeRenderer").some((b: Json) => b?.icon?.iconType === "MUSIC_EXPLICIT_BADGE"),
      detail: isSearchStyle ? restText : "",
      play,
      liked: likeStatusOf(r),
      setVideoId: r.playlistItemData?.playlistSetVideoId
    }
  };
}

function parseShelfItems(contents: Json[], prefix: string, fallbackArtists?: ArtistRef[]) {
  const cards: Card[] = [];
  const tracks: Track[] = [];
  (contents ?? []).forEach((item: Json, i: number) => {
    const key = `${prefix}-${i}`;
    if (item.musicTwoRowItemRenderer) cards.push(parseTwoRowItem(item.musicTwoRowItemRenderer, key));
    else if (item.musicResponsiveListItemRenderer) {
      const { track, card } = parseListItem(item.musicResponsiveListItemRenderer, key, fallbackArtists);
      if (track) tracks.push(track);
      if (card) cards.push(card);
    }
  });
  return { cards, tracks };
}

export function parseCarousel(r: Json, key: string): Shelf {
  const header = r.header?.musicCarouselShelfBasicHeaderRenderer ?? r.header?.musicImmersiveCarouselShelfBasicHeaderRenderer ?? {};
  const { cards, tracks } = parseShelfItems(r.contents, key);
  return {
    key,
    title: text(header.title),
    strapline: text(header.strapline),
    cards,
    tracks,
    more: browseOf(header.moreContentButton?.buttonRenderer?.navigationEndpoint) ?? browseOf(header.title?.runs?.[0]?.navigationEndpoint)
  };
}

function parseSections(contents: Json[], prefix: string): Shelf[] {
  const shelves: Shelf[] = [];
  (contents ?? []).forEach((s: Json, i: number) => {
    const key = `${prefix}-${i}`;
    const carousel = s.musicCarouselShelfRenderer ?? s.musicImmersiveCarouselShelfRenderer;
    if (carousel) {
      const shelf = parseCarousel(carousel, key);
      if (shelf.cards.length || shelf.tracks.length) shelves.push(shelf);
    } else if (s.gridRenderer) {
      const { cards, tracks } = parseShelfItems(s.gridRenderer.items, key);
      if (cards.length || tracks.length) shelves.push({ key, title: text(s.gridRenderer.header?.gridHeaderRenderer?.title), strapline: "", cards, tracks });
    } else if (s.musicShelfRenderer) {
      const { cards, tracks } = parseShelfItems(s.musicShelfRenderer.contents, key);
      if (cards.length || tracks.length)
        shelves.push({ key, title: text(s.musicShelfRenderer.title), strapline: "", cards, tracks, more: browseOf(s.musicShelfRenderer.bottomEndpoint) });
    }
  });
  return shelves;
}

function parseChips(header: Json): Chip[] {
  return (header?.chipCloudRenderer?.chips ?? []).map((c: Json) => {
    const r = c.chipCloudChipRenderer ?? {};
    const endpoint = r.navigationEndpoint?.browseEndpoint ?? r.navigationEndpoint?.searchEndpoint;
    return { label: text(r.text), selected: !!r.isSelected, params: endpoint?.params };
  });
}

export function parseHome(json: Json): HomePage {
  const sectionList = findKey(json.contents, "sectionListRenderer") ?? {};
  return {
    chips: parseChips(sectionList.header),
    shelves: parseSections(sectionList.contents, "home"),
    continuation: sectionList.continuations?.[0]?.nextContinuationData?.continuation
  };
}

export function parseHomeContinuation(json: Json, page: number): { shelves: Shelf[]; continuation?: string } {
  const c = json.continuationContents?.sectionListContinuation ?? {};
  return { shelves: parseSections(c.contents, `home${page}`), continuation: c.continuations?.[0]?.nextContinuationData?.continuation };
}

const continuationToken = (contents: Json[]): string | undefined =>
  findKey(
    (contents ?? []).find((c: Json) => c.continuationItemRenderer),
    "token"
  );

export function parseCollection(json: Json, id: string): CollectionPage {
  const header = findKey(json, "musicResponsiveHeaderRenderer") ?? findKey(json, "musicDetailHeaderRenderer") ?? {};
  const secondary = json.contents?.twoColumnBrowseResultsRenderer?.secondaryContents ?? json.contents;
  const listShelf = findKey(secondary, "musicPlaylistShelfRenderer") ?? findKey(secondary, "musicShelfRenderer") ?? {};
  const subtitle = text(header.subtitle);
  const kind: CollectionPage["kind"] = id.startsWith("MPRE") || /^(Album|Single|EP)\b/i.test(subtitle) ? "album" : "playlist";
  const albumArtists: ArtistRef[] = (header.straplineTextOne?.runs ?? [])
    .filter((r: Json) => r.navigationEndpoint?.browseEndpoint)
    .map((r: Json) => ({ name: r.text, browseId: r.navigationEndpoint.browseEndpoint.browseId }));
  const facepile = header.facepile?.avatarStackViewModel;
  const ownerName = facepile?.text?.content ?? text(header.straplineTextOne);
  const ownerBrowse = facepile?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.browseId;
  const playButton = (header.buttons ?? []).find((b: Json) => b.musicPlayButtonRenderer)?.musicPlayButtonRenderer;
  const playEndpoint = playOf(playButton?.playNavigationEndpoint) as Json;
  // Albums play from their OLAK… audio playlist; playlists are their browse id without "VL"
  const playlistId: string | undefined =
    playEndpoint?.watchEndpoint?.playlistId ?? playEndpoint?.watchPlaylistEndpoint?.playlistId ?? (id.startsWith("VL") ? id.slice(2) : undefined);
  const { tracks } = parseShelfItems(listShelf.contents, `col-${id}`, albumArtists);
  // Album rows have no artwork of their own
  const thumbs = thumbsOf(header.thumbnail);
  if (kind === "album") for (const t of tracks) if (!t.thumbs.length) t.thumbs = thumbs;
  const moreSections = (secondary?.sectionListRenderer?.contents ?? []).filter((s: Json) => s.musicCarouselShelfRenderer);

  return {
    kind,
    id,
    title: text(header.title),
    typeLine: subtitle,
    meta: text(header.secondSubtitle).replace(/\s•\s*$/, ""),
    description: text(findKey(header.description, "description")),
    thumbs,
    owner:
      kind === "playlist" && ownerName
        ? { name: ownerName, browseId: ownerBrowse, avatar: facepile?.avatars?.[0]?.avatarViewModel?.image?.sources?.[0]?.url }
        : undefined,
    artists: albumArtists,
    tracks,
    continuation: continuationToken(listShelf.contents),
    play: playOf(playButton?.playNavigationEndpoint),
    playlistId,
    saved: !!(header.buttons ?? []).find((b: Json) => b.toggleButtonRenderer)?.toggleButtonRenderer?.isToggled,
    editable:
      !!findKey(json, "musicEditablePlaylistDetailHeaderRenderer") ||
      (!!playlistId &&
        (listShelf.contents ?? []).some((c: Json) => c.musicResponsiveListItemRenderer && canRemoveFrom(c.musicResponsiveListItemRenderer, playlistId))),
    more: parseSections(moreSections, `more-${id}`)
  };
}

export function parseCollectionContinuation(json: Json, id: string, offset: number): { tracks: Track[]; continuation?: string } {
  const items = findKey(json.onResponseReceivedActions, "continuationItems") ?? findKey(json.continuationContents, "contents") ?? [];
  const { tracks } = parseShelfItems(items, `col-${id}-${offset}`);
  return { tracks, continuation: continuationToken(items) };
}

export function parseArtist(json: Json, id: string): ArtistPage {
  const header = json.header?.musicImmersiveHeaderRenderer ?? json.header?.musicVisualHeaderRenderer ?? {};
  const sections: Json[] = findKey(json.contents, "sectionListRenderer")?.contents ?? [];
  const songShelf = sections.find(s => s.musicShelfRenderer)?.musicShelfRenderer;
  const name = text(header.title);
  const topSongs = songShelf ? parseShelfItems(songShelf.contents, `artist-${id}-top`, [{ name, browseId: id }]).tracks : [];
  return {
    id,
    name,
    thumbs: thumbsOf(header.thumbnail),
    subscribers: text(header.subscriptionButton?.subscribeButtonRenderer?.longSubscriberCountText),
    description: text(header.description),
    topSongs,
    topSongsMore: browseOf(songShelf?.bottomEndpoint),
    shelves: parseSections(
      sections.filter(s => !s.musicShelfRenderer),
      `artist-${id}`
    ),
    shuffle: playOf(header.playButton?.buttonRenderer?.navigationEndpoint),
    radio: playOf(header.startRadioButton?.buttonRenderer?.navigationEndpoint),
    channelId: header.subscriptionButton?.subscribeButtonRenderer?.channelId ?? id,
    subscribed: !!header.subscriptionButton?.subscribeButtonRenderer?.subscribed
  };
}

/** Top result card + mixed results from the unfiltered search. */
export function parseSearchTop(json: Json, query: string): Pick<SearchPage, "query" | "top" | "songs" | "artists" | "albums" | "playlists" | "videos"> {
  const sections: Json[] = findKey(json.contents, "sectionListRenderer")?.contents ?? [];
  const result: SearchPage = { query, songs: [], artists: [], albums: [], playlists: [], videos: [] };
  const sortCard = (c: Card) => {
    if (c.kind === "artist") result.artists.push(c);
    else if (c.kind === "album") result.albums.push(c);
    else if (c.kind === "playlist") result.playlists.push(c);
  };
  const sortTrack = (t: Track) => (/^video\b/i.test(t.detail) ? result.videos : result.songs).push(t);

  sections.forEach((s, i) => {
    const cardShelf = s.musicCardShelfRenderer;
    if (cardShelf) {
      const titleRun = cardShelf.title?.runs?.[0];
      const browse = browseOf(titleRun?.navigationEndpoint);
      const play = playOf(titleRun?.navigationEndpoint) ?? playOf(findKey(cardShelf.thumbnailOverlay, "playNavigationEndpoint"));
      const subtitle = text(cardShelf.subtitle);
      const kind = cardKind(browse, play, subtitle, false);
      // Songs inside the top-result card belong to that artist and don't repeat the name
      const fallback = kind === "artist" && browse ? [{ name: text(cardShelf.title), browseId: browse.browseId }] : [];
      const { tracks } = parseShelfItems(cardShelf.contents, `top-${i}`, fallback);
      result.top = {
        card: {
          key: "top",
          kind,
          title: text(cardShelf.title),
          subtitle,
          thumbs: thumbsOf(cardShelf.thumbnail),
          round: kind === "artist",
          wide: false,
          browse,
          play
        },
        tracks
      };
      return;
    }
    const items =
      s.musicShelfRenderer?.contents ?? findAll(s.itemSectionRenderer, "musicResponsiveListItemRenderer").map(r => ({ musicResponsiveListItemRenderer: r }));
    const { cards, tracks } = parseShelfItems(items, `res-${i}`);
    cards.forEach(sortCard);
    tracks.forEach(sortTrack);
  });
  return result;
}

/** Results of a search filtered to one type (songs, artists, ...). */
export function parseSearchFiltered(json: Json, prefix: string): { cards: Card[]; tracks: Track[] } {
  const shelves = findAll(json.contents, "musicShelfRenderer");
  return parseShelfItems(
    shelves.flatMap(s => s.contents ?? []),
    prefix
  );
}

export function parseSuggestions(json: Json): string[] {
  return findAll(json, "searchSuggestionRenderer")
    .map(s => text(s.suggestion))
    .filter(Boolean);
}

/** YTM's "Moods & genres" page, shown as Spotify's "Browse all" tiles. */
export function parseMoods(json: Json): BrowseGroup[] {
  return findAll(json.contents, "gridRenderer").map((g: Json, gi: number) => ({
    title: text(g.header?.gridHeaderRenderer?.title),
    tiles: (g.items ?? [])
      .map((item: Json, i: number): BrowseTile | null => {
        const b = item.musicNavigationButtonRenderer;
        const endpoint = b?.clickCommand?.browseEndpoint;
        if (!endpoint) return null;
        // leftStripeColor is a packed ARGB integer
        const rgb = ((b.solid?.leftStripeColor ?? 0) >>> 0) & 0xffffff;
        return {
          key: `mood-${gi}-${i}`,
          label: text(b.buttonText),
          color: `#${rgb.toString(16).padStart(6, "0")}`,
          browseId: endpoint.browseId,
          params: endpoint.params
        };
      })
      .filter((t: BrowseTile | null): t is BrowseTile => !!t)
  }));
}

export function parseCategory(json: Json): CategoryPage {
  const sectionList = findKey(json.contents, "sectionListRenderer") ?? {};
  return { title: text(json.header?.musicHeaderRenderer?.title), shelves: parseSections(sectionList.contents, "cat") };
}

/** The user's saved playlists / albums / artists, from FEmusic_liked_* and library corpus pages. */
export function parseLibraryGrid(json: Json, prefix: string): Card[] {
  const twoRow = findAll(json.contents, "musicTwoRowItemRenderer").map((r, i) => parseTwoRowItem(r, `${prefix}-${i}`));
  const rows = findAll(json.contents, "musicResponsiveListItemRenderer")
    .map((r, i) => parseListItem(r, `${prefix}-r${i}`).card)
    .filter((c): c is Card => !!c);
  // The grid starts with a "New playlist" tile that has no browse target
  return [...twoRow, ...rows].filter(c => c.browse);
}

/** Playlists offered by YTM's "Save to playlist" dialog for a song (only ones the user can edit). */
export function parseAddToPlaylist(json: Json): PlaylistOption[] {
  return findAll(json, "playlistAddToOptionRenderer").map((o: Json) => ({
    playlistId: o.playlistId,
    title: text(o.title),
    thumbs: thumbsOf(o.thumbnail),
    containsSong: o.containsSelectedVideos === "ALL"
  }));
}

/** Plain lyrics from a YTM lyrics page (browse MPLY…), with the provider credit. */
export function parseLyrics(json: Json): { lines: string[]; source: string } | null {
  const shelf = findKey(json.contents, "musicDescriptionShelfRenderer");
  const body = text(shelf?.description);
  if (!body) return null;
  return { lines: body.split(/\r?\n/), source: text(shelf?.footer) };
}

/** The lyrics page id for a song, from the "next" (watch panel) response's Lyrics tab. */
export function lyricsBrowseId(nextJson: Json): string | undefined {
  return findAll(nextJson, "browseEndpoint")
    .map((b: Json) => b.browseId)
    .find((id: unknown) => typeof id === "string" && id.startsWith("MPLY"));
}
