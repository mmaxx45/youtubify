<script setup lang="ts">
// A titled row of cards. Like Spotify it shows a single row of as many cards as fit; the title
// and "Show all" open the shelf's full page.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { Shelf } from "../ytm/models";
import { navigate, type Route } from "../state/router";
import { showAllRoute } from "../state/shelves";
import MediaCard from "./MediaCard.vue";
import TrackList from "./TrackList.vue";

// `to` overrides where "Show all" leads (the artist page's discography section)
const props = defineProps<{ shelf: Shelf; to?: Route }>();

// How many cards fit in the row, so "Show all" only appears when some are hidden
const grid = ref<HTMLElement | null>(null);
const columns = ref(Infinity);
const observer = new ResizeObserver(() => {
  if (grid.value) columns.value = getComputedStyle(grid.value).gridTemplateColumns.split(" ").length;
});
watch(grid, (el, old) => {
  if (old) observer.unobserve(old);
  if (el) observer.observe(el);
});
onBeforeUnmount(() => observer.disconnect());

// Track shelves show 8 rows in two columns
const hasMore = computed(() => !!props.shelf.more || props.shelf.cards.length > columns.value || props.shelf.tracks.length > 8);
const openAll = () => navigate(props.to ?? showAllRoute(props.shelf));
</script>

<template>
  <section class="shelf">
    <header>
      <div class="titles">
        <div v-if="shelf.strapline" class="strapline">{{ shelf.strapline }}</div>
        <h2 class="ytf-section-title">
          <a v-if="hasMore" class="title-link" role="link" tabindex="0" @click="openAll" @keydown.enter="openAll">{{ shelf.title }}</a>
          <template v-else>{{ shelf.title }}</template>
        </h2>
      </div>
      <button v-if="hasMore" class="show-all" @click="openAll">Show all</button>
    </header>
    <slot name="filters" />
    <div v-if="shelf.cards.length" ref="grid" class="grid">
      <MediaCard v-for="card in shelf.cards" :key="card.key" :card="card" />
    </div>
    <TrackList v-else :tracks="shelf.tracks.slice(0, 8)" compact :columns="2" />
  </section>
</template>

<style scoped>
.shelf {
  margin-bottom: 32px;
}

header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 0 12px;
  margin-bottom: 8px;
}

.strapline {
  color: var(--text-subdued);
  font-size: 14px;
  margin-bottom: 2px;
}

.title-link {
  color: inherit;
  cursor: pointer;
}

.title-link:hover {
  text-decoration: underline;
}

.show-all {
  flex: none;
  color: var(--text-subdued);
  font-size: 14px;
  font-weight: 700;
}

.show-all:hover {
  color: var(--text-base);
  text-decoration: underline;
}

/* One row of cards: extra rows collapse to zero height (the full list is on the Show all page) */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-template-rows: auto;
  grid-auto-rows: 0;
  overflow: hidden;
}
</style>
