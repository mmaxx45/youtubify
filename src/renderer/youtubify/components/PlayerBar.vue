<script setup lang="ts">
// Spotify's "now playing bar": track info left, transport + progress centre, volume/panels right.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import * as player from "../state/player";
import { back, navigate, route } from "../state/router";
import { isLiked, toggleLiked } from "../state/likes";
import { openMenu } from "../state/menu";
import { trackMenu } from "../menus";
import { formatTime } from "../format";
import { isSavedEpisode, playingEpisode, setSavedEpisode, showOf } from "../state/podcasts";
import Cover from "./Cover.vue";
import Icon from "./Icon.vue";
import Slider from "./Slider.vue";

const props = defineProps<{ rightPanel: "nowplaying" | "queue" | null }>();
const emit = defineEmits<{ (e: "toggle-panel", panel: "nowplaying" | "queue"): void }>();

const { track, isPlaying, duration, progress, volume, muted, repeatMode, shuffled } = player;
// Our own like store wins over YTM's status, which isn't refreshed when liking through the API
const liked = computed(() => isLiked(track.value?.id, player.liked.value));
const like = () => track.value && toggleLiked(track.value.id, player.liked.value);
const onMenu = (e: MouseEvent) => player.currentAsTrack.value && openMenu(e, trackMenu(player.currentAsTrack.value));
const lyricsOpen = computed(() => route.value.name === "lyrics");
const toggleLyrics = () => (lyricsOpen.value ? back() : navigate({ name: "lyrics" }));
const previewTime = ref<number | null>(null);
const shownTime = computed(() => previewTime.value ?? progress.value);

// Episodes: title opens the episode, the byline its show (when we know it), skip ±15s like Spotify
const episodeShow = computed(() => (playingEpisode.value ? showOf(track.value?.id) : undefined));
const episodeSaved = computed(() => !!track.value && isSavedEpisode(track.value.id));
function openTitle() {
  const t = track.value;
  if (!t) return;
  if (playingEpisode.value) navigate({ name: "episode", id: `MPED${t.id}` });
  else if (t.albumId) navigate({ name: "collection", id: t.albumId });
}
function openByline() {
  const t = track.value;
  if (episodeShow.value?.browseId) navigate({ name: "podcast", id: episodeShow.value.browseId });
  else if (t?.channelId) navigate({ name: "artist", id: t.channelId });
}
const skip = (seconds: number) => player.seek(Math.min(Math.max(0, progress.value + seconds), duration.value || Infinity));

const volumeIcon = computed(() => (muted.value || volume.value === 0 ? "volume-off" : volume.value < 50 ? "volume-low" : "volume-high"));
const artistName = computed(() => episodeShow.value?.name ?? track.value?.author ?? "");

