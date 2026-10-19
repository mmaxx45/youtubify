<script setup lang="ts">
// Spotify's "Your Library" pane backed by the user's YouTube Music library.
import { computed, nextTick, ref } from "vue";
import type { Card } from "../ytm/models";
import { albums, artists, error, loading, playlists, podcasts, refreshLibrary } from "../state/library";
import { navigate, open, route } from "../state/router";
import { createPlaylist } from "../ytm/client";
import { session, signIn } from "../state/session";
import { isPlaying, playlistId } from "../state/player";
import { openMenu } from "../state/menu";
import { cardMenu } from "../menus";
import Cover from "./Cover.vue";
import Icon from "./Icon.vue";

const props = defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ (e: "toggle-collapse"): void }>();

type Filter = "playlists" | "albums" | "artists" | "podcasts" | null;
const filter = ref<Filter>(null);
const query = ref("");
const searching = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
const sortAlpha = ref(false);

const isLiked = (c: Card) => c.browse?.browseId === "VLLM";

const typeLabel = (c: Card) => (c.kind === "artist" ? "Artist" : c.kind === "album" ? "Album" : c.kind === "podcast" ? "Podcast" : "Playlist");
const detail = (c: Card) => {
  if (c.kind === "artist") return "Artist";
  const owner = c.subtitle.split(" • ")[0];
  return isLiked(c) ? "Playlist" : `${typeLabel(c)}${owner ? ` • ${owner}` : ""}`;
};

const items = computed(() => {
  let list: Card[] =
    filter.value === "playlists"
      ? playlists.value
      : filter.value === "albums"
        ? albums.value
        : filter.value === "artists"
          ? artists.value
          : filter.value === "podcasts"
            ? podcasts.value
            : [...playlists.value, ...albums.value, ...artists.value, ...podcasts.value];
  const q = query.value.trim().toLowerCase();
  if (q) list = list.filter(c => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q));
  if (sortAlpha.value) list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  // Liked songs stays pinned on top like Spotify
  return [...list.filter(isLiked), ...list.filter(c => !isLiked(c))];
});

const chips = computed(() =>
  (
    [
      ["playlists", "Playlists", playlists.value.length],
      ["albums", "Albums", albums.value.length],
      ["artists", "Artists", artists.value.length],
      ["podcasts", "Podcasts", podcasts.value.length]
    ] as const
  ).filter(([, , n]) => n > 0)
);

const isActive = (c: Card) => {
  const r = route.value;
  return (r.name === "collection" || r.name === "artist" || r.name === "podcast") && r.id === c.browse?.browseId;
};
const isPlayingFrom = (c: Card) =>
  !!playlistId.value && !!c.browse && c.browse.browseId.startsWith("VL") && playlistId.value.endsWith(c.browse.browseId.slice(2));

const creating = ref(false);
async function create() {
  if (creating.value) return;
  creating.value = true;
  try {
    const id = await createPlaylist(`My Playlist #${playlists.value.length}`);
    await refreshLibrary();
    navigate({ name: "collection", id });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    creating.value = false;
  }
}

async function startSearch() {
  searching.value = true;
  await nextTick();
  searchInput.value?.focus();
}
</script>

