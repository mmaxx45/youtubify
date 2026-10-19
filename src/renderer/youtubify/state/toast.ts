// Spotify's little confirmation toast ("Added to Liked Songs").

import { ref } from "vue";

export const toastMessage = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string) {
  toastMessage.value = message;
  clearTimeout(timer);
  timer = setTimeout(() => (toastMessage.value = ""), 3000);
}
