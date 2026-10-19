<script setup lang="ts">
// Spotify's show page: tinted header, Follow / play latest / "…", episode list and an About panel.
import { computed, ref, watch } from "vue";
import type { PodcastPage } from "../ytm/models";
import { getPodcast, getPodcastMore, play } from "../ytm/client";
import { pickThumb } from "../ytm/parse";
import { averageColor } from "../format";
import { navigate } from "../state/router";
import { isPlaying, togglePlay, track } from "../state/player";
import { openMenuAt } from "../state/menu";
import { isFollowingPodcast, rememberShows, seedFollowPodcast, setFollowingPodcast } from "../state/podcasts";
import { podcastMenu } from "../menus";
import Cover from "../components/Cover.vue";
import EpisodeRow from "../components/EpisodeRow.vue";
import Icon from "../components/Icon.vue";

const props = defineProps<{ id: string }>();

const page = ref<PodcastPage | null>(null);
const error = ref("");
const tint = ref("rgb(83, 83, 83)");
const loadingMore = ref(false);
const aboutOpen = ref(false);
const scroller = ref<HTMLElement | null>(null);

async function load() {
  page.value = null;
  error.value = "";
  aboutOpen.value = false;
  scroller.value?.scrollTo({ top: 0 });
  try {
    const id = props.id;
    const p = await getPodcast(id);
    if (id !== props.id) return;
    page.value = p;
    seedFollowPodcast(p.playlistId, p.saved);
    rememberShows(p.episodes);
    tint.value = "rgb(83, 83, 83)";
    averageColor(pickThumb(p.thumbs, 64)).then(c => c && props.id === id && (tint.value = c));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
watch(() => props.id, load, { immediate: true });

const titleSize = computed(() => {
  const n = page.value?.title.length ?? 0;
  return n <= 14 ? 96 : n <= 22 ? 72 : n <= 34 ? 48 : 32;
});

// Spotify's play button on a show starts its latest episode
const latest = computed(() => page.value?.episodes[0]);
const playingHere = computed(() => !!track.value && !!page.value?.episodes.some(e => e.videoId === track.value!.id));
function onPlay() {
  if (playingHere.value) togglePlay();
  else if (latest.value) play(latest.value.play);
}

const following = computed(() => !!page.value && isFollowingPodcast(page.value.playlistId));
const toggleFollow = () => page.value && setFollowingPodcast(page.value.playlistId, !following.value);
const openMore = (e: MouseEvent) => page.value && openMenuAt(e.currentTarget as HTMLElement, podcastMenu(page.value.playlistId));

async function onScroll() {
  const el = scroller.value;
  const p = page.value;
  if (!el || !p?.continuation || loadingMore.value) return;
  if (el.scrollTop + el.clientHeight < el.scrollHeight - 1200) return;
  loadingMore.value = true;
  try {
    const more = await getPodcastMore({ name: p.title, browseId: p.id }, p.continuation, p.episodes.length);
    if (page.value !== p) return;
    p.episodes.push(...more.episodes);
    p.continuation = more.continuation;
    rememberShows(more.episodes);
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
      <p>Couldn't load this podcast. {{ error }}</p>
      <button class="ytf-pill" @click="load">Try again</button>
    </div>

    <template v-else>
      <header class="hero">
        <Cover v-if="page" :thumbs="page.thumbs" :size="232" :radius="8" class="hero-cover" />
        <div v-else class="hero-cover ytf-skeleton" />
        <div v-if="page" class="hero-text">
          <span class="type">Podcast</span>
          <h1 :style="{ fontSize: `${titleSize}px` }">{{ page.title }}</h1>
          <span
            v-if="page.publisher"
            class="publisher"
            :class="{ 'ytf-link': page.publisher.browseId }"
            @click="page.publisher.browseId && navigate({ name: 'artist', id: page.publisher.browseId })"
            >{{ page.publisher.name }}</span
          >
        </div>
      </header>

      <div class="body">
        <div class="actions">
          <button class="ytf-play-button large" :disabled="!latest" :aria-label="playingHere && isPlaying ? 'Pause' : 'Play'" @click="onPlay">
            <Icon :name="playingHere && isPlaying ? 'pause' : 'play'" :size="24" />
          </button>
          <button v-if="page" class="follow" :class="{ on: following }" @click="toggleFollow">{{ following ? "Following" : "Follow" }}</button>
          <button v-if="page" class="ytf-icon-button action" :title="`More options for ${page.title}`" aria-label="More options" @click="openMore">
            <Icon name="more" :size="32" />
          </button>
        </div>

        <div class="columns">
          <section class="episodes">
            <h2 class="ytf-section-title">All Episodes</h2>
            <template v-if="page">
              <EpisodeRow v-for="e in page.episodes" :key="e.key" :episode="e" />
              <p v-if="!page.episodes.length" class="empty">This podcast has no episodes yet.</p>
              <div v-if="loadingMore" class="row-skeleton ytf-skeleton" />
            </template>
            <div v-else class="loading">
              <div v-for="i in 5" :key="i" class="row-skeleton ytf-skeleton" />
            </div>
          </section>

          <aside v-if="page?.description" class="about">
            <h2 class="ytf-section-title">About</h2>
            <p class="about-text" :class="{ clamp: !aboutOpen }">{{ page.description }}</p>
            <button v-if="page.description.length > 160 || page.description.includes('\n')" class="show-more" @click="aboutOpen = !aboutOpen">
              {{ aboutOpen ? "Show less" : "Show more" }}
            </button>
          </aside>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.view {
  height: 100%;
  overflow-y: auto;
  container-type: inline-size;
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
  border-radius: var(--radius-large);
  box-shadow: 0 4px 60px rgba(0, 0, 0, 0.5);
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
  margin: 8px 0 16px;
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1;
  overflow-wrap: anywhere;
}

.publisher {
  align-self: flex-start;
  font-size: 24px;
  font-weight: 700;
}

.body {
  position: relative;
  padding: 0 24px 32px;
}

/* Spotify carries the header tint into the top of the page */
.body::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 232px;
  background: linear-gradient(rgba(0, 0, 0, 0.6), var(--background-base)), var(--tint);
  z-index: 0;
}

.actions,
.columns {
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

/* Spotify's outlined "Follow" pill */
.follow {
  height: 32px;
  padding: 0 15px;
  border: 1px solid var(--essential-subdued);
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 700;
  transition:
    border-color 0.1s,
    transform 0.1s;
}

.follow:hover {
  border-color: var(--text-base);
  transform: scale(1.04);
}

.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 32px;
}

/* Wide windows put About beside the episodes like Spotify; narrow ones stack it on top */
@container (min-width: 900px) {
  .columns {
    grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
  }
}

@container (max-width: 899px) {
  .about {
    order: -1;
  }
}

.episodes > h2 {
  margin: 0 0 16px;
}

.about h2 {
  margin-bottom: 16px;
}

.about-text {
  margin: 0;
  color: var(--text-subdued);
  font-size: 16px;
  line-height: 1.5;
  white-space: pre-line;
  user-select: text;
}

.about-text.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.show-more {
  margin-top: 8px;
  font-size: 16px;
  font-weight: 700;
}

.show-more:hover {
  text-decoration: underline;
}

.loading {
  display: grid;
  gap: 8px;
}

.row-skeleton {
  height: 144px;
  margin: 8px 0;
}

.empty,
.error {
  padding: 24px;
  color: var(--text-subdued);
}
</style>
