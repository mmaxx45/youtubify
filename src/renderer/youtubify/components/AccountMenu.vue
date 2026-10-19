<script setup lang="ts">
// Spotify's account dropdown under the avatar (styled like the context menu, MenuPanel.vue).
import { onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "./Icon.vue";
import { navigate } from "../state/router";
import { openAccountPage, session, signOutPrompt } from "../state/session";

// The avatar it hangs from: the menu's right edge lines up with it
const props = defineProps<{ anchor: HTMLElement }>();
const emit = defineEmits<{ close: [] }>();

const el = ref<HTMLElement | null>(null);
const r = props.anchor.getBoundingClientRect();
const pos = { top: r.bottom + 8, right: innerWidth - r.right };

function choose(action: () => void) {
  emit("close");
  action();
}

const items: { label: string; external?: boolean; action: () => void; divider?: boolean }[] = [
  { label: "Account", external: true, action: openAccountPage },
  // The user's YouTube Music channel, when the account has one
  ...(session.value?.channelId ? [{ label: "Profile", action: () => navigate({ name: "artist", id: session.value!.channelId! }) }] : []),
  { label: "Settings", action: () => navigate({ name: "settings" }) },
  { label: "Log out", divider: true, action: () => (signOutPrompt.value = true) }
];

// Closes on outside clicks (the avatar toggles it itself), Escape, blur and resizing
const onPointerDown = (e: PointerEvent) => {
  const target = e.target as Node;
  if (!el.value?.contains(target) && !props.anchor.contains(target)) emit("close");
};
const onKey = (e: KeyboardEvent) => e.key === "Escape" && emit("close");
const close = () => emit("close");

onMounted(() => {
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("keydown", onKey);
  window.addEventListener("blur", close);
  window.addEventListener("resize", close);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onPointerDown, true);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("blur", close);
  window.removeEventListener("resize", close);
});
</script>

<template>
  <Teleport to="body">
    <div ref="el" class="account-menu" :style="{ top: `${pos.top}px`, right: `${pos.right}px` }" role="menu">
      <div v-if="session?.name" class="who">
        <span class="name ytf-ellipsis">{{ session.name }}</span>
        <span v-if="session.handle" class="handle ytf-ellipsis">{{ session.handle }}</span>
      </div>
      <template v-for="item in items" :key="item.label">
        <hr v-if="item.divider" />
        <button class="item" role="menuitem" @click="choose(item.action)">
          <span class="label ytf-ellipsis">{{ item.label }}</span>
          <Icon v-if="item.external" name="external" :size="16" class="external" />
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.account-menu {
  position: fixed;
  z-index: 1000;
  min-width: 196px;
  max-width: 350px;
  padding: 4px;
  border-radius: 4px;
  background: #282828;
  box-shadow:
    0 16px 24px rgba(0, 0, 0, 0.3),
    0 6px 8px rgba(0, 0, 0, 0.2);
}

.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px 10px;
  margin-bottom: 4px;
  border-bottom: 1px solid hsla(0, 0%, 100%, 0.1);
}

.name {
  font-size: 14px;
  font-weight: 700;
}

.handle {
  color: var(--text-subdued);
  font-size: 12px;
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 40px;
  padding: 0 8px 0 12px;
  border-radius: 2px;
  color: hsla(0, 0%, 100%, 0.9);
  font-size: 14px;
  text-align: left;
}

.item:hover {
  background: hsla(0, 0%, 100%, 0.1);
}

.label {
  flex: 1;
}

.external {
  color: hsla(0, 0%, 100%, 0.9);
}

hr {
  margin: 4px 0;
  border: 0;
  border-top: 1px solid hsla(0, 0%, 100%, 0.1);
}
</style>
