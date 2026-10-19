<script setup lang="ts">
// Spotify's confirmation dialog (white card, "Cancel" + green action) before logging out.
import { nextTick, ref, watch } from "vue";
import { signOut, signOutPrompt } from "../state/session";

const confirmButton = ref<HTMLButtonElement | null>(null);

watch(signOutPrompt, async open => {
  if (!open) return;
  await nextTick();
  confirmButton.value?.focus();
});

const cancel = () => (signOutPrompt.value = false);
function confirm() {
  signOutPrompt.value = false;
  signOut();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="signOutPrompt" class="backdrop" @pointerdown.self="cancel" @keydown.esc="cancel">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="ytf-signout-title" aria-describedby="ytf-signout-body">
        <h2 id="ytf-signout-title">Log out of YouTube Music?</h2>
        <p id="ytf-signout-body">You'll need to log in again to get your library, playlists and recommendations in Youtubify.</p>
        <div class="actions">
          <button class="cancel" @click="cancel">Cancel</button>
          <button ref="confirmButton" class="confirm" @click="confirm">Log out</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
}

.dialog {
  width: 420px;
  max-width: calc(100vw - 32px);
  padding: 24px;
  border-radius: var(--radius-large);
  background: #fff;
  color: #000;
  box-shadow: 0 16px 24px rgba(0, 0, 0, 0.3);
}

h2 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

p {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}

.actions button {
  height: 48px;
  padding: 0 32px;
  border-radius: 9999px;
  font-size: 16px;
  font-weight: 700;
  transition: transform 0.1s;
}

.actions button:hover {
  transform: scale(1.04);
}

.actions .cancel {
  padding: 0 16px;
  color: #000;
}

.confirm {
  background: var(--essential-bright-accent);
  color: #000;
}

.confirm:hover {
  background: #3be477;
}
</style>