// Space toggles play/pause unless the user is typing
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement;
  if (e.code !== "Space" || el.closest("input, textarea, [contenteditable]")) return;
  e.preventDefault();
  player.togglePlay();
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <footer class="bar">
    <div class="left">
      <template v-if="track">
        <button class="art" aria-label="Now playing view" @click="emit('toggle-panel', 'nowplaying')">
          <Cover :thumbs="track.thumbnails" :size="56" />
        </button>
        <div class="meta" @contextmenu="onMenu">
          <span class="title ytf-ellipsis" :class="{ 'ytf-link': track.albumId || playingEpisode }" @click="openTitle">{{ track.title }}</span>
          <span class="artist ytf-ellipsis" :class="{ 'ytf-link': track.channelId || episodeShow }" @click="openByline">{{ artistName }}</span>
        </div>
        <button
          v-if="playingEpisode"
          class="ytf-icon-button like"
          :class="{ active: episodeSaved }"
          :aria-label="episodeSaved ? 'Remove from Your Episodes' : 'Add to Your Episodes'"
          :title="episodeSaved ? 'Remove from Your Episodes' : 'Add to Your Episodes'"
          @click="setSavedEpisode(track.id, !episodeSaved)"
        >
          <Icon :name="episodeSaved ? 'check-circle' : 'plus-circle'" :size="16" />
        </button>
        <button
          v-else
          class="ytf-icon-button like"
          :class="{ active: liked }"
          :aria-label="liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'"
          :title="liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'"
          @click="like"
        >
          <Icon :name="liked ? 'check-circle' : 'plus-circle'" :size="16" />
        </button>
      </template>
    </div>

    <div class="center">
      <div class="controls">
        <button v-if="playingEpisode" class="ytf-icon-button" title="Skip back 15 seconds" aria-label="Skip back 15 seconds" @click="skip(-15)">
          <Icon name="skip-back-15" :size="16" />
        </button>
        <button v-else class="ytf-icon-button" :class="{ active: shuffled }" title="Shuffle" aria-label="Shuffle" :disabled="!track" @click="player.shuffle()">
          <Icon name="shuffle" :size="16" />
          <span v-if="shuffled" class="dot" />
        </button>
        <button class="ytf-icon-button" title="Previous" aria-label="Previous" :disabled="!track" @click="player.previous()">
          <Icon name="previous" :size="16" />
        </button>
        <button class="play" :aria-label="isPlaying ? 'Pause' : 'Play'" :title="isPlaying ? 'Pause' : 'Play'" :disabled="!track" @click="player.togglePlay()">
          <Icon :name="isPlaying ? 'pause' : 'play'" :size="16" />
        </button>
        <button class="ytf-icon-button" title="Next" aria-label="Next" :disabled="!track" @click="player.next()">
          <Icon name="next" :size="16" />
        </button>
        <button v-if="playingEpisode" class="ytf-icon-button" title="Skip forward 15 seconds" aria-label="Skip forward 15 seconds" @click="skip(15)">
          <Icon name="skip-forward-15" :size="16" />
        </button>
        <button
          v-else
          class="ytf-icon-button"
          :class="{ active: repeatMode !== player.REPEAT.None }"
          :title="repeatMode === player.REPEAT.None ? 'Enable repeat' : repeatMode === player.REPEAT.All ? 'Enable repeat one' : 'Disable repeat'"
          aria-label="Repeat"
          :disabled="!track"
          @click="player.cycleRepeat()"
        >
          <Icon :name="repeatMode === player.REPEAT.One ? 'repeat-one' : 'repeat'" :size="16" />
          <span v-if="repeatMode !== player.REPEAT.None" class="dot" />
        </button>
      </div>
      <div class="progress">
        <span class="time">{{ formatTime(track ? shownTime : 0) }}</span>
        <Slider
          label="Change progress"
          :value="track ? progress : 0"
          :max="track ? duration : 0"
          @preview="previewTime = $event"
          @change="player.seek($event)"
        />
        <span class="time">{{ formatTime(track ? duration : 0) }}</span>
      </div>
    </div>

    <div class="right">
      <button class="ytf-icon-button" :class="{ active: lyricsOpen }" title="Lyrics" aria-label="Lyrics" :disabled="!track" @click="toggleLyrics">
        <Icon name="mic" :size="16" />
      </button>
      <button
        class="ytf-icon-button"
        :class="{ active: props.rightPanel === 'nowplaying' }"
        title="Now playing view"
        aria-label="Now playing view"
        @click="emit('toggle-panel', 'nowplaying')"
      >
        <Icon name="now-playing" :size="16" />
      </button>
      <button class="ytf-icon-button" :class="{ active: props.rightPanel === 'queue' }" title="Queue" aria-label="Queue" @click="emit('toggle-panel', 'queue')">
        <Icon name="queue" :size="16" />
      </button>
      <div class="volume">
        <button class="ytf-icon-button" :title="muted ? 'Unmute' : 'Mute'" :aria-label="muted ? 'Unmute' : 'Mute'" @click="player.toggleMute()">
          <Icon :name="volumeIcon" :size="16" />
        </button>
        <Slider label="Change volume" :value="muted ? 0 : volume" :max="100" @change="player.setVolume($event)" />
      </div>
    </div>
  </footer>
</template>

<style scoped>
.bar {
  grid-area: bar;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--bar-height);
  padding: 0 8px;
}

.left {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 30%;
  min-width: 180px;
}

.art {
  border-radius: 4px;
  overflow: hidden;
}

.meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.title {
  font-size: 14px;
  color: var(--text-base);
}

.artist {
  font-size: 12px;
  color: var(--text-subdued);
}

.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 40%;
  max-width: 722px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.controls .ytf-icon-button {
  position: relative;
  width: 32px;
  height: 32px;
}

.dot {
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  border-radius: 50%;
  background: currentColor;
}

.play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--text-base);
  color: #000;
  transition: transform 0.1s;
}

.play:hover:not(:disabled) {
  transform: scale(1.06);
}

.play:disabled {
  opacity: 0.5;
}

.progress {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.time {
  min-width: 40px;
  color: var(--text-subdued);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.time:last-child {
  text-align: left;
}

.right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 30%;
  min-width: 180px;
}

.right > .ytf-icon-button {
  width: 32px;
  height: 32px;
}

.volume {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 125px;
}
</style>
