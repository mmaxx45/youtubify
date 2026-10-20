// Editing the user's own playlists like Spotify: "Edit details", "Delete" and dropping songs onto them.

import { shallowRef } from "vue";
import type { PlaylistOption, Thumb, Track } from "../ytm/models";
import { addToPlaylist, deletePlaylist, editPlaylistDetails, getCollection, getPlaylistOptions } from "../ytm/client";
import EditDetailsDialog from "../components/EditDetailsDialog.vue";
import { confirmDialog, openDialog } from "./dialog";
import { playlists, refreshLibrary } from "./library";
import { navigate, route } from "./router";
import { setLiked } from "./likes";
import { toast } from "./toast";

export interface PlaylistDetailsChange {
  title?: string;
  description?: string;
}

/** A playlist the user owns, by its plain playlist id (no "VL" prefix). */
export interface OwnPlaylist {
  playlistId: string;
  title: string;
  // Unknown when opened from Your Library; the dialog loads it
  description?: string;
  thumbs: Thumb[];
  // Its page / Your Library id when known (otherwise "VL" + playlistId)
  browseId?: string;
}

// Latest saved change, so an open playlist page can show it without reloading
export const lastDetailsEdit = shallowRef<({ playlistId: string } & PlaylistDetailsChange) | null>(null);

// Latest song added to one of the user's playlists, so that playlist's open page can show it right away
export const lastPlaylistAdd = shallowRef<{ playlistId: string; track: Track } | null>(null);

type AddResult = { playlistEditResults?: { playlistEditVideoAddedResultData?: { setVideoId?: string } }[] } | undefined;

/** Add a song to a playlist (menus and drag & drop). */
export async function addTrackToPlaylist(playlistId: string, track: Track, allowDuplicate = false) {
  const res = (await addToPlaylist(playlistId, track.videoId, allowDuplicate)) as AddResult;
  // Without a new entry id YTM skipped the song (already in there), so there's nothing new to show
  const setVideoId = res?.playlistEditResults?.[0]?.playlistEditVideoAddedResultData?.setVideoId;
  if (setVideoId) lastPlaylistAdd.value = { playlistId, track: { ...track, key: `added-${setVideoId}`, setVideoId, detail: "" } };
}

const browseIdOf = (p: Pick<OwnPlaylist, "playlistId" | "browseId">) => p.browseId ?? `VL${p.playlistId}`;

async function saveDetails(playlist: OwnPlaylist, changes: PlaylistDetailsChange) {
  await editPlaylistDetails(playlist.playlistId, changes);
  lastDetailsEdit.value = { playlistId: playlist.playlistId, ...changes };
  // Rename the sidebar entry in place: a library refresh right away can still return the old name
  if (changes.title !== undefined)
    playlists.value = playlists.value.map(c => (c.browse?.browseId === browseIdOf(playlist) ? { ...c, title: changes.title! } : c));
}

export function editDetails(playlist: OwnPlaylist) {
  openDialog(EditDetailsDialog, {
    title: playlist.title,
    description: playlist.description,
    thumbs: playlist.thumbs,
    loadDescription: async () => (await getCollection(browseIdOf(playlist))).description,
    save: (changes: PlaylistDetailsChange) => saveDetails(playlist, changes)
  });
}

export async function deleteOwnPlaylist(playlist: Pick<OwnPlaylist, "playlistId" | "title" | "browseId">) {
  const ok = await confirmDialog({
    title: "Delete from Your Library?",
    message: ["This will delete ", { strong: playlist.title }, " from ", { strong: "Your Library" }, "."],
    confirmLabel: "Delete"
  });
  if (!ok) return;
  try {
    await deletePlaylist(playlist.playlistId);
  } catch {
    toast("Couldn't delete the playlist");
    return;
  }
  toast("Removed from Your Library");
  const browseId = browseIdOf(playlist);
  playlists.value = playlists.value.filter(c => c.browse?.browseId !== browseId);
  refreshLibrary();
  // The deleted playlist's page can't be shown any more
  const r = route.value;
  if (r.name === "collection" && r.id === browseId) navigate({ name: "home" }, true);
}

/** Drop a song onto a playlist in Your Library; asks first if it's already in there, like Spotify. */
export async function dropTrackOnPlaylist(browseId: string, title: string, track: Track) {
  if (browseId === "VLLM") return setLiked(track.videoId, true);
  const playlistId = browseId.replace(/^VL/, "");
  const options = await getPlaylistOptions(track.videoId).catch((): PlaylistOption[] => []);
  const duplicate = options.some(o => o.playlistId === playlistId && o.containsSong);
  if (duplicate) {
    const add = await confirmDialog({
      title: "Already added",
      message: ["This is already in your ", { strong: title }, " playlist."],
      confirmLabel: "Add anyway",
      cancelLabel: "Don't add"
    });
    if (!add) return;
  }
  try {
    await addTrackToPlaylist(playlistId, track, duplicate);
    toast(`Added to ${title}`);
  } catch {
    toast(`Couldn't add to ${title}`);
  }
}
