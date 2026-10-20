// Spotify's context menus, built from YouTube Music actions.

import type { ArtistPage, ArtistRef, Card, CollectionPage, Episode, PlaylistOption, Track } from "./ytm/models";
import { isFollowingPodcast, isSavedEpisode, setFollowingPodcast, setSavedEpisode } from "./state/podcasts";
import { addToQueue, getPlaylistOptions, play, removeFromPlaylist, savePlaylist } from "./ytm/client";
import type { MenuEntry, MenuItem } from "./state/menu";
import { isLiked, setLiked } from "./state/likes";
import { isFollowing, setFollowing } from "./state/follows";
import { albums, playlists, refreshLibrary } from "./state/library";
import { navigate } from "./state/router";
import { toast } from "./state/toast";
import { addTrackToPlaylist, createPlaylistDialog, deleteOwnPlaylist, editDetails, type OwnPlaylist } from "./state/playlistEdits";

const YTM = "https://music.youtube.com";

export async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Clipboard API can be unavailable for file:// pages; fall back to a hidden textarea
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("Link copied to clipboard");
}

const share = (label: string, url: string): MenuItem => ({
  label: "Share",
  icon: "share",
  submenu: () => [{ label, icon: "link", action: () => copyLink(url) }]
});

async function enqueue(target: { videoId?: string; playlistId?: string }, fallback: () => void) {
  try {
    if (await addToQueue(target)) toast("Added to queue");
    // Nothing playing yet: Spotify just starts it
    else fallback();
  } catch {
    toast("Couldn't add to queue");
  }
}

function artistItem(artists: ArtistRef[]): MenuItem | null {
  const linked = artists.filter(a => a.browseId);
  if (!linked.length) return null;
  if (linked.length === 1) return { label: "Go to artist", icon: "artist", action: () => navigate({ name: "artist", id: linked[0].browseId! }) };
  return {
    label: "Go to artist",
    icon: "artist",
    submenu: () => linked.map(a => ({ label: a.name, action: () => navigate({ name: "artist", id: a.browseId! }) }))
  };
}

function addToPlaylistItem(track: Track): MenuItem {
  const { videoId, title } = track;
  return {
    label: "Add to playlist",
    icon: "plus",
    searchable: true,
    submenu: async () => {
      const options = await getPlaylistOptions(videoId).catch((): PlaylistOption[] => []);
      const items: MenuEntry[] = [
        {
          label: "New playlist",
          icon: "plus",
          action: () => createPlaylistDialog(title, [videoId], track.thumbs)
        },
        "divider",
        ...options.map(
          (o): MenuItem => ({
            label: o.title,
            checked: o.containsSong,
            action: () => addTrackToPlaylist(o.playlistId, o.title, track)
          })
        )
      ];
      return items;
    }
  };
}

export interface TrackMenuContext {
  // The playlist the row is shown in, when the user can edit it
  editablePlaylistId?: string;
  onRemoved?: (track: Track) => void;
  // The row is an upcoming song in the queue panel
  removeFromQueue?: () => void;
}

export function trackMenu(track: Track, ctx: TrackMenuContext = {}): MenuEntry[] {
  const liked = isLiked(track.videoId, track.liked ?? false);
  const entries: (MenuEntry | null)[] = [
    addToPlaylistItem(track),
    ctx.editablePlaylistId && track.setVideoId
      ? {
          label: "Remove from this playlist",
          icon: "trash",
          action: async () => {
            try {
              await removeFromPlaylist(ctx.editablePlaylistId!, track.videoId, track.setVideoId!);
              ctx.onRemoved?.(track);
              toast("Removed from playlist");
            } catch {
              toast("Couldn't remove from playlist");
            }
          }
        }
      : null,
    {
      label: liked ? "Remove from your Liked Songs" : "Save to your Liked Songs",
      icon: liked ? "check-circle" : "plus-circle",
      action: () => setLiked(track.videoId, !liked)
    },
    { label: "Add to queue", icon: "queue", action: () => enqueue({ videoId: track.videoId }, () => play(track.play)) },
    ctx.removeFromQueue ? { label: "Remove from queue", icon: "queue-remove", action: ctx.removeFromQueue } : null,
    "divider",
    {
      label: "Go to song radio",
      icon: "radio",
      action: () => play({ watchEndpoint: { videoId: track.videoId, playlistId: `RDAMVM${track.videoId}`, params: "wAEB" } })
    },
    artistItem(track.artists),
    track.album?.browseId ? { label: "Go to album", icon: "album", action: () => navigate({ name: "collection", id: track.album!.browseId! }) } : null,
    "divider",
    share("Copy Song Link", `${YTM}/watch?v=${track.videoId}`)
  ];
  return entries.filter((e): e is MenuEntry => e !== null);
}

const playlistIdOfCard = (c: Card): string | undefined => {
  const p = c.play as { watchEndpoint?: { playlistId?: string }; watchPlaylistEndpoint?: { playlistId?: string } } | undefined;
  return p?.watchPlaylistEndpoint?.playlistId ?? p?.watchEndpoint?.playlistId ?? (c.browse?.browseId.startsWith("VL") ? c.browse.browseId.slice(2) : undefined);
};

const inLibrary = (browseId?: string) => !!browseId && [...playlists.value, ...albums.value].some(c => c.browse?.browseId === browseId);

function libraryItem(playlistId: string, saved: boolean, onChange?: (saved: boolean) => void): MenuItem {
  return {
    label: saved ? "Remove from Your Library" : "Save to Your Library",
    icon: saved ? "check-circle" : "plus-circle",
    action: async () => {
      try {
        await savePlaylist(playlistId, !saved);
        toast(saved ? "Removed from Your Library" : "Saved to Your Library");
        onChange?.(!saved);
        refreshLibrary();
      } catch {
        toast("Couldn't update Your Library");
      }
    }
  };
}

