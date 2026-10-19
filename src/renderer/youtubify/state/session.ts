// Signed-in YouTube account (for the avatar / "Log in" button) and whether the YTM view is
// currently shown for Google sign-in or cookie consent.

import { ref } from "vue";

export const session = ref<{ loggedIn: boolean; name?: string; handle?: string; avatar?: string; channelId?: string } | null>(null);
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
export const signOut = () => window.ytf.signOut();
// "Log out" asks first (SignOutDialog); set from the account menu and the Settings page
export const signOutPrompt = ref(false);
// Spotify's "Account" opens the account website in the browser
export const openAccountPage = () => window.ytf.openExternal("https://myaccount.google.com/");
