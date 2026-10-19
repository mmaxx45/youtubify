<script setup lang="ts">
// A titled row of cards. Like Spotify it shows a single row of as many cards as fit, and
// "Show all" opens the full grid.
import { ref } from "vue";
import type { Shelf } from "../ytm/models";
import MediaCard from "./MediaCard.vue";
import TrackList from "./TrackList.vue";

defineProps<{ shelf: Shelf }>();
const expanded = ref(false);
</script>

<template>
  <section class="shelf">
    <header>
      <div class="titles">
        <div v-if="shelf.strapline" class="strapline">{{ shelf.strapline }}</div>
        <h2 class="ytf-section-title">{{ shelf.title }}</h2>
      </div>
      <button v-if="shelf.cards.length > 4" class="show-all" @click="expanded = !expanded">{{ expanded ? "Show less" : "Show all" }}</button>
    </header>
    <div v-if="shelf.cards.length" class="grid" :class="{ expanded }">
      <MediaCard v-for="card in shelf.cards" :key="card.key" :card="card" />
    </div>
    <TrackList v-else :tracks="shelf.tracks.slice(0, expanded ? undefined : 8)" compact :columns="2" />
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

/* One row of cards: extra rows collapse to zero height until "Show all" */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-template-rows: auto;
  grid-auto-rows: 0;
  overflow: hidden;
}

.grid.expanded {
  grid-auto-rows: auto;
}
</style>
