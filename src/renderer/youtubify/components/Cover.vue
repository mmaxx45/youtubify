<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Thumb } from "../ytm/models";
import { pickThumb } from "../ytm/parse";
import Icon from "./Icon.vue";

const props = withDefaults(defineProps<{ thumbs?: Thumb[]; size: number; round?: boolean; liked?: boolean; radius?: number; wide?: boolean }>(), {
  thumbs: () => [],
  round: false,
  liked: false,
  radius: 4,
  wide: false
});

const failed = ref(false);
// Ask for 2x the CSS size so covers stay sharp on HiDPI screens
const src = computed(() => (props.liked ? "" : pickThumb(props.thumbs, props.size * 2)));
watch(src, () => (failed.value = false));
</script>

<template>
  <div
    class="cover"
    :class="{ round, liked, wide }"
    :style="{ width: wide ? undefined : `${size}px`, height: wide ? undefined : `${size}px`, borderRadius: round ? '50%' : `${radius}px` }"
  >
    <img v-if="src && !failed" :src="src" alt="" loading="lazy" draggable="false" @error="failed = true" />
    <Icon v-else-if="liked" name="heart" :size="Math.max(16, Math.round(size * 0.38))" />
    <Icon v-else name="note" :size="Math.max(16, Math.round(size * 0.38))" class="placeholder-icon" />
  </div>
</template>

<style scoped>
.cover {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #282828;
  color: var(--essential-subdued);
}

.cover.wide {
  width: 100%;
  aspect-ratio: 16 / 9;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Spotify's Liked Songs tile */
.cover.liked {
  background: linear-gradient(135deg, #450af5, #c4efd9);
  color: #fff;
}
</style>
