<script setup lang="ts">
// Spotify's confirmation dialog ("Delete from Your Library?" ... Cancel / Delete).
import type { DialogText } from "../state/dialog";
import Modal from "./Modal.vue";

const props = withDefaults(defineProps<{ title: string; message: DialogText; confirmLabel: string; cancelLabel?: string }>(), { cancelLabel: "Cancel" });
const emit = defineEmits<{ (e: "result", ok: boolean): void }>();
</script>

<template>
  <Modal light :width="420" :close-button="false" :label="props.title" @close="emit('result', false)">
    <div class="body">
      <h1>{{ props.title }}</h1>
      <p>
        <template v-for="(part, i) in props.message" :key="i">
          <strong v-if="typeof part === 'object'">{{ part.strong }}</strong>
          <template v-else>{{ part }}</template>
        </template>
      </p>
      <div class="buttons">
        <button class="cancel" @click="emit('result', false)">{{ props.cancelLabel }}</button>
        <button class="confirm" autofocus @click="emit('result', true)">{{ props.confirmLabel }}</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.body {
  padding: 32px;
}

h1 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

p {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

strong {
  font-weight: 700;
}

.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}

.buttons button {
  min-height: 48px;
  padding: 8px 32px;
  border-radius: 9999px;
  font-size: 16px;
  font-weight: 700;
  transition: transform 0.1s;
}

.buttons button:hover {
  transform: scale(1.04);
}

.buttons button:focus-visible {
  outline: 2px solid #000;
  outline-offset: 2px;
}

.cancel {
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
