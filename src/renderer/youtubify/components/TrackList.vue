<script setup lang="ts">
// Spotify's track table: #, title (cover + artists), album, duration. Double-click or the hover
// play button starts the track inside its list so the rest of the list becomes the queue.
import { computed } from "vue";
import type { Track } from "../ytm/models";
import { isPlaying, togglePlay, track as current } from "../state/player";
import { navigate } from "../state/router";
import { playTrackInList } from "../ytm/client";
import Cover from "./Cover.vue";
import Icon from "./Icon.vue";

const props = withDefaults(
  defineProps<{
    tracks: Track[];
    listPlaylistId?: string;
    showAlbum?: boolean;
    showCover?: boolean;
    showHeader?: boolean;
    showIndex?: boolean;
    compact?: boolean;
    columns?: number;
  }>(),
  { listPlaylistId: undefined, showAlbum: true, showCover: true, showHeader: false, showIndex: true, compact: false, columns: 1 }
);

const isCurrent = (t: Track) => current.value?.id === t.videoId;

function playRow(t: Track, i: number) {
  if (isCurrent(t)) togglePlay();
  else playTrackInList(t, props.listPlaylistId, i);
}

const gridStyle = computed(() => (props.columns > 1 ? { gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))` } : {}));
</script>

<template>
  <div class="tracklist" :class="{ compact, 'no-album': !showAlbum || compact, 'no-index': !showIndex || compact }" :style="gridStyle" role="grid">
    <div v-if="showHeader && !compact" class="row head" role="row">
      <span class="idx">#</span>
      <span>Title</span>
      <span class="album">Album</span>
      <span class="dur"><Icon name="clock" :size="16" /></span>
    </div>
    <div v-for="(t, i) in tracks" :key="t.key" class="row" :class="{ current: isCurrent(t) }" role="row" @dblclick="playRow(t, i)">
      <span class="idx">
        <span class="num">
          <span v-if="isCurrent(t) && isPlaying" class="eq"><i /><i /><i /><i /></span>
          <template v-else>{{ i + 1 }}</template>
        </span>
        <button class="row-play" :aria-label="isCurrent(t) && isPlaying ? 'Pause' : `Play ${t.title}`" @click="playRow(t, i)">
          <Icon :name="isCurrent(t) && isPlaying ? 'pause' : 'play'" :size="16" />
        </button>
      </span>
      <span class="main">
        <span v-if="showCover" class="cover-wrap">
          <Cover :thumbs="t.thumbs" :size="compact ? 48 : 40" />
          <button v-if="compact" class="cover-play" :aria-label="`Play ${t.title}`" @click="playRow(t, i)">
            <Icon :name="isCurrent(t) && isPlaying ? 'pause' : 'play'" :size="20" />
          </button>
        </span>
        <span class="text">
          <span class="title ytf-ellipsis">{{ t.title }}</span>
          <span class="artists ytf-ellipsis">
            <span v-if="t.explicit" class="explicit">E</span>
            <template v-for="(a, ai) in t.artists" :key="ai">
              <span v-if="ai">, </span>
              <span :class="{ 'ytf-link': a.browseId }" @click.stop="a.browseId && navigate({ name: 'artist', id: a.browseId })">{{ a.name }}</span>
            </template>
          </span>
        </span>
      </span>
      <span class="album ytf-ellipsis">
        <span
          v-if="t.album"
          :class="{ 'ytf-link': t.album.browseId }"
          @click.stop="t.album.browseId && navigate({ name: 'collection', id: t.album.browseId })"
          >{{ t.album.name }}</span
        >
      </span>
      <span class="dur">{{ t.duration }}</span>
    </div>
  </div>
</template>

<style scoped>
.tracklist {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  column-gap: 8px;
}

.row {
  display: grid;
  grid-template-columns: 16px minmax(120px, 6fr) minmax(120px, 4fr) minmax(48px, auto);
  gap: 16px;
  align-items: center;
  height: 56px;
  padding: 0 16px;
  border-radius: 4px;
  color: var(--text-subdued);
  font-size: 14px;
}

.no-album .row {
  grid-template-columns: 16px minmax(120px, 1fr) minmax(48px, auto);
}

.no-album .row .album {
  display: none;
}

.no-index .row {
  grid-template-columns: minmax(120px, 1fr) minmax(48px, auto);
}

.no-index .row .idx {
  display: none;
}

.row.head {
  height: 36px;
  margin-bottom: 16px;
  border-bottom: 1px solid hsla(0, 0%, 100%, 0.1);
  border-radius: 0;
  font-size: 14px;
}

.row:not(.head):hover,
.row:not(.head):focus-within {
  background: var(--background-tinted-highlight);
}

.compact .row {
  height: 64px;
  padding: 0 8px;
}

.idx {
  position: relative;
  display: flex;
  justify-content: flex-end;
  font-variant-numeric: tabular-nums;
  font-size: 16px;
}

.row-play {
  display: none;
  color: var(--text-base);
}

.row:not(.head):hover .num {
  display: none;
}

.row:not(.head):hover .row-play {
  display: flex;
}

.main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.cover-wrap {
  position: relative;
  flex: none;
}

.cover-play {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-radius: 4px;
}

.row:hover .cover-play {
  display: flex;
}

.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.title {
  color: var(--text-base);
  font-size: 16px;
}

.current .title,
.current .num {
  color: var(--text-bright-accent);
}

.artists {
  font-size: 14px;
}

.row:hover .artists,
.row:hover .album {
  color: var(--text-base);
}

.explicit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  border-radius: 2px;
  background: hsla(0, 0%, 100%, 0.6);
  color: #000;
  font-size: 10.5px;
  font-weight: 700;
  vertical-align: 1px;
}

.dur {
  justify-self: end;
  font-variant-numeric: tabular-nums;
}

/* Spotify's animated equalizer for the playing row */
.eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.eq i {
  width: 3px;
  background: var(--essential-bright-accent);
  animation: eq 0.9s ease-in-out infinite;
}

.eq i:nth-child(2) {
  animation-delay: -0.3s;
}

.eq i:nth-child(3) {
  animation-delay: -0.6s;
}

.eq i:nth-child(4) {
  animation-delay: -0.15s;
}

@keyframes eq {
  0%,
  100% {
    height: 3px;
  }
  50% {
    height: 14px;
  }
}
</style>
