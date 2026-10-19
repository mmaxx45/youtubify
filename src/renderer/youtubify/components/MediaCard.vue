<script setup lang="ts">
// Spotify's square card: cover, title, subtitle, green play button sliding up on hover.
import { computed } from "vue";
import type { Card } from "../ytm/models";
import { open } from "../state/router";
import { isPlaying, playlistId, togglePlay } from "../state/player";
import { play } from "../ytm/client";
import { openMenu } from "../state/menu";
import { cardMenu } from "../menus";
import Cover from "./Cover.vue";
import Icon from "./Icon.vue";

const props = defineProps<{ card: Card }>();

const cardPlaylistId = computed(() => {
  const p = props.card.play as { watchEndpoint?: { playlistId?: string }; watchPlaylistEndpoint?: { playlistId?: string } } | undefined;
  return (
    p?.watchPlaylistEndpoint?.playlistId ??
    p?.watchEndpoint?.playlistId ??
    (props.card.browse?.browseId.startsWith("VL") ? props.card.browse.browseId.slice(2) : undefined)
  );
});
// "Playing from" this card: YTM reports the queue's playlist, which may carry an RDAMPL/radio prefix
const isCurrent = computed(() => !!cardPlaylistId.value && !!playlistId.value && playlistId.value.endsWith(cardPlaylistId.value));

function onPlay() {
  if (isCurrent.value) togglePlay();
  else if (props.card.play) play(props.card.play);
}

function onOpen() {
  if (props.card.browse) open(props.card.browse);
  else onPlay();
}
</script>

<template>
  <div
    class="card"
    :class="{ wide: card.wide }"
    role="button"
    tabindex="0"
    @click="onOpen"
    @keydown.enter="onOpen"
    @contextmenu="openMenu($event, cardMenu(card))"
  >
    <div class="art">
      <Cover :thumbs="card.thumbs" :size="card.wide ? 320 : 180" :round="card.round" :wide="card.wide" :radius="6" class="cover" />
      <button
        v-if="card.play"
        class="ytf-play-button play"
        :class="{ visible: isCurrent && isPlaying }"
        :aria-label="isCurrent && isPlaying ? 'Pause' : 'Play'"
        @click.stop="onPlay"
      >
        <Icon :name="isCurrent && isPlaying ? 'pause' : 'play'" :size="24" />
      </button>
    </div>
    <div class="title ytf-ellipsis" :class="{ playing: isCurrent }">{{ card.title }}</div>
    <div class="subtitle ytf-clamp-2">{{ card.subtitle }}</div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 12px;
  border-radius: var(--radius-medium);
  cursor: pointer;
  transition: background-color 0.3s;
}

.card:hover {
  background: var(--background-tinted-highlight);
}

.art {
  position: relative;
  margin-bottom: 8px;
}

.art .cover {
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 1;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.card.wide .art .cover {
  aspect-ratio: 16 / 9;
}

.play {
  position: absolute;
  right: 8px;
  bottom: 8px;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 0.3s,
    transform 0.3s,
    background-color 0.1s;
}

.card:hover .play,
.play.visible {
  opacity: 1;
  transform: none;
}

.play:hover {
  transform: scale(1.04) !important;
}

.title {
  font-size: 16px;
  line-height: 1.4;
}

.title.playing {
  color: var(--text-bright-accent);
}

.subtitle {
  margin-top: 2px;
  color: var(--text-subdued);
  font-size: 14px;
  line-height: 1.4;
}
</style>
