<script setup lang="ts">
import { toastMessage } from "../state/toast";
</script>

<template>
  <Transition name="toast">
    <div v-if="toastMessage" class="toast" role="status">{{ toastMessage }}</div>
  </Transition>
</template>

<style scoped>
/* Spotify's blue confirmation pill above the player bar */
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--bar-height) + 24px);
  z-index: 900;
  transform: translateX(-50%);
  max-width: 480px;
  padding: 8px 16px;
  border-radius: 4px;
  background: #3d91f4;
  color: #fff;
  font-size: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
