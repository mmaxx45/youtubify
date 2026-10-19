<script setup lang="ts">
// Spotify's progress/volume bar: white fill that turns green with a knob on hover. While dragging,
// the bar follows the pointer and only commits on release.
import { computed, ref } from "vue";

const props = defineProps<{ value: number; max: number; label: string }>();
const emit = defineEmits<{ (e: "change", value: number): void; (e: "preview", value: number | null): void }>();

const track = ref<HTMLElement | null>(null);
const dragValue = ref<number | null>(null);
const shown = computed(() => dragValue.value ?? props.value);
const pct = computed(() => (props.max > 0 ? Math.min(100, Math.max(0, (shown.value / props.max) * 100)) : 0));

function valueAt(clientX: number) {
  const r = track.value!.getBoundingClientRect();
  return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * props.max;
}

function onDown(e: PointerEvent) {
  if (!props.max) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  dragValue.value = valueAt(e.clientX);
  emit("preview", dragValue.value);
}

function onMove(e: PointerEvent) {
  if (dragValue.value === null) return;
  dragValue.value = valueAt(e.clientX);
  emit("preview", dragValue.value);
}

function onUp() {
  if (dragValue.value === null) return;
  emit("change", dragValue.value);
  emit("preview", null);
  dragValue.value = null;
}

function onKey(e: KeyboardEvent) {
  const step = props.max / 20;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") emit("change", Math.min(props.max, props.value + step));
  else if (e.key === "ArrowLeft" || e.key === "ArrowDown") emit("change", Math.max(0, props.value - step));
  else return;
  e.preventDefault();
}
</script>

<template>
  <div
    class="slider"
    :class="{ dragging: dragValue !== null }"
    role="slider"
    tabindex="0"
    :aria-label="label"
    :aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="Math.round(shown)"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @keydown="onKey"
  >
    <div ref="track" class="track">
      <div class="fill" :style="{ width: `${pct}%` }"></div>
    </div>
    <div class="knob" :style="{ left: `${pct}%` }"></div>
  </div>
</template>

<style scoped>
.slider {
  position: relative;
  flex: 1;
  height: 12px;
  display: flex;
  align-items: center;
  cursor: pointer;
  outline: none;
}

.track {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: hsla(0, 0%, 100%, 0.3);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 2px;
  background: var(--text-base);
}

.slider:hover .fill,
.slider.dragging .fill,
.slider:focus-visible .fill {
  background: var(--essential-bright-accent);
}

.knob {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--text-base);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  opacity: 0;
  pointer-events: none;
}

.slider:hover .knob,
.slider.dragging .knob,
.slider:focus-visible .knob {
  opacity: 1;
}
</style>
