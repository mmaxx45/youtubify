<script setup lang="ts">
// Spotify's home: filter chips, a grid of quick-access tiles, then rows of cards.
import { computed, onMounted, ref, watch } from "vue";
import type { Card, HomePage } from "../ytm/models";
import { getHome, getHomeMore, play } from "../ytm/client";
import { pickThumb } from "../ytm/parse";
import { averageColor } from "../format";
import { open } from "../state/router";
import { isPlaying, playlistId, togglePlay } from "../state/player";
import { openMenu } from "../state/menu";
import { cardMenu } from "../menus";
import Cover from "../components/Cover.vue";
import Icon from "../components/Icon.vue";
import Shelf from "../components/Shelf.vue";

const props = defineProps<{ chip?: string }>();
const emit = defineEmits<{ (e: "chip", params?: string): void }>();

const page = ref<HomePage | null>(null);
const error = ref("");
const loadingMore = ref(false);
const tint = ref("rgb(83, 83, 83)");
const scroller = ref<HTMLElement | null>(null);

async function load() {
  error.value = "";
  page.value = null;
  try {
    page.value = await getHome(props.chip);
    const first = tiles.value[0];
    if (first) averageColor(pickThumb(first.thumbs, 64)).then(c => c && (tint.value = c));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(load);
watch(() => props.chip, load);

// The first card shelf ("Listen again") becomes the tile grid, like Spotify's recents
const tiles = computed(() => (page.value?.shelves[0]?.cards ?? []).slice(0, 8));
const shelves = computed(() => (page.value ? (tiles.value.length ? page.value.shelves.slice(1) : page.value.shelves) : []));

const tilePlaylistId = (c: Card) => {
  const p = c.play as { watchPlaylistEndpoint?: { playlistId?: string }; watchEndpoint?: { playlistId?: string } } | undefined;
  return p?.watchPlaylistEndpoint?.playlistId ?? p?.watchEndpoint?.playlistId ?? (c.browse?.browseId.startsWith("VL") ? c.browse.browseId.slice(2) : "");
};
const tileCurrent = (c: Card) => !!playlistId.value && !!tilePlaylistId(c) && playlistId.value.endsWith(tilePlaylistId(c));

function playTile(c: Card) {
  if (tileCurrent(c)) togglePlay();
  else if (c.play) play(c.play);
}

const openTile = (c: Card) => (c.browse ? open(c.browse) : playTile(c));

// Spotify re-tints the header with the hovered tile's artwork
async function hoverTile(c: Card) {
  const color = await averageColor(pickThumb(c.thumbs, 64));
  if (color) tint.value = color;
}

async function onScroll() {
  const el = scroller.value;
  if (!el || !page.value?.continuation || loadingMore.value) return;
  if (el.scrollTop + el.clientHeight < el.scrollHeight - 800) return;
  loadingMore.value = true;
  try {
    const more = await getHomeMore(page.value.continuation, page.value.shelves.length);
    page.value.shelves.push(...more.shelves);
    page.value.continuation = more.continuation;
  } catch {
    page.value.continuation = undefined;
  } finally {
    loadingMore.value = false;
  }
}

const selectedChip = computed(() => props.chip);
</script>

<template>
  <div ref="scroller" class="view" :style="{ '--tint': tint }" @scroll.passive="onScroll">
    <div class="gradient" />
    <div class="chips">
      <button class="ytf-pill" :class="{ selected: !selectedChip }" @click="emit('chip', undefined)">All</button>
      <button
        v-for="c in page?.chips ?? []"
        :key="c.label"
        class="ytf-pill"
        :class="{ selected: c.params && c.params === selectedChip }"
        @click="emit('chip', c.params === selectedChip ? undefined : c.params)"
      >
        {{ c.label }}
      </button>
    </div>

    <div class="content">
      <div v-if="error" class="error">
        <p>Couldn't load YouTube Music. {{ error }}</p>
        <button class="ytf-pill" @click="load">Try again</button>
      </div>

      <template v-else-if="!page">
        <div class="tiles">
          <div v-for="i in 8" :key="i" class="tile ytf-skeleton" />
        </div>
      </template>

      <template v-else>
        <div v-if="tiles.length" class="tiles">
          <div
            v-for="c in tiles"
            :key="c.key"
            class="tile"
            role="button"
            tabindex="0"
            @click="openTile(c)"
            @keydown.enter="openTile(c)"
            @mouseenter="hoverTile(c)"
            @contextmenu="openMenu($event, cardMenu(c))"
          >
            <Cover :thumbs="c.thumbs" :size="48" :radius="0" :round="false" :liked="c.browse?.browseId === 'VLLM'" />
            <span class="tile-title ytf-clamp-2" :class="{ playing: tileCurrent(c) }">{{ c.title }}</span>
            <span v-if="tileCurrent(c) && isPlaying" class="tile-eq"><Icon name="volume-high" :size="16" /></span>
            <button
              v-if="c.play"
              class="ytf-play-button tile-play"
              :class="{ visible: tileCurrent(c) && isPlaying }"
              :aria-label="`Play ${c.title}`"
              @click.stop="playTile(c)"
            >
              <Icon :name="tileCurrent(c) && isPlaying ? 'pause' : 'play'" :size="16" />
            </button>
          </div>
        </div>
        <Shelf v-for="s in shelves" :key="s.key" :shelf="s" />
        <div v-if="loadingMore" class="more ytf-skeleton" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.view {
  position: relative;
  height: 100%;
  overflow-y: auto;
  container-type: inline-size;
}

.gradient {
  position: absolute;
  inset: 0 0 auto;
  height: 332px;
  background: linear-gradient(var(--tint), var(--background-base));
  opacity: 0.6;
  transition: background 0.6s;
  pointer-events: none;
}

.chips {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  overflow-x: auto;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.content {
  position: relative;
  padding: 0 12px 32px;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 0 12px;
  margin-bottom: 32px;
}

@container (max-width: 760px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.tile {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding-right: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: hsla(0, 0%, 100%, 0.07);
  cursor: pointer;
  transition: background-color 0.3s;
}

.tile:hover {
  background: hsla(0, 0%, 100%, 0.2);
}

.tile :deep(.cover) {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.tile-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.tile-title.playing {
  color: var(--text-bright-accent);
}

.tile-eq {
  color: var(--essential-bright-accent);
}

.tile-play {
  width: 32px;
  height: 32px;
  opacity: 0;
  transition: opacity 0.3s;
}

.tile:hover .tile-play,
.tile-play.visible {
  opacity: 1;
}

.tile:hover .tile-eq {
  display: none;
}

.error {
  padding: 24px 12px;
  color: var(--text-subdued);
}

.more {
  height: 240px;
  margin: 0 12px;
}
</style>
