<script setup lang="ts">
// Spotify's track table: #, title (cover + artists), album, duration. Double-click or the hover
// play button starts the track inside its list so the rest of the list becomes the queue.
import { computed, watch } from "vue";
import type { Track } from "../ytm/models";
import { isPlaying, togglePlay, track as current } from "../state/player";
import { navigate, open } from "../state/router";
import { playTrackInList } from "../ytm/client";
import { isLiked, seedLikes, toggleLiked } from "../state/likes";
import { openMenu, openMenuAt } from "../state/menu";
import { trackMenu } from "../menus";
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
    // Set when the list is a playlist the user owns, enabling "Remove from this playlist"
    editablePlaylistId?: string;
  }>(),
  { listPlaylistId: undefined, editablePlaylistId: undefined, showAlbum: true, showCover: true, showHeader: false, showIndex: true, compact: false, columns: 1 }
);

const emit = defineEmits<{ (e: "removed", track: Track): void }>();

const isCurrent = (t: Track) => current.value?.id === t.videoId;
const liked = (t: Track) => isLiked(t.videoId, t.liked ?? false);

watch(() => props.tracks, seedLikes, { immediate: true });

const openMore = (e: MouseEvent, t: Track) => openMenuAt(e.currentTarget as HTMLElement, menuFor(t));

const menuFor = (t: Track) => trackMenu(t, { editablePlaylistId: props.editablePlaylistId, onRemoved: removed => emit("removed", removed) });

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
    <div
      v-for="(t, i) in tracks"
      :key="t.key"
      class="row"
      :class="{ current: isCurrent(t) }"
      role="row"
      @dblclick="playRow(t, i)"
      @contextmenu="openMenu($event, menuFor(t))"
    >
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
          <span class="title ytf-ellipsis">
            <span v-if="t.page" class="ytf-link" @click.stop="open(t.page)">{{ t.title }}</span>
            <template v-else>{{ t.title }}</template>
          </span>
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
      <span class="dur">
        <button
          class="like"
          :class="{ on: liked(t) }"
          :aria-label="liked(t) ? 'Remove from Liked Songs' : 'Save to Liked Songs'"
          :title="liked(t) ? 'Remove from Liked Songs' : 'Save to Liked Songs'"
          @click.stop="toggleLiked(t.videoId, t.liked ?? false)"
        >
          <Icon :name="liked(t) ? 'check-circle' : 'plus-circle'" :size="16" />
        </button>
        <span class="time">{{ t.duration }}</span>
        <button class="more" :aria-label="`More options for ${t.title}`" title="More options" @click.stop="openMore($event, t)">
          <Icon name="more" :size="16" />
        </button>
      </span>
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
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  justify-self: end;
  font-variant-numeric: tabular-nums;
}

.head .dur {
  padding-right: 28px;
}

.time {
  min-width: 36px;
  text-align: right;
}

/* Spotify's like button: plus on hover, green check once saved */
.like,
.more {
  display: flex;
  color: var(--text-subdued);
  opacity: 0;
  transition: transform 0.1s;
}

.like:hover,
.more:hover {
  color: var(--text-base);
  transform: scale(1.04);
}

.like.on {
  opacity: 1;
  color: var(--essential-bright-accent);
}

.row:hover .like,
.row:hover .more,
.row:focus-within .like,
.row:focus-within .more {
  opacity: 1;
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
