<script setup lang="ts">
// Spotify's episode row: cover, title, description, then date • duration with progress and actions.
import { computed } from "vue";
import type { Episode } from "../ytm/models";
import { play } from "../ytm/client";
import { isPlaying, togglePlay, track } from "../state/player";
import { navigate, open } from "../state/router";
import { openMenu, openMenuAt } from "../state/menu";
import { isSavedEpisode, setSavedEpisode } from "../state/podcasts";
import { episodeMenu } from "../menus";
import Cover from "./Cover.vue";
import Icon from "./Icon.vue";

// showShow: name the show under the title (lists that mix shows)
const props = withDefaults(defineProps<{ episode: Episode; showShow?: boolean }>(), { showShow: false });

const isCurrent = computed(() => track.value?.id === props.episode.videoId);
const saved = computed(() => isSavedEpisode(props.episode.videoId));
const menu = () => episodeMenu(props.showShow ? props.episode : { ...props.episode, show: undefined });
const openMore = (e: MouseEvent) => openMenuAt(e.currentTarget as HTMLElement, menu());

function onPlay() {
  if (isCurrent.value) togglePlay();
  else play(props.episode.play);
}
</script>

<template>
  <div
    class="episode"
    :class="{ current: isCurrent }"
    role="button"
    tabindex="0"
    @click="open(episode.browse)"
    @keydown.enter="open(episode.browse)"
    @contextmenu="openMenu($event, menu())"
  >
    <Cover :thumbs="episode.thumbs" :size="112" :radius="8" letterbox class="cover" />
    <div class="body">
      <div class="title ytf-clamp-2">{{ episode.title }}</div>
      <div v-if="showShow && episode.show" class="show ytf-ellipsis">
        <span :class="{ 'ytf-link': episode.show.browseId }" @click.stop="episode.show.browseId && navigate({ name: 'podcast', id: episode.show.browseId })">{{
          episode.show.name
        }}</span>
      </div>
      <p v-if="episode.description" class="description ytf-clamp-2">{{ episode.description }}</p>
      <div class="bottom">
        <div class="meta">
          <span v-if="episode.played" class="played"><Icon name="check-circle" :size="16" /> Played</span>
          <span v-if="episode.date">{{ episode.date }}</span>
          <span v-if="episode.date && (episode.progressText || episode.duration)">•</span>
          <span>{{ episode.progressText || episode.duration }}</span>
          <span v-if="episode.progressText" class="progress"><i :style="{ width: `${episode.progress}%` }" /></span>
        </div>
        <div class="actions">
          <button
            class="ytf-icon-button"
            :class="{ active: saved }"
            :title="saved ? 'Remove from Your Episodes' : 'Add to Your Episodes'"
            :aria-label="saved ? 'Remove from Your Episodes' : 'Add to Your Episodes'"
            @click.stop="setSavedEpisode(episode.videoId, !saved)"
          >
            <Icon :name="saved ? 'check-circle' : 'plus-circle'" :size="24" />
          </button>
          <button class="ytf-icon-button" :title="`More options for ${episode.title}`" aria-label="More options" @click.stop="openMore">
            <Icon name="more" :size="24" />
          </button>
          <button class="play" :aria-label="isCurrent && isPlaying ? 'Pause' : `Play ${episode.title}`" @click.stop="onPlay">
            <Icon :name="isCurrent && isPlaying ? 'pause' : 'play'" :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.episode {
  position: relative;
  display: flex;
  gap: 16px;
  padding: 16px;
  border-radius: var(--radius-large);
  cursor: pointer;
}

/* Spotify's hairline between rows that disappears around the hovered one */
.episode::after {
  content: "";
  position: absolute;
  left: 16px;
  right: 16px;
  top: 0;
  border-top: 1px solid hsla(0, 0%, 100%, 0.1);
}

.episode:hover {
  background: var(--background-tinted-highlight);
}

.episode:hover::after,
.episode:hover + .episode::after {
  border-color: transparent;
}

.cover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 6px;
}

.title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}

.current .title {
  color: var(--text-bright-accent);
}

.show {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-base);
}

.description {
  margin: 0;
  color: var(--text-subdued);
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-line;
}

.bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: auto;
  padding-top: 6px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-subdued);
  font-size: 14px;
  white-space: nowrap;
}

.played {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--essential-bright-accent);
}

.progress {
  position: relative;
  width: 80px;
  height: 4px;
  margin-left: 4px;
  border-radius: 2px;
  background: hsla(0, 0%, 100%, 0.3);
  overflow: hidden;
}

.progress i {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--text-base);
}

.actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.actions .ytf-icon-button {
  opacity: 0;
}

.episode:hover .actions .ytf-icon-button,
.actions .ytf-icon-button.active,
.actions .ytf-icon-button:focus-visible {
  opacity: 1;
}

/* Spotify's white circle play button on episode rows */
.play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--text-base);
  color: #000;
  transition: transform 0.1s;
}

.play:hover {
  transform: scale(1.06);
}
</style>
