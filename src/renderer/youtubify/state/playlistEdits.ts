// Editing the user's own playlists like Spotify: "Edit details", "Delete" and dropping songs onto them.

import { shallowRef } from "vue";
import type { Thumb, Track } from "../ytm/models";
import { addToPlaylist, AlreadyInPlaylist, createPlaylist, deletePlaylist, editPlaylistDetails, getCollection } from "../ytm/client";
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

/** Add a song to a playlist (menus and drag & drop); asks first if it's already in there, like Spotify. */
export async function addTrackToPlaylist(playlistId: string, title: string, track: Track) {
  const add = async (allowDuplicate: boolean) => {
    const res = (await addToPlaylist(playlistId, track.videoId, allowDuplicate)) as AddResult;
    const setVideoId = res?.playlistEditResults?.[0]?.playlistEditVideoAddedResultData?.setVideoId;
    if (setVideoId) lastPlaylistAdd.value = { playlistId, track: { ...track, key: `added-${setVideoId}`, setVideoId, detail: "" } };
    toast(`Added to ${title}`);
  };
  try {
    await add(false);
  } catch (e) {
    if (!(e instanceof AlreadyInPlaylist)) return toast(`Couldn't add to ${title}`);
    const again = await confirmDialog({
      title: "Already added",
      message: ["This is already in your ", { strong: title }, " playlist."],
      confirmLabel: "Add anyway",
      cancelLabel: "Don't add"
    });
    if (again) await add(true).catch(() => toast(`Couldn't add to ${title}`));
  }
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

// YTM needs a few seconds before a new playlist can be loaded; opening it right away shows an empty page.
// The dialog keeps showing "saving" meanwhile.
async function whenReady(browseId: string) {
  for (let i = 0; i < 12; i++) {
    const page = await getCollection(browseId).catch((): null => null);
    if (page?.title) return;
    await new Promise(r => setTimeout(r, 1000));
  }
}

/** Spotify-style Create: ask for the name (and description) first, create the playlist on save and open it. */
export function createPlaylistDialog(suggestedTitle: string, videoIds: string[] = [], thumbs: Thumb[] = []) {
  openDialog(EditDetailsDialog, {
    title: suggestedTitle,
    description: "",
    thumbs,
    isNew: true,
    save: async (details: PlaylistDetailsChange) => {
      const id = await createPlaylist(details.title!, videoIds, details.description);
      await whenReady(id);
      toast(videoIds.length ? `Added to ${details.title}` : "Playlist created");
      await refreshLibrary();
      navigate({ name: "collection", id });
    }
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

/** Drop a song onto a playlist in Your Library. */
export async function dropTrackOnPlaylist(browseId: string, title: string, track: Track) {
  if (browseId === "VLLM") return setLiked(track.videoId, true);
  await addTrackToPlaylist(browseId.replace(/^VL/, ""), title, track);
}
