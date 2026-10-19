// The app's settings for the in-app Settings page. It is the same store (and the same keys) the
// classic settings window edits, so both stay in sync; changes from either side arrive here.

import { shallowRef } from "vue";
import type { StoreSchema } from "~shared/store/schema";

type Section = "general" | "appearance" | "playback" | "integrations" | "lastfm";
export type Settings = Pick<StoreSchema, Section>;

export const settings = shallowRef<Settings | null>(null);
// As first loaded (what the app is running with, unless the classic window changed it before), to
// tell when a setting that only applies after a restart has changed
export const atStartup = shallowRef<Settings | null>(null);
export const safeStorageAvailable = shallowRef(false);
export const discordConnectionFailed = shallowRef(false);

let started = false;
export async function loadSettings() {
  if (!started) {
    started = true;
    window.ytmd.store.onDidAnyChange(s => (settings.value = s));
    window.ytmd.memoryStore.onStateChanged(s => {
      safeStorageAvailable.value = !!s.safeStorageAvailable;
      discordConnectionFailed.value = !!s.discordPresenceConnectionFailed;
    });
  }
  const store = window.ytmd.store;
  const [general, appearance, playback, integrations, lastfm] = await Promise.all([
    store.get("general"),
    store.get("appearance"),
    store.get("playback"),
    store.get("integrations"),
    store.get("lastfm")
  ]);
  settings.value = { general, appearance, playback, integrations, lastfm };
  if (!atStartup.value) atStartup.value = settings.value;
  safeStorageAvailable.value = !!(await window.ytmd.memoryStore.get("safeStorageAvailable"));
  discordConnectionFailed.value = !!(await window.ytmd.memoryStore.get("discordPresenceConnectionFailed"));
}

export function setSetting<S extends Section, K extends keyof Settings[S] & string>(section: S, key: K, value: Settings[S][K]) {
  window.ytmd.store.set(`${section}.${key}`, value);
  // Show the change right away; the store's change event confirms it
  if (settings.value) settings.value = { ...settings.value, [section]: { ...settings.value[section], [key]: value } };
}
