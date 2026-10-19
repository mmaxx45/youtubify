<script setup lang="ts">
// Spotify's artist page: banner header, "Popular" tracks, Discography (with filter chips), more rows.
import { computed, ref, watch } from "vue";
import type { ArtistPage } from "../ytm/models";
import { getArtist, play } from "../ytm/client";
import { pickThumb } from "../ytm/parse";
import { averageColor } from "../format";
import { navigate, routeFor } from "../state/router";
import { isDiscography, showAllRoute } from "../state/shelves";
import { isFollowing, seedFollow, setFollowing } from "../state/follows";
import { openMenuAt } from "../state/menu";
import { artistMenu } from "../menus";
import Icon from "../components/Icon.vue";
import Shelf from "../components/Shelf.vue";
import TrackList from "../components/TrackList.vue";

const props = defineProps<{ id: string }>();

const page = ref<ArtistPage | null>(null);
const error = ref("");
const tint = ref("rgb(83, 83, 83)");
const showAll = ref(false);
const discoIndex = ref(0);
const scroller = ref<HTMLElement | null>(null);

async function load() {
  page.value = null;
  error.value = "";
  showAll.value = false;
  discoIndex.value = 0;
  scroller.value?.scrollTo({ top: 0 });
  try {
    const id = props.id;
    const p = await getArtist(id);
    if (id !== props.id) return;
    page.value = p;
    seedFollow(p.channelId, p.subscribed);
    averageColor(pickThumb(p.thumbs, 200)).then(c => c && props.id === id && (tint.value = c));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
watch(() => props.id, load, { immediate: true });

const banner = computed(() => (page.value ? pickThumb(page.value.thumbs, 1440) : ""));
const nameSize = computed(() => ((page.value?.name.length ?? 0) <= 16 ? 96 : 64));
const songs = computed(() => (page.value ? page.value.topSongs.slice(0, showAll.value ? 10 : 5) : []));
const seeMoreRoute = computed(() => routeFor(page.value?.topSongsMore));

// YTM's Albums / Singles & EPs rows become Spotify's single Discography row with filter chips
const discography = computed(() => page.value?.shelves.filter(isDiscography) ?? []);
const otherShelves = computed(() => page.value?.shelves.filter(s => !isDiscography(s)) ?? []);
const discoPicked = computed(() => discography.value[discoIndex.value] ?? discography.value[0]);
const discoShelf = computed(() => discoPicked.value && { ...discoPicked.value, key: "discography", title: "Discography", strapline: "" });
// Show all opens the full discography with the picked chip's filter, titled with the artist's name
const discoRoute = computed(() => (discoPicked.value && page.value ? showAllRoute(discoPicked.value, page.value.name) : undefined));

const following = computed(() => !!page.value && isFollowing(page.value.channelId));
const openMore = (e: MouseEvent) => page.value && openMenuAt(e.currentTarget as HTMLElement, artistMenu(page.value));

function playArtist() {
  const endpoint = page.value?.shuffle ?? page.value?.radio;
  if (endpoint) play(endpoint);
}
</script>

<template>
  <div ref="scroller" class="view" :style="{ '--tint': tint }">
    <div v-if="error" class="error">
      <p>Couldn't load this artist. {{ error }}</p>
      <button class="ytf-pill" @click="load">Try again</button>
    </div>

    <template v-else>
      <header class="hero" :style="{ backgroundImage: banner ? `url(${banner})` : undefined }">
        <div class="shade" />
        <div v-if="page" class="hero-text">
          <span class="verified"><Icon name="verified" :size="24" class="badge" /> Verified Artist</span>
          <h1 :style="{ fontSize: `${nameSize}px` }">{{ page.name }}</h1>
          <span v-if="page.subscribers" class="listeners">{{ page.subscribers }}</span>
        </div>
      </header>

      <div class="body">
        <div class="actions">
          <button class="ytf-play-button large" :disabled="!page?.shuffle && !page?.radio" aria-label="Play" @click="playArtist">
            <Icon name="play" :size="24" />
          </button>
          <button v-if="page?.radio" class="ytf-icon-button action" title="Start radio" aria-label="Start radio" @click="play(page.radio)">
            <Icon name="radio" :size="32" />
          </button>
          <button v-if="page" class="follow" :class="{ following: following }" @click="setFollowing(page.channelId, !following)">
            {{ following ? "Following" : "Follow" }}
          </button>
          <button v-if="page" class="ytf-icon-button action" title="More options" aria-label="More options" @click="openMore">
            <Icon name="more" :size="32" />
          </button>
        </div>

        <section v-if="page?.topSongs.length" class="popular">
          <h2 class="ytf-section-title">Popular</h2>
          <TrackList :tracks="songs" :show-album="false" />
          <button v-if="page.topSongs.length > 5" class="see-more" @click="showAll = !showAll">{{ showAll ? "Show less" : "See more" }}</button>
          <button v-else-if="seeMoreRoute" class="see-more" @click="navigate(seeMoreRoute)">See more</button>
        </section>

        <div v-if="page" class="shelves">
          <Shelf v-if="discoShelf" :shelf="discoShelf" :to="discoRoute">
            <template #filters>
              <div class="disco-chips">
                <button v-for="(s, i) in discography" :key="s.key" class="ytf-pill" :class="{ selected: s === discoPicked }" @click="discoIndex = i">
                  {{ s.title }}
                </button>
              </div>
            </template>
          </Shelf>
          <Shelf v-for="s in otherShelves" :key="s.key" :shelf="s" />
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
  position: relative;
  display: flex;
  align-items: flex-end;
  height: 40vh;
  min-height: 340px;
  max-height: 500px;
  padding: 24px;
  background: var(--tint) center 20% / cover no-repeat;
}

.shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 40%, rgba(0, 0, 0, 0.6));
}

.hero-text {
  position: relative;
  display: flex;
  flex-direction: column;
}

.verified {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.badge {
  color: #4cb3ff;
}

h1 {
  margin: 8px 0 16px;
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.3);
}

.listeners {
  font-size: 16px;
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
}

.actions,
.popular,
.shelves {
  position: relative;
}

.actions {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 24px 0;
}

/* Spotify's outlined Follow pill */
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

.follow.following {
  border-color: var(--essential-subdued);
}

.action {
  width: 32px;
  height: 32px;
}

.popular {
  margin-bottom: 40px;
}

.popular h2 {
  margin-bottom: 16px;
}

.see-more {
  margin: 16px 0 0 16px;
  color: var(--text-subdued);
  font-size: 14px;
  font-weight: 700;
}

.see-more:hover {
  color: var(--text-base);
}

.shelves {
  margin: 0 -12px;
}

.disco-chips {
  display: flex;
  gap: 8px;
  padding: 0 12px;
  margin: 8px 0 4px;
}

.error {
  padding: 24px;
  color: var(--text-subdued);
}
</style>
