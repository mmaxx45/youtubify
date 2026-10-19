<script setup lang="ts">
// Spotify's green switch (Settings page)
defineProps<{ modelValue: boolean; disabled?: boolean; label?: string }>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <button
    class="toggle"
    :class="{ on: modelValue }"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="knob" />
  </button>
</template>

<style scoped>
.toggle {
  position: relative;
  flex: none;
  width: 40px;
  height: 24px;
  border-radius: 9999px;
  background: #727272;
  transition: background-color 0.1s;
}

.toggle:hover:not(:disabled) {
  background: #8f8f8f;
}

.toggle.on {
  background: var(--essential-bright-accent);
}

.toggle.on:hover:not(:disabled) {
  background: #3be477;
}

.toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.knob {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #000;
  transition: transform 0.1s;
}

.on .knob {
  transform: translateX(16px);
}
</style>
