<script setup lang="ts">
// One level of the context menu; submenus render another MenuPanel beside the hovered row.
import { computed, nextTick, onMounted, ref } from "vue";
import type { MenuEntry, MenuItem } from "../state/menu";
import { closeMenu } from "../state/menu";
import Icon from "./Icon.vue";

const props = defineProps<{ items: MenuEntry[]; x: number; y: number; searchable?: boolean }>();

const el = ref<HTMLElement | null>(null);
const pos = ref({ left: props.x, top: props.y });
const filter = ref("");
const open = ref<{ index: number; items: MenuEntry[] | null; x: number; y: number; searchable: boolean } | null>(null);
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

// Keep the panel on screen, flipping left/up when it would overflow
onMounted(async () => {
  await nextTick();
  const r = el.value!.getBoundingClientRect();
  pos.value = {
    left: Math.max(8, props.x + r.width > innerWidth - 8 ? props.x - r.width : props.x),
    top: Math.max(8, Math.min(props.y, innerHeight - r.height - 8))
  };
});

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return props.items;
  return props.items.filter(i => i !== "divider" && i.label.toLowerCase().includes(q));
});

function hover(index: number, item: MenuItem, event: MouseEvent) {
  clearTimeout(hoverTimer);
  if (!item.submenu) {
    hoverTimer = setTimeout(() => (open.value = null), 150);
    return;
  }
  if (open.value?.index === index) return;
  const row = event.currentTarget as HTMLElement;
  const r = row.getBoundingClientRect();
  const panel = el.value!.getBoundingClientRect();
  const x = panel.right + 4 + 240 > innerWidth ? panel.left - 244 : panel.right - 4;
  open.value = { index, items: null, x, y: r.top - 4, searchable: !!item.searchable };
  Promise.resolve(item.submenu()).then(items => {
    if (open.value?.index === index) open.value = { ...open.value, items };
  });
}

function choose(item: MenuItem) {
  if (item.disabled || item.submenu) return;
  closeMenu();
  item.action?.();
}
</script>

<template>
  <div ref="el" class="menu" :style="{ left: `${pos.left}px`, top: `${pos.top}px` }" role="menu" @contextmenu.prevent>
    <div v-if="searchable" class="find">
      <Icon name="search" :size="16" />
      <input v-model="filter" placeholder="Find a playlist" autofocus @keydown.stop />
    </div>
    <template v-for="(item, i) in shown" :key="i">
      <hr v-if="item === 'divider'" />
      <button
        v-else
        class="item"
        :class="{ checked: item.checked, open: open?.index === i }"
        :disabled="item.disabled"
        role="menuitem"
        @mouseenter="hover(i, item, $event)"
        @click="choose(item)"
      >
        <Icon v-if="item.icon" :name="item.icon" :size="16" class="icon" />
        <span class="label ytf-ellipsis">{{ item.label }}</span>
        <Icon v-if="item.checked && !item.submenu" name="check-circle" :size="16" class="check" />
        <Icon v-if="item.submenu" name="chevron-right" :size="16" class="chev" />
      </button>
    </template>
    <div v-if="searchable && !shown.length" class="empty">No playlists found</div>
  </div>
  <MenuPanel v-if="open?.items" :key="open.index" :items="open.items" :x="open.x" :y="open.y" :searchable="open.searchable" />
  <div v-else-if="open" class="menu loading" :style="{ left: `${open.x}px`, top: `${open.y}px` }">
    <div class="empty">Loading…</div>
  </div>
</template>

<style scoped>
.menu {
  position: fixed;
  z-index: 1000;
  min-width: 196px;
  max-width: 350px;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 4px;
  border-radius: 4px;
  background: #282828;
  box-shadow:
    0 16px 24px rgba(0, 0, 0, 0.3),
    0 6px 8px rgba(0, 0, 0, 0.2);
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

.item:hover:not(:disabled),
.item.open {
  background: hsla(0, 0%, 100%, 0.1);
}

.item:disabled {
  color: var(--essential-subdued);
  cursor: default;
}

.icon {
  color: var(--text-subdued);
}

.label {
  flex: 1;
}

.checked .label {
  color: var(--text-bright-accent);
}

.check {
  color: var(--essential-bright-accent);
}

.chev {
  color: var(--text-subdued);
}

hr {
  margin: 4px 0;
  border: 0;
  border-top: 1px solid hsla(0, 0%, 100%, 0.1);
}

.find {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  margin-bottom: 4px;
  padding: 0 12px;
  border-radius: 4px;
  background: #3e3e3e;
  color: var(--text-subdued);
}

.find input {
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 14px;
}

.empty {
  padding: 12px;
  color: var(--text-subdued);
  font-size: 14px;
}
</style>
