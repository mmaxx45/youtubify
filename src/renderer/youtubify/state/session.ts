// Signed-in YouTube account (for the avatar / "Log in" button) and whether the YTM view is
// currently shown for Google sign-in or cookie consent.

import { ref } from "vue";

export const session = ref<{ loggedIn: boolean; name?: string; avatar?: string } | null>(null);
export const ytmVisible = ref(false);

let started = false;
export function startSessionSync() {
  if (started) return;
  started = true;
  window.ytf.onYtmVisible(v => (ytmVisible.value = v));
  // Signing in or accepting consent reloads YTM with a different session: start over cleanly
  window.ytf.onSessionChanged(() => location.reload());
}

export async function refreshSession() {
  session.value = await window.ytf.getSession().catch((): null => null);
}

export const signIn = () => window.ytf.signIn();
export const closeYtmView = () => window.ytf.closeYtmView();
