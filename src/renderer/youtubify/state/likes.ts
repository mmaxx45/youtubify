// Liked status for any song, so every row and the player bar show Spotify's green check.
// Seeded from YTM responses (rows carry their like status) and the player; updated optimistically.

import { reactive } from "vue";
import type { Track } from "../ytm/models";
import { rateSong } from "../ytm/client";
import { toast } from "./toast";

const status = reactive(new Map<string, boolean>());

export function seedLikes(tracks: Track[]) {
  for (const t of tracks) if (t.liked !== undefined && !status.has(t.videoId)) status.set(t.videoId, t.liked);
}

/** Known status, else the fallback (e.g. the engine's status for the playing song). */
export const isLiked = (videoId: string | undefined, fallback = false) => (videoId && status.has(videoId) ? status.get(videoId)! : fallback);

export async function setLiked(videoId: string, like: boolean) {
  const before = status.get(videoId);
  status.set(videoId, like);
  try {
    await rateSong(videoId, like);
    toast(like ? "Added to Liked Songs" : "Removed from Liked Songs");
  } catch {
    if (before === undefined) status.delete(videoId);
    else status.set(videoId, before);
    toast("Couldn't update Liked Songs");
  }
}

export const toggleLiked = (videoId: string, fallback = false) => setLiked(videoId, !isLiked(videoId, fallback));
