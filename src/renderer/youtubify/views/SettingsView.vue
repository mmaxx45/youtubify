<script setup lang="ts">
// Spotify's Settings page: sections with the setting on the left and its control on the right.
// It edits the same store as the classic settings window, which "Show advanced settings" opens for
// everything not listed here.
import { computed, onMounted, ref } from "vue";
import Icon from "../components/Icon.vue";
import Toggle from "../components/Toggle.vue";
import { atStartup, discordConnectionFailed, loadSettings, safeStorageAvailable, setSetting, settings } from "../state/settings";
import { openAccountPage, session, signIn, signOutPrompt } from "../state/session";

const version = ref("");
const isMac = navigator.userAgent.includes("Macintosh");

onMounted(async () => {
  loadSettings();
  version.value = (await window.ytf.getAppVersion().catch((): string => "")) ?? "";
});

const s = settings;
// Missing on stores created before the interface existed, which counts as on
const youtubifyUi = computed(() => s.value?.appearance.spotifyUi !== false);
const restartNeeded = computed(() => {
  const now = s.value;
  const then = atStartup.value;
  if (!now || !then) return false;
  return (
    (now.appearance.spotifyUi !== false) !== (then.appearance.spotifyUi !== false) ||
    now.general.disableHardwareAcceleration !== then.general.disableHardwareAcceleration
  );
});

function retryDiscord() {
  setSetting("integrations", "discordPresenceEnabled", false);
  setSetting("integrations", "discordPresenceEnabled", true);
}

function disconnectLastFm() {
  setSetting("lastfm", "sessionKey", null);
  setSetting("integrations", "lastFMEnabled", false);
}

const askSignOut = () => (signOutPrompt.value = true);
const restart = () => window.ytf.restart();
const openAdvanced = () => window.ytmd.openSettingsWindow();
</script>

