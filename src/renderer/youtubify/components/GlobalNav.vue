<script setup lang="ts">
// Spotify's global nav: history + menu left, Home + search centre. The bar doubles as the window's
// drag area; native window controls are overlaid on the right by Electron (titleBarOverlay).
import { computed, ref, watch } from "vue";
import { back, canGoBack, canGoForward, forward, navigate, route } from "../state/router";
import { getSuggestions } from "../ytm/client";
import Icon from "./Icon.vue";
import { closeYtmView, session, signIn, ytmVisible } from "../state/session";
import { openMenuAt } from "../state/menu";
import AccountMenu from "./AccountMenu.vue";
import SignOutDialog from "./SignOutDialog.vue";

const input = ref<HTMLInputElement | null>(null);
const query = ref(route.value.name === "search" ? route.value.query : "");
const focused = ref(false);
const suggestions = ref<string[]>([]);
const highlighted = ref(-1);

watch(route, r => {
  if (r.name === "search" && document.activeElement !== input.value) query.value = r.query;
  if (r.name !== "search" && document.activeElement !== input.value) query.value = "";
});

// A new query keeps the selected filter chip, like Spotify
function searchFor(q: string) {
  const r = route.value;
  navigate({ name: "search", query: q, filter: r.name === "search" ? r.filter : undefined }, r.name === "search");
}

let typingTimer: ReturnType<typeof setTimeout> | undefined;
let suggestTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, q => {
  highlighted.value = -1;
  clearTimeout(typingTimer);
  clearTimeout(suggestTimer);
  // Like Spotify, results update as you type
  typingTimer = setTimeout(() => {
    if (!focused.value) return;
    if (q.trim()) searchFor(q.trim());
  }, 450);
  suggestTimer = setTimeout(async () => {
    const want = q;
    const list = await getSuggestions(want).catch(() => []);
    if (query.value === want) suggestions.value = list.slice(0, 6);
  }, 150);
});

const showSuggestions = computed(() => focused.value && query.value.trim() && suggestions.value.length > 0);

function submit(text = query.value) {
  const q = text.trim();
  if (!q) return;
  query.value = q;
  suggestions.value = [];
  searchFor(q);
  input.value?.blur();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown" && suggestions.value.length) {
    highlighted.value = (highlighted.value + 1) % suggestions.value.length;
    e.preventDefault();
  } else if (e.key === "ArrowUp" && suggestions.value.length) {
    highlighted.value = (highlighted.value - 1 + suggestions.value.length) % suggestions.value.length;
    e.preventDefault();
  } else if (e.key === "Enter") submit(highlighted.value >= 0 ? suggestions.value[highlighted.value] : query.value);
  else if (e.key === "Escape") input.value?.blur();
}

function clear() {
  query.value = "";
  suggestions.value = [];
  input.value?.focus();
}

// Ctrl+K / Ctrl+L focus search like Spotify
window.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "l")) {
    e.preventDefault();
    input.value?.focus();
    input.value?.select();
  }
});

const isHome = computed(() => route.value.name === "home");

// Spotify's "•••" app menu (top left)
function openAppMenu(e: MouseEvent) {
  openMenuAt(e.currentTarget as HTMLElement, [
    { label: "Settings", action: () => navigate({ name: "settings" }) },
    { label: "Advanced settings", action: () => window.ytmd.openSettingsWindow() },
    "divider",
    { label: "Reload", action: () => location.reload() },
    { label: "Exit", action: () => window.ytf.quit() }
  ]);
}

const avatarButton = ref<HTMLElement | null>(null);
const accountMenuOpen = ref(false);
</script>

