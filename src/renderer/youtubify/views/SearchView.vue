<script setup lang="ts">
// Spotify's search: "Browse all" tiles when empty, otherwise filter chips over either the "All"
// overview (Top result + Songs, then rows) or the full, endlessly scrolling list of one result type.
import { computed, nextTick, ref, watch } from "vue";
import type { BrowseGroup, Card, SearchFilter, SearchPage, SearchResults, Track } from "../ytm/models";
import { getMoods, play, search, searchFiltered, searchMore } from "../ytm/client";
import { navigate, open } from "../state/router";
import { isPlaying, togglePlay, track as current } from "../state/player";
import Cover from "../components/Cover.vue";
import Icon from "../components/Icon.vue";
import MediaCard from "../components/MediaCard.vue";
import TrackList from "../components/TrackList.vue";

const props = defineProps<{ query: string; filter?: SearchFilter }>();

const chips: { label: string; filter?: SearchFilter }[] = [
  { label: "All" },
  { label: "Songs", filter: "songs" },
  { label: "Artists", filter: "artists" },
  { label: "Albums", filter: "albums" },
  { label: "Playlists", filter: "playlists" },
  { label: "Podcasts", filter: "podcasts" },
  { label: "Videos", filter: "videos" },
  { label: "Profiles", filter: "profiles" }
];
const setFilter = (filter?: SearchFilter) => navigate({ name: "search", query: props.query, filter });

const scroller = ref<HTMLElement | null>(null);
const result = ref<SearchPage | null>(null);
// Results of the selected filter, tagged with it so another type's list is never shown
type Filtered = SearchResults & { filter: SearchFilter };
const filtered = ref<Filtered | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");
const moods = ref<BrowseGroup[]>([]);

// Recent results stay cached (with the pages loaded so far), so chip switches and back/forward are instant
const cache = new Map<string, SearchPage | Filtered>();
const cacheKey = (q: string, f?: SearchFilter) => `${f ?? "all"}:${q}`;
function store(key: string, value: SearchPage | Filtered) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
}
function show(value: SearchPage | Filtered, f?: SearchFilter) {
  if (f) filtered.value = value as Filtered;
  else result.value = value as SearchPage;
}

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

const isCurrentSearch = (q: string, f?: SearchFilter) => props.query === q && props.filter === f;

watch(
  () => [props.query, props.filter] as const,
  async ([q, f], old) => {
    error.value = "";
    if (old) scroller.value?.scrollTo({ top: 0 });
    if (!q) {
      result.value = null;
      filtered.value = null;
      if (!moods.value.length) moods.value = await getMoods().catch(() => []);
      return;
    }
    const key = cacheKey(q, f);
    const hit = cache.get(key);
    if (hit) {
      show(hit, f);
      loading.value = false;
      remember(q);
      nextTick(loadMore);
      return;
    }
    // Typing keeps the old results up until the new ones arrive; a different type starts blank
    if (old && old[1] !== f) {
      if (f) filtered.value = null;
      else result.value = null;
    }
    loading.value = true;
    try {
      const r = f ? { ...(await searchFiltered(q, f)), filter: f } : await search(q);
      store(key, r);
      if (!isCurrentSearch(q, f)) return;
      show(r, f);
      remember(q);
      nextTick(loadMore);
    } catch (e) {
      if (isCurrentSearch(q, f)) error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (isCurrentSearch(q, f)) loading.value = false;
    }
  },
  { immediate: true }
);

// Filtered lists continue as you scroll (and right away while they don't fill the view yet)
async function loadMore() {
  const el = scroller.value;
  const page = filtered.value;
  if (!el || !props.filter || page?.filter !== props.filter || !page.continuation || loadingMore.value) return;
  if (el.scrollTop + el.clientHeight < el.scrollHeight - 800) return;
  loadingMore.value = true;
  try {
    const more = await searchMore(page.continuation, page.tracks.length + page.cards.length);
    // Later pages can repeat earlier results
    const videoIds = new Set(page.tracks.map(t => t.videoId));
    const browseIds = new Set(page.cards.map(c => c.browse?.browseId));
    page.tracks.push(...more.tracks.filter(t => !videoIds.has(t.videoId)));
    page.cards.push(...more.cards.filter(c => !c.browse || !browseIds.has(c.browse.browseId)));
    page.continuation = more.continuation;
  } catch {
    page.continuation = undefined;
  } finally {
    loadingMore.value = false;
  }
  nextTick(loadMore);
}

const filterTracks = computed(() => props.filter === "songs" || props.filter === "videos");
const filterEmpty = computed(() => !!filtered.value && !filtered.value.tracks.length && !filtered.value.cards.length);

