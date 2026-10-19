// The user's YouTube Music library for the "Your Library" sidebar.

import { ref } from "vue";
import type { Card } from "../ytm/models";
import { getLibrary } from "../ytm/client";

export const playlists = ref<Card[]>([]);
export const albums = ref<Card[]>([]);
export const artists = ref<Card[]>([]);
export const loading = ref(false);
export const error = ref("");

export async function refreshLibrary() {
  loading.value = true;
  error.value = "";
  try {
    const lib = await getLibrary();
    playlists.value = lib.playlists;
    albums.value = lib.albums;
    artists.value = lib.artists;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
