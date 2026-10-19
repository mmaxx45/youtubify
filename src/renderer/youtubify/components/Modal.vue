<script setup lang="ts">
// Spotify's modal dialog: dimmed backdrop, rounded card, optional title row with a close button.
// Escape and clicks on the backdrop close it; focus moves in on open and back out on close.
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "./Icon.vue";

const props = withDefaults(
  defineProps<{
    title?: string;
    // Accessible name when the dialog draws its own heading instead of the title row
    label?: string;
    // Spotify's confirmation dialogs use the light (white) theme
    light?: boolean;
    width?: number;
    closeButton?: boolean;
  }>(),
  { title: undefined, label: undefined, light: false, width: 524, closeButton: true }
);

const emit = defineEmits<{ (e: "close"): void }>();

const card = ref<HTMLElement | null>(null);
const returnFocus = document.activeElement as HTMLElement | null;
const focusables = () => [...(card.value?.querySelectorAll<HTMLElement>("button, input, textarea, select, [tabindex]:not([tabindex='-1'])") ?? [])];

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    // Don't let the page (search box, context menu, ...) also react to this Escape
    e.stopPropagation();
    e.preventDefault();
    emit("close");
  } else if (e.code === "Space") {
    // The player's global Space shortcut would swallow presses on the dialog's buttons
    e.stopPropagation();
  } else if (e.key === "Tab") {
    // Keep keyboard focus inside the dialog
    const list = focusables().filter(el => !el.hasAttribute("disabled"));
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      list[list.length - 1].focus();
    } else if (!e.shiftKey && i === list.length - 1) {
      e.preventDefault();
      list[0].focus();
    }
  }
}

onMounted(async () => {
  window.addEventListener("keydown", onKey, true);
  await nextTick();
  const auto = card.value?.querySelector<HTMLElement>("[autofocus]") ?? focusables().find(el => !el.classList.contains("close"));
  auto?.focus();
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey, true);
  returnFocus?.focus?.();
});

// Only a press that starts and ends on the backdrop closes (not a text selection dragged out)
let downOnBackdrop = false;
</script>

<template>
  <Teleport to="body">
    <div
      class="backdrop"
      @pointerdown="downOnBackdrop = $event.target === $event.currentTarget"
      @click="downOnBackdrop && $event.target === $event.currentTarget && emit('close')"
      @contextmenu.prevent
    >
      <div
        ref="card"
        class="card"
        :class="{ light: props.light }"
        :style="{ width: `${props.width}px` }"
        role="dialog"
        aria-modal="true"
        :aria-label="props.title ?? props.label"
      >
        <header v-if="props.title" class="head">
          <h1>{{ props.title }}</h1>
          <button v-if="props.closeButton" class="close" aria-label="Close" title="Close" @click="emit('close')">
            <Icon name="close" :size="16" />
          </button>
        </header>
        <slot />
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
  animation: fade 0.15s ease-out;
}

.card {
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  overflow: auto;
  border-radius: var(--radius-large);
  background: #282828;
  color: var(--text-base);
  box-shadow: 0 4px 4px rgba(0, 0, 0, 0.3);
  user-select: text;
  animation: pop 0.15s ease-out;
}

.card.light {
  background: #fff;
  color: #000;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
}

h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: -8px -8px -8px 0;
  border-radius: 50%;
  color: hsla(0, 0%, 100%, 0.7);
}

.close:hover,
.close:focus-visible {
  background: hsla(0, 0%, 100%, 0.1);
  color: var(--text-base);
}

.light .close {
  color: rgba(0, 0, 0, 0.7);
}

.light .close:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #000;
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes pop {
  from {
    transform: scale(0.96);
  }
}
</style>
