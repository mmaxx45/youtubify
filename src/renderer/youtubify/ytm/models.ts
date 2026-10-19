// Plain data shapes the Youtubify UI renders. parse.ts builds these from YouTube Music's
// innertube responses so components never touch the raw renderer JSON.

export interface Thumb {
  url: string;
  width: number;
  height: number;
}

export type PageType = "playlist" | "album" | "artist" | "user" | "podcast" | "episode" | "other";

export interface BrowseTarget {
  browseId: string;
  pageType: PageType;
  params?: string;
}

// A raw YTM endpoint object ({ watchEndpoint } / { watchPlaylistEndpoint }) handed to the YTM view's
// "navigate" command to start playback.
export type PlayEndpoint = Record<string, unknown>;

export interface ArtistRef {
  name: string;
  browseId?: string;
}

export interface Card {
  key: string;
  kind: "playlist" | "album" | "artist" | "song" | "video" | "podcast" | "episode" | "other";
  title: string;
  subtitle: string;
  thumbs: Thumb[];
  round: boolean;
  wide: boolean;
  browse?: BrowseTarget;
  play?: PlayEndpoint;
  // The user's own playlist (YTM offers "Delete playlist" for it): editable, accepts dropped songs
  owned?: boolean;
}

export interface Track {
  key: string;
  videoId: string;
  title: string;
  artists: ArtistRef[];
  album?: ArtistRef;
  duration: string;
  thumbs: Thumb[];
  explicit: boolean;
  // Extra line from search/queue results (e.g. "Video • 12M views"); empty for plain lists.
  detail: string;
  play: PlayEndpoint;
  // YTM like status when the response included it (undefined = unknown)
  liked?: boolean;
  // Identifies this entry inside its playlist (needed to remove it)
  setVideoId?: string;
}

export interface Shelf {
  key: string;
  title: string;
  strapline: string;
  cards: Card[];
  tracks: Track[];
  more?: BrowseTarget;
}

/** A filter chip or sort option on a "Show all" page; picking it reloads the list from `continuation`. */
export interface PageOption {
  label: string;
  selected: boolean;
  continuation: string;
  // Reload for un-picking a selected filter chip (the unfiltered list)
  deselect?: string;
}

/** The full list behind a shelf's "Show all" (e.g. an artist's discography). */
export interface ShelfPage {
  title: string;
  cards: Card[];
  tracks: Track[];
  continuation?: string;
  filters: PageOption[];
  sorts: PageOption[];
}

export interface Chip {
  label: string;
  selected: boolean;
  params?: string;
}

export interface HomePage {
  chips: Chip[];
  shelves: Shelf[];
  continuation?: string;
}

export interface CollectionPage {
  kind: "playlist" | "album";
  id: string;
  title: string;
  typeLine: string;
  meta: string;
  description: string;
  thumbs: Thumb[];
  owner?: ArtistRef & { avatar?: string };
  artists: ArtistRef[];
  tracks: Track[];
  continuation?: string;
  play?: PlayEndpoint;
  more: Shelf[];
  // Plain playlist id (no VL prefix) used to save/edit it
  playlistId?: string;
  // In the user's library (header bookmark toggled)
  saved: boolean;
  // The user can add/remove songs (their own playlist)
  editable: boolean;
}

export interface ArtistPage {
  id: string;
  name: string;
  thumbs: Thumb[];
  subscribers: string;
  description: string;
  topSongs: Track[];
  topSongsMore?: BrowseTarget;
  shelves: Shelf[];
  shuffle?: PlayEndpoint;
  radio?: PlayEndpoint;
  channelId: string;
  subscribed: boolean;
}

export interface SearchTop {
  card: Card;
  tracks: Track[];
}

export interface SearchPage {
  query: string;
  top?: SearchTop;
  songs: Track[];
  artists: Card[];
  albums: Card[];
  playlists: Card[];
  videos: Track[];
}

/** One result type of a search, shown as its own page behind Spotify's filter chips. */
export type SearchFilter = "songs" | "artists" | "albums" | "playlists" | "podcasts" | "videos" | "profiles";

/** A page of filtered search results; `continuation` loads the next page. */
export interface SearchResults {
  tracks: Track[];
  cards: Card[];
  continuation?: string;
}

export interface BrowseTile {
  key: string;
  label: string;
  color: string;
  browseId: string;
  params?: string;
}

export interface BrowseGroup {
  title: string;
  tiles: BrowseTile[];
}

export interface CategoryPage {
  title: string;
  shelves: Shelf[];
}

export interface LibraryItem extends Card {
  pinned?: boolean;
}

/** A playlist the current song can be added to (from YTM's add-to-playlist dialog data). */
export interface PlaylistOption {
  playlistId: string;
  title: string;
  thumbs: Thumb[];
  containsSong: boolean;
}
