<script setup lang="ts">
// Spotify's search: "Browse all" tiles when empty, otherwise Top result + Songs, then rows.
import { computed, ref, watch } from "vue";
import type { BrowseGroup, SearchPage, Track } from "../ytm/models";
import { getMoods, play, search } from "../ytm/client";
import { navigate, open } from "../state/router";
import { isPlaying, togglePlay, track as current } from "../state/player";
import Cover from "../components/Cover.vue";
import Icon from "../components/Icon.vue";
import MediaCard from "../components/MediaCard.vue";
import TrackList from "../components/TrackList.vue";

const props = defineProps<{ query: string }>();

const result = ref<SearchPage | null>(null);
const loading = ref(false);
const error = ref("");
const moods = ref<BrowseGroup[]>([]);

const RECENTS_KEY = "ytf.recentSearches";
const readRecents = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const recents = ref<string[]>(readRecents());
function remember(q: string) {
  recents.value = [q, ...recents.value.filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, 10);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.value));
  } catch {
    // storage unavailable; recents just won't persist
  }
}

watch(
  () => props.query,
  async q => {
    error.value = "";
    if (!q) {
      result.value = null;
      if (!moods.value.length) moods.value = await getMoods().catch(() => []);
      return;
    }
    loading.value = true;
    try {
      const r = await search(q);
      if (props.query !== q) return;
      result.value = r;
      remember(q);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (props.query === q) loading.value = false;
    }
  },
  { immediate: true }
);

const top = computed(() => result.value?.top);
const topType = computed(() => {
  const k = top.value?.card.kind;
  return k === "artist" ? "Artist" : k === "album" ? "Album" : k === "playlist" ? "Playlist" : k === "video" ? "Video" : "Song";
});
const topIsCurrent = computed(() => {
  const vid = (top.value?.card.play as { watchEndpoint?: { videoId?: string } } | undefined)?.watchEndpoint?.videoId;
  return !!vid && current.value?.id === vid;
});
function playTop() {
  if (topIsCurrent.value) togglePlay();
  else if (top.value?.card.play) play(top.value.card.play);
  else open(top.value?.card.browse);
}
// Songs next to the top result: the top card's own tracks first, then song results
const songs = computed<Track[]>(() => {
  const seen = new Set<string>();
  return [...(top.value?.tracks ?? []), ...(result.value?.songs ?? [])].filter(t => !seen.has(t.videoId) && seen.add(t.videoId)).slice(0, 4);
});
</script>

