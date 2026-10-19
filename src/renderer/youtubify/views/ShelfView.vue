<script setup lang="ts">
// Spotify's "Show all" page: the shelf title, then every item as a grid of cards (or a track
// table for song shelves). Artist discographies get Spotify's filter chips plus YTM's sort options.
import { computed, nextTick, ref, watch } from "vue";
import type { PageOption, ShelfPage } from "../ytm/models";
import { getShelfPage, getShelfPageMore } from "../ytm/client";
import { navigate } from "../state/router";
import { stashedShelf } from "../state/shelves";
import { openMenuAt } from "../state/menu";
import Icon from "../components/Icon.vue";
import MediaCard from "../components/MediaCard.vue";
import TrackList from "../components/TrackList.vue";

const props = defineProps<{ title: string; browseId?: string; params?: string; stash?: string }>();

const page = ref<ShelfPage | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");
const scroller = ref<HTMLElement | null>(null);
let request = 0;

const stashed = computed(() => stashedShelf(props.stash));
// Until the browse page arrives (or if there is none), show the shelf's own items
const cards = computed(() => page.value?.cards ?? stashed.value?.cards ?? []);
const tracks = computed(() => page.value?.tracks ?? stashed.value?.tracks ?? []);
const wide = computed(() => cards.value.some(c => c.wide));

// MPAD<channel id> pages are an artist's discography; the title links back to the artist
const artistId = computed(() => (props.browseId?.startsWith("MPAD") ? props.browseId.slice(4) : undefined));

async function load(target: Parameters<typeof getShelfPage>[0]) {
  const id = ++request;
  loading.value = true;
  error.value = "";
  try {
    const p = await getShelfPage(target);
    if (id !== request) return;
    // An empty response keeps the stashed items rather than blanking the page
    if (p.cards.length || p.tracks.length || !stashed.value) page.value = p;
    await nextTick();
    fillViewport();
  } catch (e) {
    if (id === request && !stashed.value) error.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (id === request) loading.value = false;
  }
}

const reload = () => props.browseId && load({ browseId: props.browseId, params: props.params });

watch(
  () => [props.browseId, props.params],
  () => {
    page.value = null;
    scroller.value?.scrollTo({ top: 0 });
    reload();
  },
  { immediate: true }
);

/* ---------------------------------------------------------------- filters and sort */

const filters = computed(() => page.value?.filters ?? []);
const selectedFilter = computed(() => filters.value.find(f => f.selected));

function pickFilter(f?: PageOption) {
  // "All" (or un-picking the selected chip) is the selected chip's deselect reload
  const token = f && !f.selected ? f.continuation : selectedFilter.value?.deselect;
  if (token) load({ continuation: token });
}

const sorts = computed(() => page.value?.sorts ?? []);
const sortLabel = computed(() => sorts.value.find(s => s.selected)?.label ?? sorts.value[0]?.label);

function openSort(e: MouseEvent) {
  openMenuAt(
    e.currentTarget as HTMLElement,
    sorts.value.map(s => ({ label: s.label, checked: s.selected, action: () => !s.selected && load({ continuation: s.continuation }) }))
  );
}

/* ---------------------------------------------------------------- endless scrolling */

async function loadMore() {
  const p = page.value;
  if (!p?.continuation || loadingMore.value || loading.value) return;
  loadingMore.value = true;
  const id = request;
  try {
    const more = await getShelfPageMore(p.continuation, p.cards.length + p.tracks.length);
    if (id !== request) return;
    p.cards.push(...more.cards);
    p.tracks.push(...more.tracks);
    p.continuation = more.continuation;
  } catch {
    p.continuation = undefined;
  } finally {
    loadingMore.value = false;
  }
  await nextTick();
  fillViewport();
}

function onScroll() {
  const el = scroller.value;
  if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 800) loadMore();
}

// Keep loading while the list doesn't fill the window yet (nothing to scroll)
const fillViewport = () => onScroll();
</script>

<template>
  <div ref="scroller" class="view" @scroll.passive="onScroll">
    <header>
      <h1>
        <a v-if="artistId" class="artist-link" role="link" tabindex="0" @click="navigate({ name: 'artist', id: artistId })">{{ title }}</a>
        <template v-else>{{ title || page?.title }}</template>
      </h1>
    </header>

    <div v-if="filters.length || sorts.length" class="controls">
      <div class="chips">
        <button v-if="filters.length" class="ytf-pill" :class="{ selected: !selectedFilter }" @click="pickFilter()">All</button>
        <button v-for="f in filters" :key="f.label" class="ytf-pill" :class="{ selected: f.selected }" @click="pickFilter(f)">{{ f.label }}</button>
      </div>
      <button v-if="sorts.length" class="sort" @click="openSort">
        {{ sortLabel }}
        <Icon name="chevron-right" :size="16" class="chevron" />
      </button>
    </div>

    <div class="content" :class="{ busy: loading && (cards.length || tracks.length) }">
      <div v-if="error" class="state">
        <p>Couldn't load this page. {{ error }}</p>
        <button class="ytf-pill" @click="reload">Try again</button>
      </div>
      <div v-else-if="cards.length" class="grid" :class="{ wide }">
        <MediaCard v-for="card in cards" :key="card.key" :card="card" />
      </div>
      <div v-else-if="tracks.length" class="tracks">
        <TrackList :tracks="tracks" show-header :show-album="tracks.some(t => t.album)" />
      </div>
      <div v-else-if="loading" class="grid">
        <div v-for="i in 12" :key="i" class="skeleton-card">
          <div class="ytf-skeleton cover" />
          <div class="ytf-skeleton line" />
        </div>
      </div>
      <p v-else class="state">Nothing here yet.</p>
      <div v-if="loadingMore" class="more ytf-skeleton" />
    </div>
  </div>
</template>

<style scoped>
.view {
  height: 100%;
  overflow-y: auto;
}

header {
  padding: 64px 24px 16px;
  background: linear-gradient(rgba(255, 255, 255, 0.07), transparent);
}

h1 {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.artist-link {
  color: inherit;
  cursor: pointer;
}

.artist-link:hover {
  text-decoration: underline;
}

.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 24px 16px;
}

.chips {
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.sort {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  color: var(--text-subdued);
  font-size: 14px;
}

.sort:hover {
  color: var(--text-base);
}

.chevron {
  transform: rotate(90deg);
}

.content {
  padding: 0 12px 32px;
  transition: opacity 0.2s;
}

.content.busy {
  opacity: 0.5;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}

.grid.wide {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.tracks {
  padding: 0 12px;
}

.skeleton-card {
  padding: 12px;
}

.skeleton-card .cover {
  aspect-ratio: 1;
  margin-bottom: 12px;
  border-radius: var(--radius-medium);
}

.skeleton-card .line {
  width: 70%;
  height: 14px;
}

.more {
  height: 48px;
  margin: 16px 12px 0;
}

.state {
  padding: 0 12px;
  color: var(--text-subdued);
}
</style>
