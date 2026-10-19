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
}

export interface Shelf {
  key: string;
  title: string;
  strapline: string;
  cards: Card[];
  tracks: Track[];
  more?: BrowseTarget;
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
