<script setup lang="ts">
// Spotify's playlist/album page: tinted header, action bar, track table.
import { computed, ref, watch } from "vue";
import type { CollectionPage, Track } from "../ytm/models";
import { getCollection, getCollectionMore, play, playlistIdOf, savePlaylist } from "../ytm/client";
import { openMenuAt } from "../state/menu";
import { collectionMenu } from "../menus";
import { refreshLibrary } from "../state/library";
import { toast } from "../state/toast";
import { pickThumb } from "../ytm/parse";
import { averageColor } from "../format";
import { navigate } from "../state/router";
import { isPlaying, playlistId, shuffle, togglePlay } from "../state/player";
import Cover from "../components/Cover.vue";
import Icon from "../components/Icon.vue";
import Shelf from "../components/Shelf.vue";
import TrackList from "../components/TrackList.vue";

const props = defineProps<{ id: string }>();

const page = ref<CollectionPage | null>(null);
const error = ref("");
const tint = ref("rgb(83, 83, 83)");
const loadingMore = ref(false);
const scroller = ref<HTMLElement | null>(null);

async function load() {
  page.value = null;
  error.value = "";
  scroller.value?.scrollTo({ top: 0 });
  try {
    const id = props.id;
    const p = await getCollection(id);
    if (id !== props.id) return;
    page.value = p;
    tint.value = "rgb(83, 83, 83)";
    averageColor(pickThumb(p.thumbs, 64)).then(c => c && props.id === id && (tint.value = c));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
watch(() => props.id, load, { immediate: true });

const listId = computed(() => (page.value ? playlistIdOf(page.value) : undefined));
const isCurrent = computed(() => !!listId.value && !!playlistId.value && playlistId.value.endsWith(listId.value));
const isLiked = computed(() => props.id === "VLLM");
const typeLabel = computed(() => (page.value?.kind === "album" ? (page.value.typeLine.split(" • ")[0] ?? "Album") : "Playlist"));
const year = computed(() => (page.value?.kind === "album" ? page.value.typeLine.split(" • ").slice(1).join(" • ") : ""));
// Long titles shrink like Spotify's auto-fitting header
const titleSize = computed(() => {
  const n = page.value?.title.length ?? 0;
  return n <= 14 ? 96 : n <= 22 ? 72 : n <= 34 ? 48 : 32;
});

function onPlay() {
  if (isCurrent.value) togglePlay();
  else if (page.value?.play) play(page.value.play);
}

// Spotify's "Save to Your Library" circle; Liked Songs and your own playlists are always there
const canSave = computed(() => !!page.value?.playlistId && props.id !== "VLLM" && !page.value.editable);
async function toggleSaved() {
  const p = page.value;
  if (!p?.playlistId) return;
  const save = !p.saved;
  p.saved = save;
  try {
    await savePlaylist(p.playlistId, save);
    toast(save ? "Saved to Your Library" : "Removed from Your Library");
    refreshLibrary();
  } catch {
    p.saved = !save;
    toast("Couldn't update Your Library");
  }
}

function openMore(e: MouseEvent) {
  if (page.value)
    openMenuAt(
      e.currentTarget as HTMLElement,
      collectionMenu(page.value, saved => page.value && (page.value.saved = saved))
    );
}

function onRemoved(track: Track) {
  if (page.value) page.value.tracks = page.value.tracks.filter(t => t.key !== track.key);
}

function onShuffle() {
  if (!page.value?.play) return;
  play(page.value.play);
  // YTM shuffles the queue it just loaded
  setTimeout(shuffle, 800);
}

async function onScroll() {
  const el = scroller.value;
  const p = page.value;
  if (!el || !p?.continuation || loadingMore.value) return;
  if (el.scrollTop + el.clientHeight < el.scrollHeight - 1200) return;
  loadingMore.value = true;
  try {
    const more = await getCollectionMore(p.id, p.continuation, p.tracks.length);
    if (page.value !== p) return;
    p.tracks.push(...more.tracks);
    p.continuation = more.continuation;
  } catch {
    p.continuation = undefined;
  } finally {
    loadingMore.value = false;
  }
}
</script>

<template>
  <div ref="scroller" class="view" :style="{ '--tint': tint }" @scroll.passive="onScroll">
    <div v-if="error" class="error">
      <p>Couldn't load this page. {{ error }}</p>
      <button class="ytf-pill" @click="load">Try again</button>
    </div>

    <template v-else>
      <header class="hero">
        <Cover v-if="page" :thumbs="page.thumbs" :size="232" :liked="isLiked" class="hero-cover" />
        <div v-else class="hero-cover ytf-skeleton" />
        <div v-if="page" class="hero-text">
          <span class="type">{{ typeLabel }}</span>
          <h1 :style="{ fontSize: `${titleSize}px` }">{{ page.title }}</h1>
          <p v-if="page.description" class="description ytf-clamp-2">{{ page.description }}</p>
          <div class="meta">
            <template v-if="page.kind === 'playlist' && page.owner">
              <img v-if="page.owner.avatar" class="avatar" :src="page.owner.avatar" alt="" />
              <span
                class="owner"
                :class="{ 'ytf-link': page.owner.browseId }"
                @click="page.owner.browseId && navigate({ name: 'artist', id: page.owner.browseId })"
                >{{ page.owner.name }}</span
              >
            </template>
            <template v-else-if="page.artists.length">
              <template v-for="(a, i) in page.artists" :key="i">
                <span v-if="i">, </span>
                <span class="owner" :class="{ 'ytf-link': a.browseId }" @click="a.browseId && navigate({ name: 'artist', id: a.browseId })">{{ a.name }}</span>
              </template>
            </template>
            <span v-if="year" class="sub">• {{ year }}</span>
            <span v-if="page.meta" class="sub">• {{ page.meta }}</span>
          </div>
        </div>
      </header>

      <div class="body">
        <div class="actions">
          <button class="ytf-play-button large" :disabled="!page?.play" :aria-label="isCurrent && isPlaying ? 'Pause' : 'Play'" @click="onPlay">
            <Icon :name="isCurrent && isPlaying ? 'pause' : 'play'" :size="24" />
          </button>
          <button class="ytf-icon-button action" title="Shuffle" aria-label="Shuffle" :disabled="!page?.play" @click="onShuffle">
            <Icon name="shuffle" :size="32" />
          </button>
          <button
            v-if="canSave"
            class="ytf-icon-button action"
            :class="{ active: page?.saved }"
            :title="page?.saved ? 'Remove from Your Library' : 'Save to Your Library'"
            :aria-label="page?.saved ? 'Remove from Your Library' : 'Save to Your Library'"
            @click="toggleSaved"
          >
            <Icon :name="page?.saved ? 'check-circle' : 'plus-circle'" :size="32" />
          </button>
          <button v-if="page" class="ytf-icon-button action" :title="`More options for ${page.title}`" aria-label="More options" @click="openMore">
            <Icon name="more" :size="32" />
          </button>
        </div>

        <div class="tracks">
          <TrackList
            v-if="page"
            :tracks="page.tracks"
            :list-playlist-id="listId"
            :show-album="page.kind === 'playlist'"
            :show-cover="page.kind === 'playlist'"
            :editable-playlist-id="page.editable ? page.playlistId : undefined"
            show-header
            @removed="onRemoved"
          />
          <div v-else class="loading">
            <div v-for="i in 8" :key="i" class="row-skeleton ytf-skeleton" />
          </div>
          <p v-if="page && !page.tracks.length" class="empty">This playlist is empty. Add songs from YouTube Music to see them here.</p>
        </div>

        <div v-if="page?.more.length" class="more">
          <Shelf v-for="s in page.more" :key="s.key" :shelf="s" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.view {
  height: 100%;
  overflow-y: auto;
}

.hero {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  min-height: 340px;
  padding: 72px 24px 24px;
  background: linear-gradient(transparent 0, rgba(0, 0, 0, 0.5) 100%), var(--tint);
  transition: background-color 0.6s;
}

.hero-cover {
  width: clamp(128px, 20cqw, 232px) !important;
  height: clamp(128px, 20cqw, 232px) !important;
  min-width: 128px;
  min-height: 128px;
  box-shadow: 0 4px 60px rgba(0, 0, 0, 0.5);
}

.view {
  container-type: inline-size;
}

.hero-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.type {
  font-size: 14px;
}

h1 {
  margin: 8px 0 12px;
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1;
  overflow-wrap: anywhere;
}

.description {
  margin: 0 0 8px;
  color: hsla(0, 0%, 100%, 0.7);
  font-size: 14px;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.owner {
  font-weight: 700;
}

.sub {
  color: hsla(0, 0%, 100%, 0.7);
}

.body {
  position: relative;
  padding: 0 24px 32px;
}

/* Spotify carries the header tint into the top of the list */
.body::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 232px;
  background: linear-gradient(rgba(0, 0, 0, 0.6), var(--background-base)), var(--tint);
  z-index: 0;
}

.actions,
.tracks,
.more {
  position: relative;
  z-index: 1;
}

.actions {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 24px 0;
}

.action {
  width: 32px;
  height: 32px;
}

.loading {
  display: grid;
  gap: 8px;
}

.row-skeleton {
  height: 48px;
}

.empty,
.error {
  padding: 24px;
  color: var(--text-subdued);
}

.more {
  margin: 40px -12px 0;
}
</style>
