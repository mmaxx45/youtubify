<script setup lang="ts">
// Spotify's right sidebar: "Now playing" view and the queue.
import { computed, ref, watch } from "vue";
import * as player from "../state/player";
import { playlists } from "../state/library";
import { navigate } from "../state/router";
import { getArtist, getLyrics } from "../ytm/client";
import { isLiked, toggleLiked } from "../state/likes";
import { openMenu } from "../state/menu";
import { trackMenu } from "../menus";
import type { ArtistPage } from "../ytm/models";
import Cover from "./Cover.vue";
import Icon from "./Icon.vue";

const props = defineProps<{ mode: "nowplaying" | "queue" }>();
const emit = defineEmits<{ (e: "close"): void; (e: "mode", mode: "nowplaying" | "queue"): void }>();

const { track, upNext, queueItems, queueIndex } = player;
const liked = computed(() => isLiked(track.value?.id, player.liked.value));
const like = () => track.value && toggleLiked(track.value.id, player.liked.value);
const onMenu = (e: MouseEvent) => player.currentAsTrack.value && openMenu(e, trackMenu(player.currentAsTrack.value));

// Spotify's lyrics card: a preview of the first lines
const lyricsPreview = ref<string[]>([]);
watch(
  () => track.value?.id,
  async id => {
    lyricsPreview.value = [];
    if (!id) return;
    const lyrics = await getLyrics(id).catch(() => null);
    if (track.value?.id === id) lyricsPreview.value = (lyrics?.lines ?? []).filter(l => l.trim()).slice(0, 6);
  },
  { immediate: true }
);

// Context name: a library playlist if we know it, otherwise generic like Spotify's "Now playing"
const contextName = computed(() => {
  const id = player.playlistId.value;
  if (!id) return "Now playing";
  const match = playlists.value.find(p => p.browse && id.endsWith(p.browse.browseId.replace(/^VL/, "")));
  return match?.title ?? (id.startsWith("RD") ? "Mix" : "Now playing");
});

// "About the artist" comes from the artist's YTM page; cached per channel
const artistCache = new Map<string, Promise<ArtistPage | null>>();
const artist = ref<ArtistPage | null>(null);
watch(
  () => track.value?.channelId,
  async id => {
    artist.value = null;
    if (!id) return;
    if (!artistCache.has(id))
      artistCache.set(
        id,
        getArtist(id).catch(() => null)
      );
    const page = await artistCache.get(id)!;
    if (track.value?.channelId === id) artist.value = page;
  },
  { immediate: true }
);

const nextItem = computed(() => upNext.value[0]);
const current = computed(() => queueItems.value[queueIndex.value]);
</script>

