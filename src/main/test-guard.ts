import { app, BrowserView, session } from "electron";
import log from "electron-log";
import path from "path";

// Safety guard for development test copies.
//
// Builds run from Claude Code's scratch area (%TEMP%\claude\...) are throwaway test copies used by the
// lead and by agents while developing. They must never touch the real user's signed-in YouTube Music:
// - they refuse to start on the default profile (that is the user's signed-in profile),
// - they can't sign in (Google sign-in pages are blocked),
// - they only send read-only YouTube Music requests (see allowedTestEndpoint),
// - they quit at once if they ever find themselves signed in,
// - and they stay out of the user's way: always muted, never focus-stealing, no protocol handler or
//   autostart registration.
// The user's own copies (./out, installed releases) are unaffected.

export const isTestCopy = (app.isPackaged && /[\\/]Temp[\\/]claude[\\/]/i.test(process.execPath)) || process.env.YTF_TEST_INSTANCE === "1";

// Read-only YouTube Music API calls; everything else (likes, playlist edits, library, follows,
// feedback, ...) is refused in test copies.
const readOnlyEndpoints = new Set([
  "browse",
  "search",
  "next",
  "music/get_search_suggestions",
  "music/get_queue",
  "playlist/get_add_to_playlist",
  "account/account_menu"
]);
export const allowedTestEndpoint = (endpoint: string) => !isTestCopy || readOnlyEndpoints.has(endpoint);

/** Run before anything touches the profile (single-instance lock, stores). */
export function enforceTestCopyProfile() {
  if (!isTestCopy) return;
  const defaultUserData = path.join(app.getPath("appData"), app.getName());
  const userData = app.getPath("userData");
  if (path.resolve(userData).toLowerCase() === path.resolve(defaultUserData).toLowerCase()) {
    // Without --user-data-dir this copy would open the user's real, signed-in profile
    console.error("Youtubify test copy refused to start: pass --user-data-dir=<throwaway test profile>");
    app.exit(1);
    return;
  }
  app.commandLine.appendSwitch("mute-audio");
  // Test windows live off-screen and never take focus; keep them rendering for screenshots
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  log.info("Youtubify test copy: sandboxed (own profile, muted, read-only, no sign-in)");
}

/** Block Google sign-in and quit if the YTM view is ever signed in. */
export function guardYtmView(ytmView: BrowserView, partition: string) {
  if (!isTestCopy) return;
  session.fromPartition(partition).webRequest.onBeforeRequest({ urls: ["*://accounts.google.com/*", "*://accounts.youtube.com/*"] }, (details, callback) => {
    log.warn("Youtubify test copy: blocked a sign-in request");
    callback({ cancel: true });
  });
  const check = async () => {
    if (ytmView.webContents.isDestroyed()) return clearInterval(timer);
    const cookies = await session
      .fromPartition(partition)
      .cookies.get({ name: "SAPISID" })
      .catch((): Electron.Cookie[] => []);
    const loggedIn = await ytmView.webContents.executeJavaScript("!!window.ytcfg?.get?.('LOGGED_IN')", true).catch(() => false);
    if (cookies.length || loggedIn) {
      log.error("Youtubify test copy: found a signed-in session, quitting immediately");
      app.exit(1);
    }
  };
  const timer = setInterval(check, 3000);
  ytmView.webContents.on("did-finish-load", check);
}
