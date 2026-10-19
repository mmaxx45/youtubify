<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from "vue";
import TitleBar from "../../components/TitleBar.vue";
import YTMViewLoading from "../../components/YTMViewLoading.vue";
import logo from "~assets/icons/ytmd_white.png";

// Youtubify interface (Spotify-style UI over a hidden YTM view) or the classic visible YTM view.
// Loaded lazily so its global styles never touch the classic window.
const YoutubifyApp = defineAsyncComponent(() => import("../../youtubify/App.vue"));
const mode = ref<"youtubify" | "classic" | null>(null);

const keyboardFocus = ref<HTMLElement>(null);
const keyboardFocusZero = ref<HTMLElement>(null);

onMounted(async () => {
  const config = await window.ytf.getConfig().catch(() => ({ youtubifyUi: false }));
  mode.value = config.youtubifyUi ? "youtubify" : "classic";
  window.ytmd.requestWindowState();
  if (mode.value === "youtubify") return;

  window.onfocus = () => {
    if (keyboardFocusZero.value && document.activeElement != keyboardFocusZero.value) {
      // This resets the focus of keyboard navigation
      keyboardFocusZero.value.focus();
      keyboardFocusZero.value.blur();
    }
  };
});

function focusYtm() {
  window.ytmd.switchFocus("ytm");
}
</script>

<template>
  <YoutubifyApp v-if="mode === 'youtubify'" />
  <template v-else-if="mode === 'classic'">
    <div ref="keyboardFocusZero" tabindex="0"></div>
    <Suspense>
      <TitleBar is-main-window has-home-button has-settings-button has-minimize-button has-maximize-button title="Youtubify" :icon-file="logo" />
    </Suspense>
    <Suspense>
      <YTMViewLoading />
    </Suspense>
    <div ref="keyboardFocus" tabindex="32767" @focus="focusYtm"></div>
  </template>
</template>
