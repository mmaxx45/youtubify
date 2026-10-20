<script setup lang="ts">
// Spotify's right sidebar: "Now playing" view and the queue.
import { computed, ref, watch } from "vue";
import * as player from "../state/player";
import { playlists } from "../state/library";
import { navigate } from "../state/router";
import { getArtist, getHistory, getLyrics, getQueueItemLinks, play } from "../ytm/client";
import { isLiked, toggleLiked } from "../state/likes";
import { openMenu, openMenuAt } from "../state/menu";
import { signIn } from "../state/session";
import { toast } from "../state/toast";
import { trackMenu } from "../menus";
import type { EngineQueueItem } from "../state/player";
import type { ArtistPage, ArtistRef, Track } from "../ytm/models";
import { isSavedEpisode, playingEpisode, setSavedEpisode, showOf } from "../state/podcasts";
import Cover from "./Cover.vue";
import Icon from "./Icon.vue";

const props = defineProps<{ mode: "nowplaying" | "queue" }>();
const emit = defineEmits<{ (e: "close"): void; (e: "mode", mode: "nowplaying" | "queue"): void }>();

const { track, upNext, queueItems, queueIndex } = player;
const liked = computed(() => isLiked(track.value?.id, player.liked.value));
const like = () => track.value && toggleLiked(track.value.id, player.liked.value);

// Episodes: the byline opens the show (when known) and + means Your Episodes, as in the player bar
const episodeShow = computed(() => (playingEpisode.value ? showOf(track.value?.id) : undefined));
const episodeSaved = computed(() => !!track.value && isSavedEpisode(track.value.id));
function openByline() {
  if (episodeShow.value?.browseId) navigate({ name: "podcast", id: episodeShow.value.browseId });
  else if (track.value?.channelId) navigate({ name: "artist", id: track.value.channelId });
}
const onMenu = (e: MouseEvent) => player.currentAsTrack.value && openMenu(e, trackMenu(player.currentAsTrack.value));

// Spotify's lyrics card: a preview of the first lines
const lyricsPreview = ref<string[]>([]);
watch(
  () => track.value?.id,
  async id => {
    lyricsPreview.value = [];
    if (!id) return;
    const lyrics = await getLyrics(id).catch(() => null);
    if (track.value?.id === id) lyricsPreview.value = (lyrics?.lines ?? []).filter(l => l.trim()).slice(0, 6);
  },
  { immediate: true }
);

// Context name: a library playlist if we know it, otherwise generic like Spotify's "Now playing"
const contextName = computed(() => {
  const id = player.playlistId.value;
  if (!id) return "Now playing";
  const match = playlists.value.find(p => p.browse && id.endsWith(p.browse.browseId.replace(/^VL/, "")));
  return match?.title ?? (id.startsWith("RD") ? "Mix" : "Now playing");
});

// "About the artist" comes from the artist's YTM page; cached per channel
const artistCache = new Map<string, Promise<ArtistPage | null>>();
const artist = ref<ArtistPage | null>(null);
watch(
  () => track.value?.channelId,
  async id => {
    artist.value = null;
    if (!id) return;
    if (!artistCache.has(id))
      artistCache.set(
        id,
        getArtist(id).catch(() => null)
      );
    const page = await artistCache.get(id)!;
    if (track.value?.channelId === id) artist.value = page;
  },
  { immediate: true }
);

const nextItem = computed(() => upNext.value[0]);
const current = computed(() => queueItems.value[queueIndex.value]);

// Spotify's queue view has two tabs: the queue and "Recently played"
const tab = ref<"queue" | "recent">("queue");

/* ---------------------------------------------------------------- queue editing */

// Queue entries only carry plain text; the artist/album links are looked up when a menu opens
const queueTrack = (item: EngineQueueItem, links?: { artists: ArtistRef[]; album?: ArtistRef }): Track => ({
  key: `queue-${item.videoId}`,
  videoId: item.videoId,
  title: item.title,
  artists: links?.artists.length ? links.artists : [{ name: item.author }],
  album: links?.album,
  duration: item.duration,
  thumbs: item.thumbnails,
  explicit: false,
  detail: "",
  play: { watchEndpoint: { videoId: item.videoId } }
});

