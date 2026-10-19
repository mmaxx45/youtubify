<script setup lang="ts">
// Youtubify shell: Spotify's desktop grid (nav / library + main + now playing / player bar).
import { computed, onMounted, ref, watch } from "vue";
import "./styles.css";
import GlobalNav from "./components/GlobalNav.vue";
import LibrarySidebar from "./components/LibrarySidebar.vue";
import NowPlayingPanel from "./components/NowPlayingPanel.vue";
import PlayerBar from "./components/PlayerBar.vue";
import YTMViewLoading from "../components/YTMViewLoading.vue";
import HomeView from "./views/HomeView.vue";
import CollectionView from "./views/CollectionView.vue";
import ArtistView from "./views/ArtistView.vue";
import SearchView from "./views/SearchView.vue";
import CategoryView from "./views/CategoryView.vue";
import LyricsView from "./views/LyricsView.vue";
import ShelfView from "./views/ShelfView.vue";
import SettingsView from "./views/SettingsView.vue";
import ContextMenu from "./components/ContextMenu.vue";
import Toast from "./components/Toast.vue";
import { navigate, route } from "./state/router";
import { startPlayerSync, track } from "./state/player";
import { refreshLibrary } from "./state/library";
import { refreshSession, startSessionSync } from "./state/session";

const ready = ref(false);
// The loading screen stays up until its logo outro (YTMViewLoading OUTRO_MS) has played
const showLoading = ref(true);

onMounted(async () => {
  startPlayerSync();
  startSessionSync();
  const memoryStore = window.ytmd.memoryStore;
  // Data comes from the hidden YTM view, so wait until it has loaded
  const markReady = (loading: boolean) => {
    if (!loading && !ready.value) {
      ready.value = true;
      refreshLibrary();
      refreshSession();
      setTimeout(() => (showLoading.value = false), 1900);
    }
  };
  markReady(await memoryStore.get("ytmViewLoading"));
  memoryStore.onStateChanged(s => markReady(s.ytmViewLoading));
});

/* ---------------------------------------------------------------- panel sizes (persisted) */

const stored = (key: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(key));
    return v || fallback;
  } catch {
    return fallback;
  }
};
const persist = (key: string, v: number) => {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // ignore: sizes just reset next launch
  }
};

const leftWidth = ref(stored("ytf.leftWidth", 280));
const leftCollapsed = ref(stored("ytf.leftCollapsed", 0) === 1);
const rightWidth = ref(stored("ytf.rightWidth", 340));
const rightPanel = ref<"nowplaying" | "queue" | null>(stored("ytf.rightClosed", 0) === 1 ? null : "nowplaying");

watch(leftWidth, v => persist("ytf.leftWidth", v));
watch(leftCollapsed, v => persist("ytf.leftCollapsed", v ? 1 : 0));
watch(rightWidth, v => persist("ytf.rightWidth", v));
watch(rightPanel, v => persist("ytf.rightClosed", v ? 0 : 1));

const showRight = computed(() => rightPanel.value !== null && !!track.value);
const gridColumns = computed(() => `${leftCollapsed.value ? 72 : leftWidth.value}px minmax(0, 1fr) ${showRight.value ? `${rightWidth.value}px` : "0px"}`);

function togglePanel(panel: "nowplaying" | "queue") {
  rightPanel.value = rightPanel.value === panel ? null : panel;
}

// Drag the gap next to a sidebar to resize it, like Spotify
function startResize(side: "left" | "right", e: PointerEvent) {
  const startX = e.clientX;
  const start = side === "left" ? (leftCollapsed.value ? 72 : leftWidth.value) : rightWidth.value;
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
    const w = start + delta;
    if (side === "left") {
      leftCollapsed.value = w < 180;
      if (!leftCollapsed.value) leftWidth.value = Math.min(420, Math.max(280, w));
    } else rightWidth.value = Math.min(420, Math.max(280, w));
  };
  const up = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
}

function onChip(params?: string) {
  navigate({ name: "home", chip: params }, true);
}
</script>

<template>
  <div class="shell" :style="{ gridTemplateColumns: gridColumns }">
    <GlobalNav />
    <LibrarySidebar :collapsed="leftCollapsed" @toggle-collapse="leftCollapsed = !leftCollapsed" />
    <div class="resize left" :style="{ left: `${(leftCollapsed ? 72 : leftWidth) + 8}px` }" @pointerdown="startResize('left', $event)" />

    <main class="main">
      <template v-if="ready">
        <KeepAlive :max="6">
          <HomeView v-if="route.name === 'home'" :key="`home-${route.chip ?? ''}`" :chip="route.chip" @chip="onChip" />
          <CollectionView v-else-if="route.name === 'collection'" :id="route.id" :key="`col-${route.id}`" />
          <ArtistView v-else-if="route.name === 'artist'" :id="route.id" :key="`artist-${route.id}`" />
          <SearchView v-else-if="route.name === 'search'" key="search" :query="route.query" :filter="route.filter" />
          <CategoryView v-else-if="route.name === 'category'" :id="route.id" :key="`cat-${route.params}`" :params="route.params" :title="route.title" />
          <ShelfView
            v-else-if="route.name === 'shelf'"
            :key="`shelf-${route.browseId}-${route.params}-${route.stash}`"
            :title="route.title"
            :browse-id="route.browseId"
            :params="route.params"
            :stash="route.stash"
          />
        </KeepAlive>
        <LyricsView v-if="route.name === 'lyrics'" />
        <SettingsView v-if="route.name === 'settings'" />
      </template>
    </main>

    <NowPlayingPanel v-if="showRight" :mode="rightPanel ?? 'nowplaying'" @close="rightPanel = null" @mode="rightPanel = $event" />
    <div v-if="showRight" class="resize right" :style="{ right: `${rightWidth + 8}px` }" @pointerdown="startResize('right', $event)" />

    <PlayerBar :right-panel="showRight ? rightPanel : null" @toggle-panel="togglePanel" />
    <ContextMenu />
    <Toast />

    <div v-if="showLoading" class="loading-overlay">
      <Suspense>
        <YTMViewLoading />
      </Suspense>
    </div>
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  display: grid;
  grid-template-rows: var(--nav-height) minmax(0, 1fr) var(--bar-height);
  grid-template-areas:
    "nav nav nav"
    "left main right"
    "bar bar bar";
  column-gap: var(--panel-gap);
  height: 100vh;
  padding: 0 var(--panel-gap);
  background: #000;
}

.main {
  grid-area: main;
  min-width: 0;
  min-height: 0;
  border-radius: var(--radius-large);
  background: var(--background-base);
  overflow: hidden;
}

/* Invisible grab strips in the 8px gaps beside each sidebar */
.resize {
  position: absolute;
  top: var(--nav-height);
  bottom: var(--bar-height);
  width: 8px;
  cursor: col-resize;
  z-index: 5;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: #000;
}

.loading-overlay :deep(.ytmview-loading-container),
.loading-overlay :deep(.ytmview-loading) {
  height: 100%;
}
</style>
