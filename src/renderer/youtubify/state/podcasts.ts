// Podcast state shared by the show/episode pages, menus and the player: followed shows, saved
// episodes ("Your Episodes") and which show an episode belongs to (the engine only reports the channel).

import { computed, reactive } from "vue";
import type { ArtistRef, Episode } from "../ytm/models";
import { followPodcast, saveEpisode } from "../ytm/client";
import { podcasts, refreshLibrary } from "./library";
import { session } from "./session";
import { track } from "./player";
import { toast } from "./toast";

// VideoType.PodcastEpisode in main/player-state-store
const PODCAST_EPISODE = 3;
export const playingEpisode = computed(() => track.value?.videoType === PODCAST_EPISODE);

const shows = reactive(new Map<string, ArtistRef>());
export function rememberShows(episodes: Episode[]) {
  for (const e of episodes) if (e.show?.browseId) shows.set(e.videoId, e.show);
}
export const showOf = (videoId: string | undefined) => (videoId ? shows.get(videoId) : undefined);

// Both actions change the YouTube account, which needs a signed-in session
function needsLogin(what: string) {
  if (session.value?.loggedIn) return false;
  toast(`Log in to ${what}`);
  return true;
}

const following = reactive(new Map<string, boolean>());
export const seedFollowPodcast = (playlistId: string, follows: boolean) => !following.has(playlistId) && following.set(playlistId, follows);
export const isFollowingPodcast = (playlistId: string) => following.get(playlistId) ?? podcasts.value.some(c => c.browse?.browseId === `MPSP${playlistId}`);

export async function setFollowingPodcast(playlistId: string, follow: boolean) {
  if (needsLogin("follow podcasts")) return;
  const before = following.get(playlistId);
  following.set(playlistId, follow);
  try {
    await followPodcast(playlistId, follow);
    toast(follow ? "Added to Your Library" : "Removed from Your Library");
    refreshLibrary();
  } catch {
    if (before === undefined) following.delete(playlistId);
    else following.set(playlistId, before);
    toast("Couldn't update Your Library");
  }
}

const saved = reactive(new Map<string, boolean>());
export const seedSavedEpisode = (videoId: string, isSaved: boolean) => !saved.has(videoId) && saved.set(videoId, isSaved);
export const isSavedEpisode = (videoId: string) => saved.get(videoId) ?? false;

export async function setSavedEpisode(videoId: string, save: boolean) {
  if (needsLogin("save episodes")) return;
  const before = saved.get(videoId);
  saved.set(videoId, save);
  try {
    // Undoing within seconds can be refused (403) until YTM has caught up with the first change; try once more
    await saveEpisode(videoId, save).catch(() => new Promise(r => setTimeout(r, 2000)).then(() => saveEpisode(videoId, save)));
    toast(save ? "Added to Your Episodes" : "Removed from Your Episodes");
  } catch {
    if (before === undefined) saved.delete(videoId);
    else saved.set(videoId, before);
    toast("Couldn't update Your Episodes");
  }
}