const top = computed(() => result.value?.top);
const topTypes: Partial<Record<Card["kind"], string>> = {
  artist: "Artist",
  album: "Album",
  playlist: "Playlist",
  video: "Video",
  podcast: "Podcast",
  episode: "Podcast episode"
};
const topType = computed(() => topTypes[top.value?.card.kind ?? "song"] ?? "Song");
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
  <div ref="scroller" class="view" @scroll.passive="loadMore">
    <div v-if="query" class="chips" role="tablist" aria-label="Filter results">
      <button
        v-for="c in chips"
        :key="c.label"
        class="ytf-pill"
        :class="{ selected: c.filter === filter }"
        role="tab"
        :aria-selected="c.filter === filter"
        @click="setFilter(c.filter)"
      >
        {{ c.label }}
      </button>
    </div>

    <div class="content" :class="{ 'with-chips': query }">
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

      <template v-else-if="filter">
        <div v-if="!filtered" :class="filterTracks ? 'skeleton-rows' : 'grid'">
          <div v-for="i in 10" :key="i" class="ytf-skeleton" :class="filterTracks ? 'skeleton-row' : 'skeleton-card'" />
        </div>
        <div v-else-if="filterEmpty" class="empty">
          <h2>No results found for "{{ query }}"</h2>
          <p>Please make sure your words are spelled correctly, or use fewer or different keywords.</p>
        </div>
        <TrackList v-else-if="filterTracks" class="table" :tracks="filtered.tracks" :show-album="filter === 'songs'" show-header />
        <div v-else class="grid">
          <MediaCard v-for="c in filtered.cards" :key="c.key" :card="c" />
        </div>
      </template>

      <div v-else-if="loading && !result" class="state">
        <div class="top-skeleton ytf-skeleton" />
      </div>

      <template v-else-if="result">
        <div v-if="top || songs.length" class="top-row">
          <section v-if="top" class="top">
            <h2 class="ytf-section-title">Top result</h2>
            <div class="top-card" role="button" tabindex="0" @click="top.card.browse ? open(top.card.browse) : playTop()">
              <Cover :thumbs="top.card.thumbs" :size="92" :round="top.card.round" :radius="6" :letterbox="top.card.kind === 'episode'" />
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
            <h2 class="ytf-section-title"><button class="heading-link" @click="setFilter('songs')">Songs</button></h2>
            <TrackList :tracks="songs" :show-album="false" :show-index="false" />
          </section>
        </div>

        <section v-if="result.artists.length" class="block cards">
          <h2 class="ytf-section-title"><button class="heading-link" @click="setFilter('artists')">Artists</button></h2>
          <div class="row">
            <MediaCard v-for="c in result.artists" :key="c.key" :card="c" />
          </div>
        </section>
        <section v-if="result.albums.length" class="block cards">
          <h2 class="ytf-section-title"><button class="heading-link" @click="setFilter('albums')">Albums</button></h2>
          <div class="row">
            <MediaCard v-for="c in result.albums" :key="c.key" :card="c" />
          </div>
        </section>
        <section v-if="result.playlists.length" class="block cards">
          <h2 class="ytf-section-title"><button class="heading-link" @click="setFilter('playlists')">Playlists</button></h2>
          <div class="row">
            <MediaCard v-for="c in result.playlists" :key="c.key" :card="c" />
          </div>
        </section>
        <p v-if="!top && !songs.length && !result.artists.length && !result.albums.length && !result.playlists.length" class="state">
          No results found for "{{ query }}".
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.view {
  --chips-height: 56px;
  height: 100%;
  overflow-y: auto;
  container-type: inline-size;
}

/* Spotify's filter chips stay pinned to the top of the results */
.chips {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
  height: var(--chips-height);
  padding: 12px 24px;
  background: var(--background-base);
  overflow-x: auto;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chips .ytf-pill {
  flex: none;
}

.content {
  padding: 24px 24px 32px;
}

.content.with-chips {
  padding-top: 8px;
}

/* The table header sticks under the chips, like Spotify's */
.table :deep(.row.head) {
  position: sticky;
  top: var(--chips-height);
  z-index: 1;
  margin: 0 -24px 16px;
  padding: 0 40px;
  background: var(--background-base);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  margin: 0 -12px;
}

.skeleton-rows {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skeleton-row {
  height: 40px;
}

.skeleton-card {
  aspect-ratio: 3 / 4;
  margin: 12px;
}

.empty {
  padding: 64px 0;
  text-align: center;
}

.empty h2 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 12px;
}

.empty p {
  color: var(--text-subdued);
  font-size: 16px;
}

.heading-link {
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
}

.heading-link:hover {
  text-decoration: underline;
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