<template>
  <div class="view">
    <template v-if="!query">
      <section v-if="recents.length" class="block">
        <h2 class="ytf-section-title">Recent searches</h2>
        <div class="recents">
          <button v-for="r in recents" :key="r" class="ytf-pill" @click="navigate({ name: 'search', query: r })">
            <Icon name="search" :size="16" />
            {{ r }}
          </button>
        </div>
      </section>
      <section v-for="g in moods" :key="g.title" class="block">
        <h2 class="ytf-section-title">{{ g.title || "Browse all" }}</h2>
        <div class="browse">
          <button
            v-for="t in g.tiles"
            :key="t.key"
            class="genre"
            :style="{ '--tile': t.color }"
            @click="navigate({ name: 'category', id: t.browseId, params: t.params, title: t.label })"
          >
            <span>{{ t.label }}</span>
          </button>
        </div>
      </section>
    </template>

    <div v-else-if="error" class="state">
      <p>Search failed. {{ error }}</p>
    </div>

    <div v-else-if="loading && !result" class="state">
      <div class="top-skeleton ytf-skeleton" />
    </div>

    <template v-else-if="result">
      <div v-if="top || songs.length" class="top-row">
        <section v-if="top" class="top">
          <h2 class="ytf-section-title">Top result</h2>
          <div class="top-card" role="button" tabindex="0" @click="top.card.browse ? open(top.card.browse) : playTop()">
            <Cover :thumbs="top.card.thumbs" :size="92" :round="top.card.round" :radius="6" />
            <div class="top-title ytf-ellipsis">{{ top.card.title }}</div>
            <div class="top-sub">
              <span class="ytf-ellipsis">{{ top.card.subtitle.split(" • ").slice(1).join(" • ") || top.card.subtitle }}</span>
              <span class="type-pill">{{ topType }}</span>
            </div>
            <button
              v-if="top.card.play || top.card.browse"
              class="ytf-play-button top-play"
              :class="{ visible: topIsCurrent && isPlaying }"
              aria-label="Play"
              @click.stop="playTop"
            >
              <Icon :name="topIsCurrent && isPlaying ? 'pause' : 'play'" :size="24" />
            </button>
          </div>
        </section>
        <section v-if="songs.length" class="songs">
          <h2 class="ytf-section-title">Songs</h2>
          <TrackList :tracks="songs" :show-album="false" :show-index="false" />
        </section>
      </div>

      <section v-if="result.artists.length" class="block cards">
        <h2 class="ytf-section-title">Artists</h2>
        <div class="row">
          <MediaCard v-for="c in result.artists" :key="c.key" :card="c" />
        </div>
      </section>
      <section v-if="result.albums.length" class="block cards">
        <h2 class="ytf-section-title">Albums</h2>
        <div class="row">
          <MediaCard v-for="c in result.albums" :key="c.key" :card="c" />
        </div>
      </section>
      <section v-if="result.playlists.length" class="block cards">
        <h2 class="ytf-section-title">Playlists</h2>
        <div class="row">
          <MediaCard v-for="c in result.playlists" :key="c.key" :card="c" />
        </div>
      </section>
      <p v-if="!top && !songs.length && !result.artists.length && !result.albums.length && !result.playlists.length" class="state">
        No results found for "{{ query }}".
      </p>
    </template>
  </div>
</template>

<style scoped>
.view {
  height: 100%;
  overflow-y: auto;
  padding: 24px 24px 32px;
  container-type: inline-size;
}

.block {
  margin-bottom: 32px;
}

.block > h2 {
  margin-bottom: 16px;
}

.cards > h2 {
  margin-left: 0;
}

.recents {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.browse {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.genre {
  position: relative;
  /* YTM's stripe colours are pastel; deepen them so white text reads like Spotify's tiles */
  background-color: color-mix(in srgb, var(--tile) 62%, #000);
  aspect-ratio: 16 / 9;
  padding: 16px;
  border-radius: var(--radius-large);
  overflow: hidden;
  text-align: left;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  transition: transform 0.15s;
}

/* Spotify's tilted art block in the corner of each genre tile */
.genre::after {
  content: "";
  position: absolute;
  right: -14px;
  bottom: -6px;
  width: 42%;
  aspect-ratio: 1;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 4px;
  transform: rotate(25deg);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.genre:hover {
  transform: scale(1.02);
}

.top-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: 24px;
  margin-bottom: 32px;
}

@container (max-width: 760px) {
  .top-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

.top > h2,
.songs > h2 {
  margin-bottom: 16px;
}

.top-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  border-radius: var(--radius-large);
  background: hsla(0, 0%, 100%, 0.07);
  cursor: pointer;
  transition: background-color 0.3s;
}

.top-card:hover {
  background: hsla(0, 0%, 100%, 0.1);
}

.top-card :deep(.cover) {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  margin-bottom: 12px;
}

.top-title {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.top-sub {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-subdued);
  font-size: 14px;
}

.type-pill {
  flex: none;
  padding: 4px 12px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.2);
  color: var(--text-base);
  font-size: 14px;
  font-weight: 700;
}

.top-play {
  position: absolute;
  right: 20px;
  bottom: 20px;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 0.3s,
    transform 0.3s;
}

.top-card:hover .top-play,
.top-play.visible {
  opacity: 1;
  transform: none;
}

.row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: 0;
  grid-template-rows: auto;
  overflow: hidden;
  margin: 0 -12px;
}

.state {
  color: var(--text-subdued);
}

.top-skeleton {
  height: 240px;
}
</style>