// "Edit details" / "Delete" for the user's own playlists
const ownPlaylistItems = (playlist: OwnPlaylist): MenuItem[] => [
  { label: "Edit details", icon: "pencil", action: () => editDetails(playlist) },
  { label: "Delete", icon: "minus-circle", action: () => deleteOwnPlaylist(playlist) }
];

export function cardMenu(card: Card): MenuEntry[] {
  if (card.kind === "artist" && card.browse) return artistMenuFor(card.browse.browseId);
  if (card.kind === "podcast" && card.browse) return podcastMenu(card.browse.browseId.replace(/^MPSP/, ""));
  const episodeId = (card.play as { watchEndpoint?: { videoId?: string } } | undefined)?.watchEndpoint?.videoId;
  if (card.kind === "episode" && episodeId) return episodeMenu({ videoId: episodeId, play: card.play!, show: card.show });

  const videoId = (card.play as { watchEndpoint?: { videoId?: string } } | undefined)?.watchEndpoint?.videoId;
  if ((card.kind === "song" || card.kind === "video") && videoId) {
    return trackMenu({
      key: card.key,
      videoId,
      title: card.title,
      artists: [],
      duration: "",
      thumbs: card.thumbs,
      explicit: false,
      detail: "",
      play: card.play!
    });
  }

  const playlistId = playlistIdOfCard(card);
  const entries: (MenuEntry | null)[] = [
    playlistId && card.play ? { label: "Add to queue", icon: "queue", action: () => enqueue({ playlistId }, () => play(card.play!)) } : null,
    ...(playlistId && card.owned ? ownPlaylistItems({ playlistId, title: card.title, thumbs: card.thumbs, browseId: card.browse?.browseId }) : []),
    // Liked Songs is always in the library and can't be removed; own playlists are deleted instead
    playlistId && card.browse?.browseId !== "VLLM" && !card.owned ? libraryItem(playlistId, inLibrary(card.browse?.browseId)) : null,
    "divider",
    card.browse
      ? share(
          card.kind === "album" ? "Copy Album Link" : "Copy Playlist Link",
          card.kind === "album" ? `${YTM}/browse/${card.browse.browseId}` : `${YTM}/playlist?list=${playlistId ?? card.browse.browseId.replace(/^VL/, "")}`
        )
      : null
  ];
  return tidy(entries);
}

export function collectionMenu(page: CollectionPage, onSavedChange?: (saved: boolean) => void): MenuEntry[] {
  const pid = page.playlistId;
  return tidy([
    pid && page.play ? { label: "Add to queue", icon: "queue", action: () => enqueue({ playlistId: pid }, () => play(page.play!)) } : null,
    pid && page.id !== "VLLM" && !page.editable ? libraryItem(pid, page.saved, onSavedChange) : null,
    ...(pid && page.id !== "VLLM" && page.editable
      ? ownPlaylistItems({ playlistId: pid, title: page.title, description: page.description, thumbs: page.thumbs, browseId: page.id })
      : []),
    artistItem(page.artists),
    "divider",
    share(
      page.kind === "album" ? "Copy Album Link" : "Copy Playlist Link",
      page.kind === "album" ? `${YTM}/browse/${page.id}` : `${YTM}/playlist?list=${pid ?? page.id.replace(/^VL/, "")}`
    )
  ]);
}

function artistMenuFor(channelId: string, radio?: ArtistPage["radio"]): MenuEntry[] {
  const following = isFollowing(channelId);
  return tidy([
    { label: following ? "Unfollow" : "Follow", icon: following ? "check-circle" : "plus-circle", action: () => setFollowing(channelId, !following) },
    radio ? { label: "Go to artist radio", icon: "radio", action: () => play(radio) } : null,
    "divider",
    share("Copy link to artist", `${YTM}/channel/${channelId}`)
  ]);
}

export const artistMenu = (page: ArtistPage) => artistMenuFor(page.channelId, page.radio);

/** Spotify's episode menu; `show` is left out on the show's own page. */
export function episodeMenu(episode: Pick<Episode, "videoId" | "play" | "show">): MenuEntry[] {
  const { videoId } = episode;
  const saved = isSavedEpisode(videoId);
  const show = episode.show?.browseId;
  return tidy([
    {
      label: saved ? "Remove from Your Episodes" : "Add to Your Episodes",
      icon: saved ? "check-circle" : "plus-circle",
      action: () => setSavedEpisode(videoId, !saved)
    },
    { label: "Add to queue", icon: "queue", action: () => enqueue({ videoId }, () => play(episode.play)) },
    "divider",
    show ? { label: "Go to podcast", icon: "podcast", action: () => navigate({ name: "podcast", id: show }) } : null,
    "divider",
    share("Copy Episode Link", `${YTM}/watch?v=${videoId}`)
  ]);
}

export function podcastMenu(playlistId: string): MenuEntry[] {
  const follows = isFollowingPodcast(playlistId);
  return [
    { label: follows ? "Unfollow" : "Follow", icon: follows ? "check-circle" : "plus-circle", action: () => setFollowingPodcast(playlistId, !follows) },
    "divider",
    share("Copy Show Link", `${YTM}/playlist?list=${playlistId}`)
  ];
}

// Drop empty entries and dividers that would end up leading, trailing or doubled
function tidy(entries: (MenuEntry | null)[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of entries) {
    if (!e) continue;
    if (e === "divider" && (!out.length || out[out.length - 1] === "divider")) continue;
    out.push(e);
  }
  while (out[out.length - 1] === "divider") out.pop();
  return out;
}
