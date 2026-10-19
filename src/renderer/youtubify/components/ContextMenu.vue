<script setup lang="ts">
// Hosts the app-wide context menu and closes it on outside clicks, Escape, scrolling or blur.
import { onBeforeUnmount, onMounted } from "vue";
import { closeMenu, menu } from "../state/menu";
import MenuPanel from "./MenuPanel.vue";

function onPointerDown(e: PointerEvent) {
  if (menu.value && !(e.target as HTMLElement).closest(".menu")) closeMenu();
}
const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
const onWheel = (e: WheelEvent) => !(e.target as HTMLElement).closest(".menu") && closeMenu();

onMounted(() => {
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("keydown", onKey);
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("blur", closeMenu);
  window.addEventListener("resize", closeMenu);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onPointerDown, true);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("wheel", onWheel);
  window.removeEventListener("blur", closeMenu);
  window.removeEventListener("resize", closeMenu);
});
</script>

<template>
  <Teleport to="body">
    <MenuPanel v-if="menu" :key="`${menu.x},${menu.y}`" :items="menu.items" :x="menu.x" :y="menu.y" />
  </Teleport>
</template>