<template>
  <nav class="library" :class="{ collapsed: props.collapsed }">
    <header>
      <button class="title" :title="props.collapsed ? 'Expand Your Library' : 'Collapse Your Library'" @click="emit('toggle-collapse')">
        <Icon :name="props.collapsed ? 'library' : 'library-filled'" :size="24" />
        <span v-if="!props.collapsed">Your Library</span>
      </button>
      <button v-if="!props.collapsed" class="create" title="Create playlist" :disabled="creating" @click="create">
        <Icon name="plus" :size="16" />
        <span>Create</span>
      </button>
    </header>

    <div v-if="!props.collapsed && chips.length" class="chips">
      <button v-if="filter" class="ytf-pill clear" aria-label="Clear filter" @click="filter = null">
        <Icon name="close" :size="16" />
      </button>
      <template v-for="[key, label] in chips" :key="key">
        <button v-if="!filter || filter === key" class="ytf-pill" :class="{ selected: filter === key }" @click="filter = filter === key ? null : key">
          {{ label }}
        </button>
      </template>
    </div>

    <div v-if="!props.collapsed" class="tools">
      <div class="search" :class="{ open: searching }">
        <button class="ytf-icon-button search-btn" aria-label="Search in Your Library" @click="startSearch">
          <Icon name="search" :size="16" />
        </button>
        <input
          v-if="searching"
          ref="searchInput"
          v-model="query"
          placeholder="Search in Your Library"
          @blur="!query && (searching = false)"
          @keydown.escape="((query = ''), (searching = false))"
        />
      </div>
      <button class="sort" @click="sortAlpha = !sortAlpha">
        {{ sortAlpha ? "Alphabetical" : "Recents" }}
        <Icon name="list" :size="16" />
      </button>
    </div>

    <ul class="items">
      <li v-for="c in items" :key="c.key">
        <button
          class="item"
          :class="{ active: isActive(c) }"
          :title="props.collapsed ? c.title : undefined"
          @click="open(c.browse)"
          @contextmenu="openMenu($event, cardMenu(c))"
        >
          <Cover :thumbs="c.thumbs" :size="48" :round="c.kind === 'artist'" :liked="isLiked(c)" />
          <span v-if="!props.collapsed" class="text">
            <span class="name ytf-ellipsis" :class="{ playing: isPlayingFrom(c) }">{{ c.title }}</span>
            <span class="detail ytf-ellipsis">
              <Icon v-if="isLiked(c)" name="pin" :size="12" class="pin" />
              {{ detail(c) }}
            </span>
          </span>
          <Icon v-if="!props.collapsed && isPlayingFrom(c) && isPlaying" name="volume-high" :size="16" class="playing-icon" />
        </button>
      </li>
      <li v-if="session && !session.loggedIn && !props.collapsed" class="prompt">
        <strong>Log in to see your library</strong>
        <span>Your YouTube Music playlists, albums and artists show up here.</span>
        <button class="prompt-button" @click="signIn">Log in</button>
      </li>
      <li v-else-if="loading && !items.length" class="state">Loading your library…</li>
      <li v-else-if="error" class="state">
        Couldn't load your library.
        <button class="retry" @click="refreshLibrary()">Try again</button>
      </li>
      <li v-else-if="!items.length && query" class="state">Couldn't find "{{ query }}"</li>
    </ul>
  </nav>
</template>

<style scoped>
.library {
  grid-area: left;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: var(--radius-large);
  background: var(--background-base);
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px 8px;
}

.collapsed header {
  justify-content: center;
  padding: 16px 0 8px;
}

.title {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  color: var(--text-subdued);
  font-size: 16px;
  font-weight: 700;
  transition: color 0.2s;
}

.title:hover {
  color: var(--text-base);
}

.create {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px 0 12px;
  border-radius: 9999px;
  background: var(--background-elevated-base);
  font-size: 14px;
  font-weight: 700;
  transition: background-color 0.2s;
}

.create:hover {
  background: var(--background-elevated-highlight);
}

.chips {
  display: flex;
  gap: 8px;
  padding: 0 16px 8px;
}

.clear {
  width: 32px;
  justify-content: center;
  padding: 0;
}

.tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 8px;
}

.search {
  display: flex;
  align-items: center;
  height: 32px;
  border-radius: 4px;
}

.search.open {
  background: var(--background-elevated-highlight);
}

.search-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.search:not(.open) .search-btn:hover {
  background: var(--background-elevated-highlight);
}

.search input {
  width: 180px;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 14px;
}

.sort {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  color: var(--text-subdued);
  font-size: 14px;
}

.sort:hover {
  color: var(--text-base);
}

.items {
  flex: 1;
  margin: 0;
  padding: 4px 8px 8px;
  list-style: none;
  overflow-y: auto;
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px;
  border-radius: 6px;
  text-align: left;
}

.collapsed .item {
  justify-content: center;
}

.item:hover {
  background: var(--background-tinted-highlight);
}

.item.active {
  background: var(--background-tinted-highlight);
}

.item.active:hover {
  background: var(--background-elevated-highlight);
}

.text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.name {
  font-size: 16px;
}

.name.playing {
  color: var(--text-bright-accent);
}

.detail {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-subdued);
  font-size: 14px;
}

.pin {
  color: var(--essential-bright-accent);
}

.playing-icon {
  color: var(--essential-bright-accent);
}

/* Spotify's logged-out library card */
.prompt {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0;
  padding: 16px 20px;
  border-radius: var(--radius-large);
  background: var(--background-elevated-base);
  font-size: 14px;
}

.prompt strong {
  font-size: 16px;
}

.prompt-button {
  align-self: flex-start;
  margin-top: 12px;
  height: 32px;
  padding: 0 16px;
  border-radius: 9999px;
  background: var(--text-base);
  color: #000;
  font-size: 14px;
  font-weight: 700;
  transition: transform 0.1s;
}

.prompt-button:hover {
  transform: scale(1.04);
}

.state {
  padding: 16px 8px;
  color: var(--text-subdued);
  font-size: 14px;
}

.retry {
  display: block;
  margin-top: 8px;
  color: var(--text-base);
  font-weight: 700;
}
</style>
