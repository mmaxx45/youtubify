// Live mirror of the hidden YouTube Music player, pushed from main/player-state-store.

import { computed, ref, shallowRef } from "vue";
import type { Thumb, Track } from "../ytm/models";
import { clearQueue, command, moveInQueue, removeFromQueue } from "../ytm/client";

// Mirrors the PlayerState shape from main/player-state-store (sent as plain JSON over IPC).
export interface EngineQueueItem {
  thumbnails: Thumb[];
  title: string;
  author: string;
  duration: string;
  selected: boolean;
  videoId: string;
}

export interface EngineState {
  videoDetails: {
    title: string;
    author: string;
    album: string;
    albumId: string;
    channelId: string;
    durationSeconds: number;
    thumbnails: Thumb[];
    id: string;
    likeStatus: number;
    videoType: number;
  } | null;
  playlistId: string;
  trackState: number;
  queue: {
    items: EngineQueueItem[];
    automixItems: EngineQueueItem[];
    repeatMode: number;
    selectedItemIndex: number;
  } | null;
  videoProgress: number;
  volume: number;
  muted: boolean;
  adPlaying: boolean;
}

// VideoState / RepeatMode / LikeStatus values from player-state-store
const PLAYING = 1;
const BUFFERING = 2;
export const REPEAT = { None: 0, All: 1, One: 2 } as const;
const LIKE = 2;

const state = shallowRef<EngineState | null>(null);
// Local position while dragging/seeking, so the bar doesn't jump back before YTM catches up
const seekingTo = ref<number | null>(null);
// YTM's shuffle is a one-off reshuffle of the queue; remember it to light the button like Spotify
export const shuffled = ref(false);

let started = false;
export function startPlayerSync() {
  if (started) return;
  started = true;
  window.ytf.getPlayerState().then(s => s && (state.value = s as EngineState));
  window.ytf.onPlayerState(s => {
    const prev = state.value;
    state.value = s as EngineState;
    if (prev?.playlistId && prev.playlistId !== state.value.playlistId) shuffled.value = false;
    if (seekingTo.value !== null && Math.abs(state.value.videoProgress - seekingTo.value) < 2) seekingTo.value = null;
  });
}

export const engine = state;
export const track = computed(() => (state.value?.videoDetails?.id ? state.value.videoDetails : null));
export const isPlaying = computed(() => state.value?.trackState === PLAYING || state.value?.trackState === BUFFERING);
export const isBuffering = computed(() => state.value?.trackState === BUFFERING);
export const duration = computed(() => track.value?.durationSeconds ?? 0);
export const progress = computed(() => seekingTo.value ?? state.value?.videoProgress ?? 0);
export const volume = computed(() => state.value?.volume ?? 100);
export const muted = computed(() => state.value?.muted ?? false);
export const repeatMode = computed(() => state.value?.queue?.repeatMode ?? REPEAT.None);
export const liked = computed(() => track.value?.likeStatus === LIKE);
export const playlistId = computed(() => state.value?.playlistId ?? "");
export const adPlaying = computed(() => state.value?.adPlaying ?? false);

export const queueItems = computed(() => [...(state.value?.queue?.items ?? []), ...(state.value?.queue?.automixItems ?? [])]);
export const queueIndex = computed(() => state.value?.queue?.selectedItemIndex ?? -1);
export const upNext = computed(() => {
  const i = queueIndex.value;
  return queueItems.value.slice(i + 1).map((item, n) => ({ item, index: i + 1 + n }));
});
// Real queue entries come first in queueItems; YTM's autoplay suggestions after them can be
// removed but not reordered
export const queueItemCount = computed(() => state.value?.queue?.items?.length ?? 0);

// Queue edits only ever touch songs after the current one; the engine pushes the new queue
export function removeQueueItem(index: number): Promise<boolean> {
  const item = queueItems.value[index];
  return item && index > queueIndex.value ? removeFromQueue(index, item.videoId) : Promise.resolve(false);
}
export function moveQueueItem(index: number, to: number): Promise<boolean> {
  const item = queueItems.value[index];
  const movable = (i: number) => i > queueIndex.value && i < queueItemCount.value;
  return item && movable(index) && movable(to) ? moveInQueue(index, to, item.videoId) : Promise.resolve(false);
}
export const clearUpNext = () => clearQueue();

export const togglePlay = () => command("playPause");
export const next = () => command("next");
// Spotify restarts the song when past the first few seconds, otherwise goes back
export const previous = () => (progress.value > 3 ? seek(0) : command("previous"));
export const seek = (seconds: number) => {
  seekingTo.value = seconds;
  command("seekTo", seconds);
};
export const setVolume = (v: number) => {
  command("setVolume", Math.round(v));
  if (muted.value && v > 0) command("unmute");
};
export const toggleMute = () => command(muted.value ? "unmute" : "mute");
export const toggleLike = () => command("toggleLike");
export const cycleRepeat = () => {
  const nextMode = repeatMode.value === REPEAT.None ? "ALL" : repeatMode.value === REPEAT.All ? "ONE" : "NONE";
  command("repeatMode", nextMode);
};
export const shuffle = () => {
  command("shuffle");
  shuffled.value = true;
};
export const playQueueIndex = (index: number) => command("playQueueIndex", index);

/** The playing song in the same shape as list tracks, for menus (add to playlist, radio, ...). */
export const currentAsTrack = computed<Track | null>(() => {
  const t = track.value;
  if (!t) return null;
  return {
    key: `now-${t.id}`,
    videoId: t.id,
    title: t.title,
    artists: [{ name: t.author, browseId: t.channelId || undefined }],
    album: t.albumId ? { name: t.album, browseId: t.albumId } : undefined,
    duration: "",
    thumbs: t.thumbnails,
    explicit: false,
    detail: "",
    play: { watchEndpoint: { videoId: t.id } },
    liked: t.likeStatus === LIKE
  };
});