<template>
  <div class="view">
    <div class="page">
      <h1>Settings</h1>

      <div v-if="restartNeeded" class="restart">
        <span>Restart Youtubify to apply your changes.</span>
        <button class="outline" @click="restart">Restart app</button>
      </div>

      <template v-if="s">
        <section>
          <h2>Account</h2>
          <div v-if="session?.loggedIn" class="row">
            <span class="label">
              Logged in to YouTube Music<template v-if="session.name">
                as <strong>{{ session.name }}</strong></template
              >
            </span>
            <button class="outline" @click="askSignOut">Log out</button>
          </div>
          <div v-else class="row">
            <span class="label">Log in to YouTube Music to get your library, playlists and recommendations</span>
            <button class="outline" @click="signIn">Log in</button>
          </div>
          <div class="row">
            <span class="label">Manage your Google Account and YouTube Music membership</span>
            <button class="outline" @click="openAccountPage">
              Manage account
              <Icon name="external" :size="16" />
            </button>
          </div>
        </section>

        <section>
          <h2>Display</h2>
          <div class="row">
            <span class="label">
              Use the Youtubify interface. Turn it off for the classic YouTube Music view
              <span class="note">(requires a restart)</span>
            </span>
            <Toggle :model-value="youtubifyUi" label="Youtubify interface" @update:model-value="setSetting('appearance', 'spotifyUi', $event)" />
          </div>
          <div class="row">
            <span class="label">Show desktop notifications when the song changes</span>
            <Toggle
              :model-value="s.general.showNotificationOnSongChange"
              label="Song change notifications"
              @update:model-value="setSetting('general', 'showNotificationOnSongChange', $event)"
            />
          </div>
          <div class="row">
            <span class="label">Show song progress on the taskbar</span>
            <Toggle
              :model-value="s.playback.progressInTaskbar"
              label="Song progress on the taskbar"
              @update:model-value="setSetting('playback', 'progressInTaskbar', $event)"
            />
          </div>
        </section>

        <section>
          <h2>Playback</h2>
          <div class="row">
            <span class="label">Continue where you left off when Youtubify starts</span>
            <Toggle
              :model-value="s.playback.continueWhereYouLeftOff"
              label="Continue where you left off"
              @update:model-value="setSetting('playback', 'continueWhereYouLeftOff', $event)"
            />
          </div>
          <div v-if="s.playback.continueWhereYouLeftOff" class="row indented">
            <span class="label">Start paused</span>
            <Toggle
              :model-value="s.playback.continueWhereYouLeftOffPaused"
              label="Start paused"
              @update:model-value="setSetting('playback', 'continueWhereYouLeftOffPaused', $event)"
            />
          </div>
          <div class="row">
            <span class="label">Ratio volume: make the volume slider follow how loud it sounds</span>
            <Toggle :model-value="s.playback.ratioVolume" label="Ratio volume" @update:model-value="setSetting('playback', 'ratioVolume', $event)" />
          </div>
        </section>

        <section>
          <h2>Social</h2>
          <div class="row">
            <span class="label">
              Share what I'm listening to on Discord
              <span v-if="s.integrations.discordPresenceEnabled && discordConnectionFailed" class="note block warn">
                Couldn't connect to Discord.
                <button class="ytf-link inline" @click="retryDiscord">Try again</button>
              </span>
            </span>
            <Toggle
              :model-value="s.integrations.discordPresenceEnabled"
              label="Discord"
              @update:model-value="setSetting('integrations', 'discordPresenceEnabled', $event)"
            />
          </div>
          <div class="row">
            <span class="label">
              Scrobble what I listen to on Last.fm
              <span v-if="!safeStorageAvailable" class="note block">Not available on this computer (secure storage is missing)</span>
              <span v-else-if="s.integrations.lastFMEnabled && s.lastfm.sessionKey" class="note block">
                Connected.
                <button class="ytf-link inline" @click="disconnectLastFm">Disconnect</button>
              </span>
              <span v-else-if="s.integrations.lastFMEnabled" class="note block">Not connected yet: allow Youtubify on the Last.fm page in your browser</span>
            </span>
            <Toggle
              :model-value="s.integrations.lastFMEnabled"
              :disabled="!safeStorageAvailable"
              label="Last.fm"
              @update:model-value="setSetting('integrations', 'lastFMEnabled', $event)"
            />
          </div>
        </section>

        <section>
          <h2>Startup and window behaviour</h2>
          <div class="row">
            <span class="label">Open Youtubify automatically after you log into the computer</span>
            <Toggle :model-value="s.general.startOnBoot" label="Start on boot" @update:model-value="setSetting('general', 'startOnBoot', $event)" />
          </div>
          <div v-if="!isMac" class="row">
            <span class="label">Close button should minimize Youtubify to the system tray</span>
            <Toggle
              :model-value="s.general.hideToTrayOnClose"
              label="Hide to tray on close"
              @update:model-value="setSetting('general', 'hideToTrayOnClose', $event)"
            />
          </div>
        </section>

        <section>
          <h2>Compatibility</h2>
          <div class="row">
            <span class="label">Enable hardware acceleration <span class="note">(requires a restart)</span></span>
            <Toggle
              :model-value="!s.general.disableHardwareAcceleration"
              label="Hardware acceleration"
              @update:model-value="setSetting('general', 'disableHardwareAcceleration', !$event)"
            />
          </div>
        </section>

        <button class="outline advanced" @click="openAdvanced">Show advanced settings</button>
        <p v-if="version" class="version">Youtubify version {{ version }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.view {
  height: 100%;
  overflow-y: auto;
}

.page {
  max-width: 880px;
  padding: 32px 32px 64px;
}

h1 {
  margin: 0 0 8px;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

section {
  margin-top: 32px;
}

h2 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 40px;
  padding: 6px 0;
}

.row.indented {
  padding-left: 24px;
}

.label {
  color: var(--text-subdued);
  font-size: 14px;
  line-height: 20px;
}

.label strong {
  color: var(--text-base);
  font-weight: 700;
}

.note {
  font-size: 12px;
  line-height: 18px;
}

.note.block {
  display: block;
}

.note.warn {
  color: #f3727f;
}

.inline {
  color: var(--text-base);
  font-size: 12px;
  font-weight: 700;
}

/* Spotify's outlined secondary button */
.outline {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 8px;
  height: 32px;
  padding: 0 16px;
  border-radius: 9999px;
  box-shadow: inset 0 0 0 1px #7c7c7c;
  color: var(--text-base);
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  transition:
    transform 0.1s,
    box-shadow 0.1s;
}

.outline:hover {
  box-shadow: inset 0 0 0 1px var(--text-base);
  transform: scale(1.04);
}

.restart {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: var(--radius-medium);
  background: var(--background-elevated-highlight);
  font-size: 14px;
}

.advanced {
  margin-top: 48px;
}

.version {
  margin: 24px 0 0;
  color: var(--text-subdued);
  font-size: 12px;
}
</style>