const remove = async (index: number) => {
  if (!(await player.removeQueueItem(index).catch(() => false))) toast("Couldn't remove from queue");
};
const clear = () => player.clearUpNext().catch(() => toast("Couldn't clear the queue"));

async function queueItemMenu(index: number, item: EngineQueueItem) {
  const links = await getQueueItemLinks(index, item.videoId).catch((): undefined => undefined);
  return trackMenu(queueTrack(item, links), { removeFromQueue: () => remove(index) });
}
const onItemMenu = async (e: MouseEvent, index: number, item: EngineQueueItem) => {
  e.preventDefault();
  e.stopPropagation();
  openMenu(e, await queueItemMenu(index, item));
};
const onItemMore = async (e: MouseEvent, index: number, item: EngineQueueItem) => {
  const button = e.currentTarget as HTMLElement;
  openMenuAt(button, await queueItemMenu(index, item));
};

// Drag & drop reordering of the upcoming songs, with Spotify's green drop line. Autoplay
// suggestions after the real queue can't be moved (YTM doesn't support it either).
const movable = (index: number) => index > queueIndex.value && index < player.queueItemCount.value;
const dragFrom = ref<number | null>(null);
const dropAt = ref<{ index: number; after: boolean } | null>(null);
const dragLabel = ref<HTMLElement | null>(null);

// Slot between rows the song would land in, or null where dropping wouldn't move it
const dropSlot = computed(() => {
  if (dragFrom.value === null || !dropAt.value) return null;
  const slot = dropAt.value.index + (dropAt.value.after ? 1 : 0);
  return slot === dragFrom.value || slot === dragFrom.value + 1 ? null : slot;
});
const dropLine = (index: number) => (dropSlot.value === index ? "drop-before" : dropSlot.value === index + 1 ? "drop-after" : "");

