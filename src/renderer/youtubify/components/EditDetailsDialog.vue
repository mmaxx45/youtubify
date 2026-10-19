<script setup lang="ts">
// Spotify's "Edit details" dialog for the user's own playlist: cover, name and description.
import { computed, ref } from "vue";
import type { Thumb } from "../ytm/models";
import type { PlaylistDetailsChange } from "../state/playlistEdits";
import Cover from "./Cover.vue";
import Icon from "./Icon.vue";
import Modal from "./Modal.vue";

const props = defineProps<{
  title: string;
  // Missing when opened from a list that doesn't carry it; loadDescription fetches it then
  description?: string;
  thumbs: Thumb[];
  loadDescription?: () => Promise<string>;
  save: (changes: PlaylistDetailsChange) => Promise<void>;
}>();
const emit = defineEmits<{ (e: "close"): void }>();

const name = ref(props.title);
const original = ref(props.description ?? "");
const descriptionText = ref(original.value);
// The description field stays disabled until it's known, so it can't be wiped by accident
const loaded = ref(props.description !== undefined || !props.loadDescription);
const saving = ref(false);
const error = ref("");

if (!loaded.value)
  props.loadDescription!()
    .then(d => {
      original.value = d;
      descriptionText.value = d;
    })
    .catch(() => undefined)
    .finally(() => (loaded.value = true));

// Only changed fields are sent
const changes = computed<PlaylistDetailsChange>(() => ({
  ...(name.value.trim() !== props.title ? { title: name.value.trim() } : {}),
  ...(loaded.value && descriptionText.value.trim() !== original.value.trim() ? { description: descriptionText.value.trim() } : {})
}));

async function submit() {
  if (!name.value.trim()) {
    error.value = "Playlist name is required.";
    return;
  }
  const c = changes.value;
  if (c.title === undefined && c.description === undefined) return emit("close");
  saving.value = true;
  error.value = "";
  try {
    await props.save(c);
    emit("close");
  } catch {
    error.value = "Something went wrong. Please try again.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal title="Edit details" @close="emit('close')">
    <form class="body" @submit.prevent="submit">
      <p v-if="error" class="error" role="alert">
        <Icon name="alert-circle" :size="16" />
        {{ error }}
      </p>
      <div class="grid">
        <Cover class="cover" :thumbs="props.thumbs" :size="180" />
        <label class="field name">
          <input v-model="name" maxlength="150" placeholder="Add a name" autofocus @input="error = ''" />
          <span class="label">Name</span>
        </label>
        <label class="field description">
          <textarea v-model="descriptionText" maxlength="5000" :placeholder="loaded ? 'Add an optional description' : 'Loading…'" :disabled="!loaded" />
          <span class="label">Description</span>
        </label>
        <button class="save" type="submit" :disabled="saving">Save</button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.body {
  margin: 0;
  padding: 0 24px 24px;
}

/* Spotify's red validation banner */
.error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  padding: 8px 12px;
  border-radius: var(--radius-small);
  background: #e91429;
  color: #fff;
  font-size: 14px;
}

.grid {
  display: grid;
  grid-template:
    "cover name" 40px
    "cover description" 124px
    ". save" auto / 180px 1fr;
  gap: 16px;
}

.cover {
  grid-area: cover;
  box-shadow: 0 4px 60px rgba(0, 0, 0, 0.5);
}

.field {
  position: relative;
  display: flex;
}

.name {
  grid-area: name;
}

.description {
  grid-area: description;
}

input,
textarea {
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  outline: 0;
  background: hsla(0, 0%, 100%, 0.1);
  color: var(--text-base);
  font-family: inherit;
  font-size: 14px;
}

input {
  height: 40px;
  padding: 0 12px;
}

textarea {
  height: 100%;
  padding: 8px 8px 28px;
  resize: none;
}

input::placeholder,
textarea::placeholder {
  color: hsla(0, 0%, 100%, 0.5);
}

input:focus,
textarea:focus {
  border-color: #535353;
  background: #3e3e3e;
}

textarea:disabled {
  opacity: 0.6;
}

/* Spotify floats the field name onto the border while the field is focused */
.label {
  position: absolute;
  top: 0;
  left: 10px;
  padding: 0 2px;
  transform: translateY(-50%);
  color: var(--text-base);
  font-size: 11px;
  font-weight: 700;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.field:focus-within .label {
  opacity: 1;
}

.save {
  grid-area: save;
  justify-self: end;
  min-height: 48px;
  padding: 8px 32px;
  border-radius: 9999px;
  background: #fff;
  color: #000;
  font-size: 16px;
  font-weight: 700;
  transition: transform 0.1s;
}

.save:hover:not(:disabled) {
  transform: scale(1.04);
}

.save:disabled {
  opacity: 0.6;
  cursor: default;
}

.save:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
</style>
