// The user's YouTube Music library for the "Your Library" sidebar.

import { ref } from "vue";
import type { Card } from "../ytm/models";
import { getLibrary, getLibraryPodcasts } from "../ytm/client";

export const playlists = ref<Card[]>([]);
export const albums = ref<Card[]>([]);
export const artists = ref<Card[]>([]);
export const loading = ref(false);
export const error = ref("");

// Followed shows load on their own so a podcast hiccup never blanks the rest of the library
export const podcasts = ref<Card[]>([]);
async function refreshPodcasts() {
  try {
    podcasts.value = await getLibraryPodcasts();
  } catch {
    // keep what we had; the chip just stays hidden when there are none
  }
}

export async function refreshLibrary() {
  loading.value = true;
  error.value = "";
  refreshPodcasts();
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
