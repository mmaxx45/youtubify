<script setup lang="ts">
// A "Browse all" genre/mood page: title header plus playlist rows.
import { ref, watch } from "vue";
import type { CategoryPage } from "../ytm/models";
import { getCategory } from "../ytm/client";
import Shelf from "../components/Shelf.vue";

const props = defineProps<{ id: string; params?: string; title: string }>();

const page = ref<CategoryPage | null>(null);
const error = ref("");

watch(
  () => [props.id, props.params],
  async () => {
    page.value = null;
    error.value = "";
    try {
      page.value = await getCategory(props.id, props.params);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="view">
    <header>
      <h1>{{ page?.title || title }}</h1>
    </header>
    <div class="content">
      <p v-if="error" class="state">Couldn't load this category. {{ error }}</p>
      <div v-else-if="!page" class="skeleton ytf-skeleton" />
      <Shelf v-for="s in page?.shelves ?? []" v-else :key="s.key" :shelf="s" />
    </div>
  </div>
</template>

<style scoped>
.view {
  height: 100%;
  overflow-y: auto;
}

header {
  padding: 96px 24px 24px;
  background: linear-gradient(rgb(83, 83, 83), var(--background-base));
}

h1 {
  margin: 0;
  font-size: 72px;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.content {
  padding: 24px 12px 32px;
}

.state {
  padding: 0 12px;
  color: var(--text-subdued);
}

.skeleton {
  height: 260px;
  margin: 0 12px;
}
</style>
