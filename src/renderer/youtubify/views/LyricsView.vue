<script setup lang="ts">
// Spotify's lyrics view for the playing song. YTM's web data only has unsynced lyrics, so they are
// shown the way Spotify shows lyrics that aren't time-synced.
import { ref, watch } from "vue";
import { getLyrics } from "../ytm/client";
import { pickThumb } from "../ytm/parse";
import { averageColor } from "../format";
import { track } from "../state/player";

const lyrics = ref<{ lines: string[]; source: string } | null>(null);
const loading = ref(false);
const tint = ref("rgb(83, 83, 83)");

// Lyrics per song are fetched once
const cache = new Map<string, Promise<{ lines: string[]; source: string } | null>>();

watch(
  () => track.value?.id,
  async id => {
    lyrics.value = null;
    if (!id) return;
    loading.value = true;
    if (!cache.has(id))
      cache.set(
        id,
        getLyrics(id).catch(() => null)
      );
    const result = await cache.get(id)!;
    if (track.value?.id !== id) return;
    lyrics.value = result;
    loading.value = false;
    averageColor(pickThumb(track.value?.thumbnails ?? [], 64)).then(c => c && track.value?.id === id && (tint.value = c));
  },
  { immediate: true }
);
</script>

<template>
  <div class="view" :style="{ '--tint': tint }">
    <div v-if="!track" class="message">Play a song to see its lyrics.</div>
    <div v-else-if="loading" class="message">Loading lyrics…</div>
    <div v-else-if="!lyrics" class="message">
      <h2>Looks like we don't have the lyrics for this song.</h2>
    </div>
    <div v-else class="lyrics">
      <p class="note">These lyrics aren't synced to the song yet.</p>
      <p v-for="(line, i) in lyrics.lines" :key="i" class="line" :class="{ gap: !line.trim() }">{{ line || " " }}</p>
      <p v-if="lyrics.source" class="source">{{ lyrics.source.replace(/^Source:\s*/i, "Lyrics provided by ") }}</p>
    </div>
  </div>
</template>

<style scoped>
.view {
  height: 100%;
  overflow-y: auto;
  background: var(--tint);
  transition: background-color 0.6s;
  user-select: text;
}

.lyrics {
  max-width: 900px;
  padding: 48px 48px 96px;
}

.note {
  margin: 0 0 32px;
  color: hsla(0, 0%, 100%, 0.7);
  font-size: 14px;
  font-weight: 700;
}

.line {
  margin: 0;
  color: var(--text-base);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.5;
}

.line.gap {
  height: 24px;
}

.source {
  margin-top: 48px;
  color: hsla(0, 0%, 100%, 0.7);
  font-size: 14px;
}

.message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  color: var(--text-base);
  font-size: 16px;
  text-align: center;
}

.message h2 {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
}
</style>