<template>
  <div class="nav">
    <div class="left">
      <button class="ytf-icon-button app-menu" title="Menu" aria-label="Menu" @click="openAppMenu">
        <Icon name="more" :size="16" />
      </button>
      <button class="history" :disabled="!canGoBack" title="Go back" aria-label="Go back" @click="back()">
        <Icon name="chevron-left" :size="16" />
      </button>
      <button class="history" :disabled="!canGoForward" title="Go forward" aria-label="Go forward" @click="forward()">
        <Icon name="chevron-right" :size="16" />
      </button>
    </div>

    <div class="center">
      <button class="home" :class="{ active: isHome }" title="Home" aria-label="Home" @click="navigate({ name: 'home' })">
        <Icon :name="isHome ? 'home-filled' : 'home'" :size="24" />
      </button>
      <div class="search" :class="{ focused }">
        <Icon name="search" :size="24" class="search-icon" />
        <input
          ref="input"
          v-model="query"
          type="text"
          placeholder="What do you want to play?"
          spellcheck="false"
          aria-label="What do you want to play?"
          @focus="focused = true"
          @blur="focused = false"
          @keydown="onKey"
        />
        <button v-if="query" class="ytf-icon-button clear" aria-label="Clear search" @mousedown.prevent="clear">
          <Icon name="close" :size="16" />
        </button>
        <span class="divider" />
        <button class="ytf-icon-button browse" title="Browse" aria-label="Browse" @mousedown.prevent="navigate({ name: 'search', query: '' })">
          <Icon name="browse" :size="24" />
        </button>
        <ul v-if="showSuggestions" class="suggestions" role="listbox">
          <li v-for="(s, i) in suggestions" :key="s" role="option" :class="{ highlighted: i === highlighted }" @mousedown.prevent="submit(s)">
            <Icon name="search" :size="16" />
            <span class="ytf-ellipsis">{{ s }}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="right">
      <button v-if="ytmVisible" class="back-to-app" @click="closeYtmView">
        <Icon name="chevron-left" :size="16" />
        Back to Youtubify
      </button>
      <template v-else-if="session">
        <button v-if="!session.loggedIn" class="login" @click="signIn">Log in</button>
        <button
          v-else
          ref="avatarButton"
          class="avatar"
          :title="session.name"
          :aria-label="session.name || 'Account'"
          aria-haspopup="menu"
          :aria-expanded="accountMenuOpen"
          @click="accountMenuOpen = !accountMenuOpen"
        >
          <img v-if="session.avatar" :src="session.avatar" alt="" />
          <span v-else>{{ (session.name || "?").slice(0, 1).toUpperCase() }}</span>
        </button>
      </template>
      <AccountMenu v-if="accountMenuOpen && avatarButton && session?.loggedIn && !ytmVisible" :anchor="avatarButton" @close="accountMenuOpen = false" />
      <SignOutDialog />
    </div>
  </div>
</template>

<style scoped>
.nav {
  grid-area: nav;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--nav-height);
  padding: 0 8px;
  -webkit-app-region: drag;
}

.nav button,
.nav input,
.search {
  -webkit-app-region: no-drag;
}

.left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.app-menu {
  width: 32px;
  height: 32px;
  margin-right: 8px;
}

.history {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: var(--text-base);
}

.history:disabled {
  color: var(--essential-subdued);
  cursor: not-allowed;
}

.center {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 546px;
  min-width: 0;
}

.home {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--background-elevated-base);
  color: var(--text-subdued);
  transition:
    transform 0.1s,
    color 0.1s;
}

.home:hover,
.home.active {
  color: var(--text-base);
  transform: scale(1.04);
}

.search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 48px;
  padding: 0 12px;
  border-radius: 9999px;
  background: var(--background-elevated-base);
  box-shadow: inset 0 0 0 1px transparent;
  transition:
    background-color 0.2s,
    box-shadow 0.2s;
}

.search:hover {
  background: var(--background-elevated-highlight);
  box-shadow: inset 0 0 0 1px #535353;
}

.search.focused {
  box-shadow: inset 0 0 0 2px var(--text-base);
}

.search-icon {
  color: var(--text-subdued);
}

.search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  margin: 0 8px;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 16px;
}

.search input::placeholder {
  color: var(--text-subdued);
}

.divider {
  width: 1px;
  height: 24px;
  margin: 0 8px;
  background: var(--essential-subdued);
}

.clear,
.browse {
  width: 32px;
  height: 32px;
}

.suggestions {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 50;
  margin: 0;
  padding: 4px;
  list-style: none;
  border-radius: var(--radius-small);
  background: var(--background-elevated-highlight);
  box-shadow: 0 16px 24px rgba(0, 0, 0, 0.3);
}

.suggestions li {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 12px;
  border-radius: 2px;
  font-size: 14px;
  cursor: pointer;
}

.suggestions li:hover,
.suggestions li.highlighted {
  background: hsla(0, 0%, 100%, 0.1);
}

/* Leaves room for the native window controls drawn over the top-right corner */
.right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1;
  min-width: 140px;
  /* keep clear of the native window controls overlaid on the right */
  padding-right: 146px;
}

.login {
  height: 48px;
  padding: 0 32px;
  border-radius: 9999px;
  background: var(--text-base);
  color: #000;
  font-size: 16px;
  font-weight: 700;
  transition: transform 0.1s;
}

.login:hover {
  transform: scale(1.04);
}

.back-to-app {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 16px 0 12px;
  border-radius: 9999px;
  background: var(--background-elevated-base);
  font-size: 14px;
  font-weight: 700;
}

.back-to-app:hover {
  background: var(--background-elevated-highlight);
}

/* Spotify's avatar with the dark ring */
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--background-elevated-base);
  transition: transform 0.1s;
}

.avatar:hover {
  transform: scale(1.04);
}

.avatar img,
.avatar span {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.avatar span {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f573a0;
  color: #000;
  font-weight: 700;
}
</style>
