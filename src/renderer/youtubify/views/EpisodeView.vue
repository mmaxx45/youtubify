<script setup lang="ts">
// Spotify's episode page: tinted header with the show link, date • duration, play / save / "…",
// and the full description with clickable links and timestamps.
import { computed, ref, watch } from "vue";
import type { EpisodePage, TextPart } from "../ytm/models";
import { getEpisode, openExternal, play, playEpisodeAt } from "../ytm/client";
import { pickThumb } from "../ytm/parse";
import { averageColor } from "../format";
import { navigate } from "../state/router";
import { isPlaying, progress, seek, togglePlay, track } from "../state/player";
import { openMenuAt } from "../state/menu";
import { isSavedEpisode, rememberShows, seedSavedEpisode, setSavedEpisode } from "../state/podcasts";
import { episodeMenu } from "../menus";
import Cover from "../components/Cover.vue";
import Icon from "../components/Icon.vue";

const props = defineProps<{ id: string }>();

const page = ref<EpisodePage | null>(null);
const error = ref("");
const tint = ref("rgb(83, 83, 83)");
const scroller = ref<HTMLElement | null>(null);

async function load() {
  page.value = null;
  error.value = "";
  scroller.value?.scrollTo({ top: 0 });
  try {
    const id = props.id;
    const p = await getEpisode(id);
    if (id !== props.id) return;
    page.value = p;
    seedSavedEpisode(p.episode.videoId, p.saved);
    rememberShows([p.episode]);
    tint.value = "rgb(83, 83, 83)";
    averageColor(pickThumb(p.episode.thumbs, 64)).then(c => c && props.id === id && (tint.value = c));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
watch(() => props.id, load, { immediate: true });

const episode = computed(() => page.value?.episode);
const isCurrent = computed(() => !!episode.value && track.value?.id === episode.value.videoId);
const saved = computed(() => !!episode.value && isSavedEpisode(episode.value.videoId));
const titleSize = computed(() => {
  const n = episode.value?.title.length ?? 0;
  return n <= 22 ? 72 : n <= 40 ? 48 : 32;
});

function onPlay() {
  if (isCurrent.value) togglePlay();
  else if (episode.value) play(episode.value.play);
}

// Timestamps jump inside the episode, starting it first if something else is playing
function onPart(part: TextPart) {
  if (part.url) openExternal(part.url);
  else if (part.seconds !== undefined && episode.value) {
    if (isCurrent.value) seek(part.seconds);
    else playEpisodeAt(episode.value.videoId, part.seconds);
  }
}

const openMore = (e: MouseEvent) => episode.value && openMenuAt(e.currentTarget as HTMLElement, episodeMenu(episode.value));
const openShow = () => episode.value?.show?.browseId && navigate({ name: "podcast", id: episode.value.show.browseId });

// Spotify shows how far you got, else the full length
const timeLabel = computed(() => {
  const e = episode.value;
  if (!e) return "";
  if (isCurrent.value && track.value?.durationSeconds) {
    const left = Math.max(0, Math.round((track.value.durationSeconds - progress.value) / 60));
    return left >= 60 ? `${Math.floor(left / 60)} hr ${left % 60} min left` : `${left} min left`;
  }
  return e.progressText || e.duration;
});
</script>

<template>
  <div ref="scroller" class="view" :style="{ '--tint': tint }">
    <div v-if="error" class="error">
      <p>Couldn't load this episode. {{ error }}</p>
      <button class="ytf-pill" @click="load">Try again</button>
    </div>

    <template v-else>
      <header class="hero">
        <Cover v-if="episode" :thumbs="episode.thumbs" :size="232" :radius="8" class="hero-cover" />
        <div v-else class="hero-cover ytf-skeleton" />
        <div v-if="episode" class="hero-text">
          <span class="type">Podcast Episode</span>
          <h1 :style="{ fontSize: `${titleSize}px` }">{{ episode.title }}</h1>
          <span v-if="episode.show" class="show" :class="{ 'ytf-link': episode.show.browseId }" @click="openShow">{{ episode.show.name }}</span>
        </div>
      </header>

      <div class="body">
        <div v-if="episode" class="meta">
          <span v-if="episode.played && !isCurrent" class="played"><Icon name="check-circle" :size="16" /> Played</span>
          <span v-if="episode.date">{{ episode.date }}</span>
          <span v-if="episode.date && timeLabel">•</span>
          <span>{{ timeLabel }}</span>
        </div>
        <div class="actions">
          <button class="ytf-play-button large" :disabled="!episode" :aria-label="isCurrent && isPlaying ? 'Pause' : 'Play'" @click="onPlay">
            <Icon :name="isCurrent && isPlaying ? 'pause' : 'play'" :size="24" />
          </button>
          <button
            v-if="episode"
            class="ytf-icon-button action"
            :class="{ active: saved }"
            :title="saved ? 'Remove from Your Episodes' : 'Add to Your Episodes'"
            :aria-label="saved ? 'Remove from Your Episodes' : 'Add to Your Episodes'"
            @click="setSavedEpisode(episode.videoId, !saved)"
          >
            <Icon :name="saved ? 'check-circle' : 'plus-circle'" :size="32" />
          </button>
          <button v-if="episode" class="ytf-icon-button action" :title="`More options for ${episode.title}`" aria-label="More options" @click="openMore">
            <Icon name="more" :size="32" />
          </button>
        </div>

        <section v-if="page" class="description">
          <h2 class="ytf-section-title">Episode Description</h2>
          <p v-if="page.description.length" class="text">
            <template v-for="(part, i) in page.description" :key="i">
              <span v-if="part.url || part.seconds !== undefined" class="link" @click="onPart(part)">{{ part.text }}</span>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
          <p v-else class="text empty">This episode has no description.</p>
          <button v-if="episode?.show?.browseId" class="ytf-pill all" @click="openShow">See all episodes</button>
        </section>
        <div v-else class="loading">
          <div v-for="i in 6" :key="i" class="line ytf-skeleton" />
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
  line-height: 1.05;
  overflow-wrap: anywhere;
}

.show {
  align-self: flex-start;
  font-size: 24px;
  font-weight: 700;
}

.body {
  position: relative;
  padding: 0 24px 32px;
}

.body::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 232px;
  background: linear-gradient(rgba(0, 0, 0, 0.6), var(--background-base)), var(--tint);
  z-index: 0;
}

.meta,
.actions,
.description,
.loading {
  position: relative;
  z-index: 1;
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 24px;
  color: var(--text-subdued);
  font-size: 14px;
}

.played {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--essential-bright-accent);
}

.actions {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 0 24px;
}

.action {
  width: 32px;
  height: 32px;
}

.description {
  max-width: 800px;
}

.description h2 {
  margin-bottom: 16px;
}

.text {
  margin: 0 0 24px;
  color: var(--text-subdued);
  font-size: 16px;
  line-height: 1.5;
  white-space: pre-line;
  overflow-wrap: anywhere;
  user-select: text;
}

.link {
  color: var(--text-base);
  text-decoration: underline;
  cursor: pointer;
}

.link:hover {
  color: var(--text-bright-accent);
}

.all {
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--essential-subdued);
  background: transparent;
  font-weight: 700;
}

.all:hover {
  border-color: var(--text-base);
  background: transparent;
}

.loading {
  display: grid;
  gap: 12px;
  max-width: 800px;
}

.line {
  height: 16px;
}

.error {
  padding: 24px;
  color: var(--text-subdued);
}
</style>