function onDragStart(e: DragEvent, index: number, item: EngineQueueItem) {
  if (!movable(index) || !e.dataTransfer) return e.preventDefault();
  dragFrom.value = index;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", `${item.title} • ${item.author}`);
  // Spotify drags a small label with the song name instead of a ghost of the whole row
  if (dragLabel.value) {
    dragLabel.value.textContent = `${item.title} • ${item.author}`;
    e.dataTransfer.setDragImage(dragLabel.value, -12, -12);
  }
}
function onDragOver(e: DragEvent, index: number) {
  if (dragFrom.value === null || !movable(index)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  dropAt.value = { index, after: e.clientY > r.top + r.height / 2 };
}
// dragleave also fires when moving between rows; only hide the line once the pointer left the list
function onDragLeave(e: DragEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  if (e.clientX <= r.left || e.clientX >= r.right || e.clientY <= r.top || e.clientY >= r.bottom) dropAt.value = null;
}
const onDragEnd = () => {
  dragFrom.value = null;
  dropAt.value = null;
};
async function onDrop(e: DragEvent) {
  e.preventDefault();
  const from = dragFrom.value;
  const slot = dropSlot.value;
  onDragEnd();
  if (from === null || slot === null) return;
  if (!(await player.moveQueueItem(from, slot > from ? slot - 1 : slot).catch(() => false))) toast("Couldn't move the song");
}

/* ---------------------------------------------------------------- recently played */

const history = ref<{ tracks: Track[]; signInRequired: boolean } | null>(null);
const historyFailed = ref(false);
async function loadHistory() {
  historyFailed.value = false;
  try {
    history.value = await getHistory();
  } catch {
    historyFailed.value = true;
  }
}
// Reload when the tab opens and when a new song starts (the previous one joins the history)
watch(
  [() => props.mode === "queue" && tab.value === "recent", () => track.value?.id],
  ([visible]) => {
    if (visible) loadHistory();
  },
  { immediate: true }
);
const artistNames = (t: Track) => t.artists.map(a => a.name).join(", ");
const onHistoryMore = (e: MouseEvent, t: Track) => openMenuAt(e.currentTarget as HTMLElement, trackMenu(t));
</script>

<template>
  <aside class="panel">
    <header>
      <nav v-if="props.mode === 'queue'" class="tabs" role="tablist">
        <button role="tab" :aria-selected="tab === 'queue'" :class="{ active: tab === 'queue' }" @click="tab = 'queue'">Queue</button>
        <button role="tab" :aria-selected="tab === 'recent'" :class="{ active: tab === 'recent' }" @click="tab = 'recent'">Recently played</button>
      </nav>
      <h2 v-else class="ytf-ellipsis">{{ contextName }}</h2>
      <button class="ytf-icon-button close" aria-label="Close" title="Close" @click="emit('close')">
        <Icon name="close" :size="16" />
      </button>
    </header>

    <div v-if="!track" class="empty">Play something to see it here.</div>

    <div v-else-if="props.mode === 'nowplaying'" class="scroll">
      <Cover :thumbs="track.thumbnails" :size="400" :radius="8" :letterbox="playingEpisode" class="hero" />
      <div class="track" @contextmenu="onMenu">
        <div class="names">
          <div
            class="title ytf-ellipsis"
            :class="{ 'ytf-link': track.albumId || playingEpisode }"
            @click="
              playingEpisode ? navigate({ name: 'episode', id: `MPED${track.id}` }) : track.albumId && navigate({ name: 'collection', id: track.albumId })
            "
          >
            {{ track.title }}
          </div>
          <div class="artist ytf-ellipsis ytf-link" @click="openByline">{{ episodeShow?.name ?? track.author }}</div>
        </div>
        <button
          v-if="playingEpisode"
          class="ytf-icon-button"
          :class="{ active: episodeSaved }"
          :aria-label="episodeSaved ? 'Remove from Your Episodes' : 'Add to Your Episodes'"
          @click="setSavedEpisode(track.id, !episodeSaved)"
        >
          <Icon :name="episodeSaved ? 'check-circle' : 'plus-circle'" :size="24" />
        </button>
        <button v-else class="ytf-icon-button" :class="{ active: liked }" :aria-label="liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'" @click="like">
          <Icon :name="liked ? 'check-circle' : 'plus-circle'" :size="24" />
        </button>
      </div>

      <section v-if="artist" class="card about" @click="navigate({ name: 'artist', id: artist.id })">
        <div
          class="about-img"
          :style="{ backgroundImage: artist.thumbs.length ? `url(${artist.thumbs[Math.min(1, artist.thumbs.length - 1)].url})` : undefined }"
        >
          <span>About the artist</span>
        </div>
        <div class="about-body">
          <div class="about-name">{{ artist.name }}</div>
          <div v-if="artist.subscribers" class="about-meta">{{ artist.subscribers }}</div>
          <p v-if="artist.description" class="about-desc">{{ artist.description }}</p>
        </div>
      </section>

      <section v-if="lyricsPreview.length" class="card lyrics">
        <div class="lyrics-head">
          <span>Lyrics</span>
          <button class="open-queue" @click="navigate({ name: 'lyrics' })">Show lyrics</button>
        </div>
        <p v-for="(line, i) in lyricsPreview" :key="i">{{ line }}</p>
      </section>

      <section v-if="nextItem" class="card next">
        <div class="next-head">
          <span>Next in queue</span>
          <button class="open-queue" @click="emit('mode', 'queue')">Open queue</button>
        </div>
        <button class="qrow" @click="player.playQueueIndex(nextItem.index)">
          <Cover :thumbs="nextItem.item.thumbnails" :size="48" />
          <span class="qtext">
            <span class="qtitle ytf-ellipsis">{{ nextItem.item.title }}</span>
            <span class="qartist ytf-ellipsis">{{ nextItem.item.author }}</span>
          </span>
        </button>
      </section>
    </div>

    <div v-else-if="tab === 'queue'" class="scroll queue">
      <h3>Now playing</h3>
      <div v-if="current" class="qrow playing" @contextmenu="onMenu">
        <Cover :thumbs="current.thumbnails" :size="48" />
        <span class="qtext">
          <span class="qtitle ytf-ellipsis">{{ current.title }}</span>
          <span class="qartist ytf-ellipsis">{{ current.author }}</span>
        </span>
      </div>
      <div v-if="upNext.length" class="section-head">
        <h3 class="ytf-ellipsis">Next from: {{ contextName }}</h3>
        <button class="open-queue" @click="clear">Clear queue</button>
      </div>
      <div class="upnext" @dragleave="onDragLeave" @drop="onDrop">
        <div
          v-for="{ item, index } in upNext.slice(0, 80)"
          :key="`${item.videoId}-${index}`"
          class="qrow"
          :class="[dropLine(index), { dragging: dragFrom === index }]"
          role="button"
          tabindex="0"
          :draggable="movable(index)"
          @click="player.playQueueIndex(index)"
          @keydown.enter="player.playQueueIndex(index)"
          @contextmenu="onItemMenu($event, index, item)"
          @dragstart="onDragStart($event, index, item)"
          @dragover="onDragOver($event, index)"
          @dragend="onDragEnd"
        >
          <span class="cover-wrap">
            <Cover :thumbs="item.thumbnails" :size="48" />
            <span class="cover-play"><Icon name="play" :size="20" /></span>
          </span>
          <span class="qtext">
            <span class="qtitle ytf-ellipsis">{{ item.title }}</span>
            <span class="qartist ytf-ellipsis">{{ item.author }}</span>
          </span>
          <span class="qdur">{{ item.duration }}</span>
          <button class="more" :aria-label="`More options for ${item.title}`" title="More options" @click.stop="onItemMore($event, index, item)">
            <Icon name="more" :size="16" />
          </button>
        </div>
      </div>
      <div ref="dragLabel" class="drag-label" aria-hidden="true" />
    </div>

    <div v-else class="scroll queue recent">
      <template v-if="history?.tracks.length">
        <div
          v-for="t in history.tracks.slice(0, 100)"
          :key="t.key"
          class="qrow"
          role="button"
          tabindex="0"
          @click="play(t.play)"
          @keydown.enter="play(t.play)"
          @contextmenu="openMenu($event, trackMenu(t))"
        >
          <span class="cover-wrap">
            <Cover :thumbs="t.thumbs" :size="48" />
            <span class="cover-play"><Icon name="play" :size="20" /></span>
          </span>
          <span class="qtext">
            <span class="qtitle ytf-ellipsis">{{ t.title }}</span>
            <span class="qartist ytf-ellipsis">{{ artistNames(t) }}</span>
          </span>
          <span class="qdur">{{ t.duration }}</span>
          <button class="more" :aria-label="`More options for ${t.title}`" title="More options" @click.stop="onHistoryMore($event, t)">
            <Icon name="more" :size="16" />
          </button>
        </div>
      </template>
      <div v-else-if="history?.signInRequired" class="recent-empty">
        <Icon name="clock" :size="48" />
        <h4>Log in to see what you've played</h4>
        <p>Songs you've listened to on YouTube Music show up here.</p>
        <button class="ytf-pill login" @click="signIn">Log in</button>
      </div>
      <div v-else-if="historyFailed" class="recent-empty">
        <h4>Couldn't load your recently played songs</h4>
        <button class="ytf-pill" @click="loadHistory">Try again</button>
      </div>
      <div v-else-if="history" class="recent-empty">
        <Icon name="clock" :size="48" />
        <h4>No recently played songs</h4>
        <p>Songs you play will show up here.</p>
      </div>
      <template v-else>
        <div v-for="n in 6" :key="n" class="qrow">
          <span class="ytf-skeleton skeleton-cover" />
          <span class="qtext">
            <span class="ytf-skeleton skeleton-line" />
            <span class="ytf-skeleton skeleton-line short" />
          </span>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  grid-area: right;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: var(--radius-large);
  background: var(--background-base);
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 16px 8px;
}

