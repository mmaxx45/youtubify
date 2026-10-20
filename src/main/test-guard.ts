import { app, BrowserView, session } from "electron";
import log from "electron-log";
import fs from "fs";
import path from "path";

// Safety guard for development test copies.
//
// Builds run from Claude Code's scratch area (%TEMP%\claude\...) are throwaway test copies used by the
// lead and by agents while developing. They must never touch the real user's signed-in YouTube Music:
// - they refuse to start on the default profile (that is the user's signed-in profile),
// - they can't sign in (Google sign-in pages are blocked),
// - they only send read-only YouTube Music requests (see allowedTestRequest),
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

// Signed-in test mode (YTF_SIGNED_IN_TEST=1, test copies only): the user allowed testing account features on
// their own account, limited to
// - playlists this mode created itself (private, named "Youtubify Test..."), remembered in the test profile,
// - following/unfollowing one podcast (YTF_TEST_PODCAST, the show's playlist id),
// - saving/removing one episode in Your Episodes (YTF_TEST_EPISODE, its video id).
// Everything else that changes the account stays blocked, and nothing may play (no listening history).
export const signedInTest = isTestCopy && process.env.YTF_SIGNED_IN_TEST === "1";
const testPodcast = process.env.YTF_TEST_PODCAST || undefined;
const testEpisode = process.env.YTF_TEST_EPISODE || undefined;
const createdFile = () => path.join(app.getPath("userData"), "test-playlists.json");
let created: Set<string> | null = null;
function createdPlaylists() {
  if (!created) {
    try {
      created = new Set(JSON.parse(fs.readFileSync(createdFile(), "utf8")));
    } catch {
      created = new Set();
    }
  }
  return created;
}

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function allowedSignedInWrite(endpoint: string, b: Body): boolean {
  switch (endpoint) {
    case "playlist/create":
      return typeof b.title === "string" && b.title.startsWith("Youtubify Test") && b.privacyStatus === "PRIVATE";
    case "playlist/delete":
      return createdPlaylists().has(b.playlistId);
    case "browse/edit_playlist": {
      if (createdPlaylists().has(b.playlistId)) return true;
      const [a, ...more] = Array.isArray(b.actions) ? b.actions : [];
      return (
        b.playlistId === "SE" &&
        !!testEpisode &&
        !more.length &&
        ((a?.action === "ACTION_ADD_VIDEO" && a.addedVideoId === testEpisode) ||
          (a?.action === "ACTION_REMOVE_VIDEO_BY_VIDEO_ID" && a.removedVideoId === testEpisode))
      );
    }
    case "like/like":
    case "like/removelike":
      return !!testPodcast && b.target?.playlistId === testPodcast && Object.keys(b.target).length === 1;
  }
  return false;
}

export function allowedTestRequest(endpoint: string, body: unknown): boolean {
  if (!isTestCopy || readOnlyEndpoints.has(endpoint)) return true;
  const ok = signedInTest && !!body && typeof body === "object" && allowedSignedInWrite(endpoint, body as Body);
  if (signedInTest) log.warn(`Youtubify signed-in test: ${ok ? "allowed" : "BLOCKED"} ${endpoint} ${JSON.stringify(body)}`);
  return ok;
}

/** Remember playlists created in signed-in test mode: only those may be edited or deleted. */
export function noteTestResponse(endpoint: string, result: unknown) {
  if (!signedInTest || endpoint !== "playlist/create") return;
  const id = (result as Body | null)?.playlistId;
  if (typeof id !== "string") return;
  createdPlaylists().add(id);
  fs.writeFileSync(createdFile(), JSON.stringify([...createdPlaylists()]));
}

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
  log.info(
    signedInTest
      ? `Youtubify test copy: SIGNED-IN TEST MODE (own profile, muted, writes only to its own test playlists, podcast ${testPodcast}, episode ${testEpisode})`
      : "Youtubify test copy: sandboxed (own profile, muted, read-only, no sign-in)"
  );
}

/** Block Google sign-in and quit if the YTM view is ever signed in. */
export function guardYtmView(ytmView: BrowserView, partition: string) {
  if (!isTestCopy || signedInTest) return;
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