<template>
  <aside class="panel">
    <header>
      <h2 class="ytf-ellipsis">{{ props.mode === "queue" ? "Queue" : contextName }}</h2>
      <button class="ytf-icon-button close" aria-label="Close" title="Close" @click="emit('close')">
        <Icon name="close" :size="16" />
      </button>
    </header>

    <div v-if="!track" class="empty">Play something to see it here.</div>

    <div v-else-if="props.mode === 'nowplaying'" class="scroll">
      <Cover :thumbs="track.thumbnails" :size="400" :radius="8" class="hero" />
      <div class="track" @contextmenu="onMenu">
        <div class="names">
          <div class="title ytf-ellipsis" :class="{ 'ytf-link': track.albumId }" @click="track.albumId && navigate({ name: 'collection', id: track.albumId })">
            {{ track.title }}
          </div>
          <div class="artist ytf-ellipsis ytf-link" @click="navigate({ name: 'artist', id: track.channelId })">{{ track.author }}</div>
        </div>
        <button class="ytf-icon-button" :class="{ active: liked }" :aria-label="liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'" @click="like">
          <Icon :name="liked ? 'check-circle' : 'plus-circle'" :size="24" />
        </button>
      </div>

      <section v-if="artist" class="card about" @click="navigate({ name: 'artist', id: artist.id })">
        <div
          class="about-img"
          :style="{ backgroundImage: artist.thumbs.length ? `url(${artist.thumbs[Math.min(1, artist.thumbs.length - 1)].url})` : undefined }"
        >
          <span>About the artist</span>
        </div>
        <div class="about-body">
          <div class="about-name">{{ artist.name }}</div>
          <div v-if="artist.subscribers" class="about-meta">{{ artist.subscribers }}</div>
          <p v-if="artist.description" class="about-desc">{{ artist.description }}</p>
        </div>
      </section>

      <section v-if="lyricsPreview.length" class="card lyrics">
        <div class="lyrics-head">
          <span>Lyrics</span>
          <button class="open-queue" @click="navigate({ name: 'lyrics' })">Show lyrics</button>
        </div>
        <p v-for="(line, i) in lyricsPreview" :key="i">{{ line }}</p>
      </section>

      <section v-if="nextItem" class="card next">
        <div class="next-head">
          <span>Next in queue</span>
          <button class="open-queue" @click="emit('mode', 'queue')">Open queue</button>
        </div>
        <button class="qrow" @click="player.playQueueIndex(nextItem.index)">
          <Cover :thumbs="nextItem.item.thumbnails" :size="48" />
          <span class="qtext">
            <span class="qtitle ytf-ellipsis">{{ nextItem.item.title }}</span>
            <span class="qartist ytf-ellipsis">{{ nextItem.item.author }}</span>
          </span>
        </button>
      </section>
    </div>

    <div v-else class="scroll queue">
      <h3>Now playing</h3>
      <div v-if="current" class="qrow playing">
        <Cover :thumbs="current.thumbnails" :size="48" />
        <span class="qtext">
          <span class="qtitle ytf-ellipsis">{{ current.title }}</span>
          <span class="qartist ytf-ellipsis">{{ current.author }}</span>
        </span>
      </div>
      <h3 v-if="upNext.length">Next from: {{ contextName }}</h3>
      <button v-for="{ item, index } in upNext.slice(0, 80)" :key="`${item.videoId}-${index}`" class="qrow" @click="player.playQueueIndex(index)">
        <Cover :thumbs="item.thumbnails" :size="48" />
        <span class="qtext">
          <span class="qtitle ytf-ellipsis">{{ item.title }}</span>
          <span class="qartist ytf-ellipsis">{{ item.author }}</span>
        </span>
        <span class="qdur">{{ item.duration }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  grid-area: right;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: var(--radius-large);
  background: var(--background-base);
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 16px 8px;
}

h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.close:hover {
  background: var(--background-elevated-highlight);
}

.empty {
  padding: 16px;
  color: var(--text-subdued);
  font-size: 14px;
}

.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.hero {
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 1;
  margin-top: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.track {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
}

.names {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.artist {
  color: var(--text-subdued);
  font-size: 16px;
}

.card {
  margin-bottom: 16px;
  border-radius: var(--radius-large);
  background: var(--background-elevated-base);
  overflow: hidden;
}

.about {
  cursor: pointer;
}

.about-img {
  position: relative;
  height: 220px;
  background: #282828 center / cover no-repeat;
}

.about-img span {
  position: absolute;
  top: 16px;
  left: 16px;
  font-weight: 700;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
}

.about-body {
  padding: 16px;
}

.about-name {
  font-size: 16px;
  font-weight: 700;
}

.about-meta {
  margin-top: 4px;
  color: var(--text-subdued);
  font-size: 14px;
}

.about-desc {
  margin: 12px 0 0;
  color: var(--text-subdued);
  font-size: 14px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lyrics {
  padding: 16px;
  background: linear-gradient(160deg, #6b4b8a, #3b2a55);
}

.lyrics-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 700;
}

.lyrics p {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.5;
}

.next {
  padding: 16px;
}

.next-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 700;
}

.open-queue {
  color: var(--text-subdued);
  font-size: 14px;
  font-weight: 700;
}

.open-queue:hover {
  color: var(--text-base);
  text-decoration: underline;
}

.queue h3 {
  margin: 16px 0 8px;
  font-size: 16px;
  font-weight: 700;
}

.qrow {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px;
  border-radius: 4px;
  text-align: left;
}

.qrow:hover {
  background: var(--background-tinted-highlight);
}

.qtext {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.qtitle {
  font-size: 16px;
}

.playing .qtitle {
  color: var(--text-bright-accent);
}

.qartist,
.qdur {
  color: var(--text-subdued);
  font-size: 14px;
}
</style>