h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.close:hover {
  background: var(--background-elevated-highlight);
}

.empty {
  padding: 16px;
  color: var(--text-subdued);
  font-size: 14px;
}

.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.hero {
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 1;
  margin-top: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.track {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
}

.names {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.artist {
  color: var(--text-subdued);
  font-size: 16px;
}

.card {
  margin-bottom: 16px;
  border-radius: var(--radius-large);
  background: var(--background-elevated-base);
  overflow: hidden;
}

.about {
  cursor: pointer;
}

.about-img {
  position: relative;
  height: 220px;
  background: #282828 center / cover no-repeat;
}

.about-img span {
  position: absolute;
  top: 16px;
  left: 16px;
  font-weight: 700;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
}

.about-body {
  padding: 16px;
}

.about-name {
  font-size: 16px;
  font-weight: 700;
}

.about-meta {
  margin-top: 4px;
  color: var(--text-subdued);
  font-size: 14px;
}

.about-desc {
  margin: 12px 0 0;
  color: var(--text-subdued);
  font-size: 14px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lyrics {
  padding: 16px;
  background: linear-gradient(160deg, #6b4b8a, #3b2a55);
}

.lyrics-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 700;
}

.lyrics p {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.5;
}

.next {
  padding: 16px;
}

.next-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 700;
}

.open-queue {
  color: var(--text-subdued);
  font-size: 14px;
  font-weight: 700;
}

.open-queue:hover {
  color: var(--text-base);
  text-decoration: underline;
}

.queue h3 {
  margin: 16px 0 8px;
  font-size: 16px;
  font-weight: 700;
}

.qrow {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px;
  border-radius: 4px;
  text-align: left;
}

.qrow:hover {
  background: var(--background-tinted-highlight);
}

.qtext {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.qtitle {
  font-size: 16px;
}

.playing .qtitle {
  color: var(--text-bright-accent);
}

.qartist,
.qdur {
  color: var(--text-subdued);
  font-size: 14px;
}

/* Queue / Recently played tabs */
.tabs {
  display: flex;
  gap: 16px;
  min-width: 0;
}

.tabs button {
  position: relative;
  padding: 4px 0;
  color: var(--text-subdued);
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}

.tabs button:hover,
.tabs button.active {
  color: var(--text-base);
}

.tabs button.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 2px;
  border-radius: 1px;
  background: var(--essential-bright-accent);
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 16px 0 8px;
}

.queue .section-head h3 {
  margin: 0;
  min-width: 0;
}

.section-head .open-queue {
  flex: none;
}

.qrow {
  position: relative;
}

.qrow.dragging {
  opacity: 0.5;
}

/* Spotify's green line where a dragged song will land */
.drop-before::before,
.drop-after::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--essential-bright-accent);
  pointer-events: none;
}

