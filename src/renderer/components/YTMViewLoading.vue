<script setup lang="ts">
import { onBeforeMount, onBeforeUnmount, ref, watch } from "vue";

const memoryStore = window.ytmd.memoryStore;

const ytmViewLoading = ref<boolean>(await memoryStore.get("ytmViewLoading"));
const ytmViewLoadingError = ref<boolean>(await memoryStore.get("ytmViewLoadingError"));
const ytmViewLoadTimedout = ref<boolean>(await memoryStore.get("ytmViewLoadTimedout"));
const ytmViewLoadingStatus = ref<string>((await memoryStore.get("ytmViewLoadingStatus")) ?? "");

onBeforeMount(async () => {
  ytmViewLoading.value = await memoryStore.get("ytmViewLoading");
  ytmViewLoadTimedout.value = await memoryStore.get("ytmViewLoadTimedout");
  ytmViewLoadingError.value = await memoryStore.get("ytmViewLoadingError");
  ytmViewLoadingStatus.value = (await memoryStore.get("ytmViewLoadingStatus")) ?? "";
});

memoryStore.onStateChanged(newState => {
  ytmViewLoading.value = newState.ytmViewLoading;
  ytmViewLoadingError.value = newState.ytmViewLoadingError;
  ytmViewLoadTimedout.value = newState.ytmViewLoadTimedout;
  ytmViewLoadingStatus.value = newState.ytmViewLoadingStatus;
});

// "loading": equalizer stripes bounce. "forming": once YTM has loaded the stripes bend into the
// Spotify logo, which then zooms away. The main process holds the YTM view back for OUTRO_MS
// (YTM_VIEW_REVEAL_DELAY_MS) so the outro isn't covered.
type Phase = "loading" | "forming" | "done";
const OUTRO_MS = 1900;

const phase = ref<Phase>(ytmViewLoading.value ? "loading" : "done");
let outroTimer: ReturnType<typeof setTimeout> | undefined;

watch(ytmViewLoading, (loading, wasLoading) => {
  clearTimeout(outroTimer);
  if (loading) {
    phase.value = "loading";
  } else if (wasLoading && phase.value === "loading") {
    phase.value = "forming";
    outroTimer = setTimeout(() => (phase.value = "done"), OUTRO_MS);
  } else {
    phase.value = "done";
  }
});

onBeforeUnmount(() => clearTimeout(outroTimer));

// Logo geometry in a 100x100 box (widths are screen px for the 168px logo). Each stripe is a quadratic path with the same command structure
// as the arc it becomes, so CSS can interpolate `d` between them.
const arcs = [
  { d: "M 22 37.5 Q 51 25.5 79.5 40.5", width: 14 },
  { d: "M 26 53.5 Q 50 44 73.5 56", width: 11 },
  { d: "M 29.5 68.5 Q 49.5 61 68.5 70.5", width: 8.5 }
];
const bounceDelays = [1, 0.8, 0.4, 0.2, 0.2, 0.4, 0.8, 1];
const stripeArc = [0, 0, 0, 1, 1, 1, 2, 2];

const stripes = bounceDelays.map((delay, i) => {
  const x = 20.25 + i * 8.5;
  const arc = arcs[stripeArc[i]];
  return {
    "--bar": `path("M ${x} 44 Q ${x} 50 ${x} 56")`,
    "--arc": `path("${arc.d}")`,
    "--arc-width": arc.width,
    "--bounce-delay": `${delay}s`,
    "--form-delay": `${Math.abs(i - 3.5) * 45}ms`
  };
});
</script>

<template>
  <div class="ytmview-loading-container">
    <Transition name="fade">
      <div v-if="phase !== 'done'" :class="['ytmview-loading', phase]">
        <svg class="loader-logo" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="logo-disc" cx="50" cy="50" r="50" />
          <path v-for="(stripe, i) in stripes" :key="i" class="stripe" :style="stripe" />
        </svg>
        <div class="loader-text">
          <p :class="{ 'ytmview-loading-status': true, 'error': ytmViewLoadingError }">{{ ytmViewLoadingStatus }}</p>
          <p v-if="ytmViewLoadTimedout" class="ytmview-loading-timeout">YouTube Music is taking longer than usual to load</p>
        </div>
      </div>
      <div v-else class="ytmview-loading"></div>
    </Transition>
  </div>
</template>

<style scoped>
.ytmview-loading-container {
  height: calc(100% - 36px);
  background-color: #000000;
}

.ytmview-loading {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: calc(100% - 36px);
  user-select: none;
}

.ytmview-loading-status {
  color: #969696;
}

.ytmview-loading-status.error {
  color: #f44336;
}

.ytmview-loading-timeout {
  color: #f44336;
}

.loader-text {
  min-height: 72px;
  text-align: center;
  transition: opacity 0.2s ease;
}

.forming .loader-text {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---- logo */

.loader-logo {
  width: 168px;
  height: 168px;
  overflow: visible;
}

.logo-disc {
  fill: #1ed760;
  transform-origin: 50px 50px;
  transform: scale(0);
}

.stripe {
  d: var(--bar);
  fill: none;
  stroke: #ffffff;
  stroke-width: 9px;
  stroke-linecap: round;
  transform-box: fill-box;
  transform-origin: center;
  /* keeps the round caps round while the bars stretch */
  vector-effect: non-scaling-stroke;
}

.loading .stripe {
  animation: musicloader 1.5s ease-in-out infinite;
  animation-delay: var(--bounce-delay);
}

@keyframes musicloader {
  0%,
  100% {
    transform: scaleY(0.6);
  }
  50% {
    transform: scaleY(6);
  }
}

/* Stripes slide together and bend into the three arcs, the green disc pops in behind them and the
   arcs turn black, then the whole logo zooms away as the YTM view is revealed. */
.forming .stripe {
  d: var(--arc);
  stroke: #000000;
  stroke-width: calc(var(--arc-width) * 1px);
  transition:
    d 0.7s cubic-bezier(0.65, 0, 0.35, 1) var(--form-delay),
    stroke-width 0.7s cubic-bezier(0.65, 0, 0.35, 1) var(--form-delay),
    stroke 0.25s ease 0.85s;
}

.forming .logo-disc {
  transform: scale(1);
  transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) 0.65s;
}

.forming .loader-logo {
  animation: logo-out 0.35s cubic-bezier(0.5, 0, 0.75, 0) 1.5s forwards;
}

@keyframes logo-out {
  to {
    opacity: 0;
    transform: scale(1.15);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading .stripe {
    animation-duration: 3s;
  }

  .forming .stripe,
  .forming .logo-disc {
    transition-duration: 0s;
  }
}
</style>