.drop-before::before {
  top: -1px;
}

.drop-after::after {
  bottom: -1px;
}

.drag-label {
  position: fixed;
  top: -100px;
  left: 0;
  max-width: 300px;
  padding: 8px 12px;
  border-radius: 4px;
  background: var(--background-elevated-highlight);
  color: var(--text-base);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cover-wrap {
  position: relative;
  display: flex;
  flex: none;
}

.cover-play {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
}

.qrow:hover .cover-play {
  display: flex;
}

.more {
  display: flex;
  flex: none;
  color: var(--text-subdued);
  opacity: 0;
  transition: transform 0.1s;
}

.more:hover {
  color: var(--text-base);
  transform: scale(1.04);
}

.qrow:hover .more,
.qrow:focus-within .more {
  opacity: 1;
}

/* Recently played */
.recent {
  padding-top: 8px;
}

.recent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--text-subdued);
  text-align: center;
}

.recent-empty h4 {
  margin: 8px 0 0;
  color: var(--text-base);
  font-size: 16px;
  font-weight: 700;
}

.recent-empty p {
  margin: 0;
  font-size: 14px;
}

.recent-empty .ytf-pill {
  margin-top: 16px;
  font-weight: 700;
}

.recent-empty .login {
  background: var(--text-base);
  color: #000;
}

.recent-empty .login:hover {
  background: var(--text-base);
  transform: scale(1.04);
}

.skeleton-cover {
  flex: none;
  width: 48px;
  height: 48px;
}

.skeleton-line {
  width: 70%;
  height: 12px;
  margin: 4px 0;
}

.skeleton-line.short {
  width: 40%;
}
</style>
