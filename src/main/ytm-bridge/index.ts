import { app, BrowserView, BrowserWindow, ipcMain, shell } from "electron";
import log from "electron-log";

import playerStateStore from "../player-state-store";
import innertubeScript from "./innertube.script.js?raw";
import { allowedTestRequest, isTestCopy, noteTestResponse, signedInTest } from "../test-guard";

// Bridge between the Youtubify (Spotify-style) UI in the main window and the hidden YouTube Music
// view that does the actual playback. The UI asks for data through YTM's own signed-in API, sends
// remote-control commands, and receives player state pushes. The view is only shown when it leaves
// YouTube Music (Google sign-in, cookie consent), since those pages need the user to interact.

// Commands the UI may forward to the YTM view's remote-control handler (see ytmview/preload.ts).
const allowedCommands = new Set([
  "playPause",
  "play",
  "pause",
  "next",
  "previous",
  "toggleLike",
  "toggleDislike",
  "setVolume",
  "mute",
  "unmute",
  "repeatMode",
  "seekTo",
  "shuffle",
  "playQueueIndex",
  "navigate"
]);

// Only plain watch endpoints from YTM data may be navigated to (no arbitrary commands)
const isPlayableEndpoint = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.length === 1 && (keys[0] === "watchEndpoint" || keys[0] === "watchPlaylistEndpoint");
};

const YTM_URL = "https://music.youtube.com/";
const SIGN_IN_URL =
  "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true&continue=" +
  encodeURIComponent("https://www.youtube.com/signin?action_handle_signin=true&next=https%3A%2F%2Fmusic.youtube.com%2F");
// Fallback when YTM's account menu has no "Sign out" link
const SIGN_OUT_URL = "https://www.youtube.com/logout";

// Account links the UI may open in the default browser (and sign-out targets): https on Google/YouTube only
const isAccountUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)(google|youtube)\.com$/.test(url.hostname);
  } catch {
    return false;
  }
};

export interface YtmBridgeContext {
  getMainWindow: () => BrowserWindow | null;
  getYtmView: () => BrowserView | null;
  // Youtubify UI mode on (the bridge stays inert in the classic view)
  isEnabled: () => boolean;
  // Height of the Youtubify top bar the view is shown below
  topOffset: number;
}

export function setupYtmBridge({ getMainWindow, getYtmView, isEnabled, topOffset }: YtmBridgeContext) {
  const fromMainWindow = (sender: Electron.WebContents) => sender === getMainWindow()?.webContents;
  let visible = false;
  // Set while the view runs through YouTube's sign-out redirects
  let signingOut = false;
  const providedViews = new WeakSet<BrowserView>();

  const send = (channel: string, ...args: unknown[]) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
  };

  const setVisible = (show: boolean) => {
    const mainWindow = getMainWindow();
    const ytmView = getYtmView();
    if (!mainWindow || !ytmView || visible === show) return;
    if (show) {
      mainWindow.addBrowserView(ytmView);
      const bounds = mainWindow.getContentBounds();
      ytmView.setBounds({ x: 0, y: topOffset, width: bounds.width, height: bounds.height - topOffset });
      ytmView.webContents.focus();
    } else {
      mainWindow.removeBrowserView(ytmView);
    }
    visible = show;
    send("ytf:ytmVisible", show);
  };

  const onUrl = (url: string) => {
    if (!isEnabled()) return;
    let host = "";
    let path = "";
    try {
      ({ hostname: host, pathname: path } = new URL(url));
    } catch {
      return;
    }
    if (host !== "music.youtube.com") {
      // Signing out can end on YouTube's home page: carry on to YouTube Music instead of showing it.
      // (accounts.youtube.com and Google's pages are part of the sign-out itself and are left alone)
      if (signingOut && (host === "www.youtube.com" || host === "youtube.com") && !path.startsWith("/logout")) {
        getYtmView()?.webContents.loadURL(YTM_URL);
        return;
      }
      log.info(`Youtubify: showing YouTube Music view for ${host}`);
      setVisible(true);
    } else if (visible || signingOut) {
      // Back from sign-in/consent/sign-out: the session may have changed, so the UI reloads its data
      signingOut = false;
      setVisible(false);
      send("ytf:sessionChanged");
    }
  };

  ipcMain.handle("ytf:innertube", async (event, endpoint: unknown, body: unknown) => {
    if (!fromMainWindow(event.sender)) throw new Error("ytf:innertube is only available to the main window");
    if (typeof endpoint !== "string" || !/^[a-z_/]+$/.test(endpoint)) throw new Error("invalid innertube endpoint");
    // Development test copies may only read, or write to their own test data (test-guard.ts)
    if (!allowedTestRequest(endpoint, body)) throw new Error(endpoint + " is blocked in test copies");
    const ytmView = getYtmView();
    if (!ytmView) throw new Error("YouTube Music is not loaded");
    const contents = ytmView.webContents;
    // Installing is idempotent; doing it per call covers reloads of the YTM view.
    await contents.executeJavaScript(innertubeScript, true);
    const result = await contents.executeJavaScript(`window.__ytfInnertube(${JSON.stringify(endpoint)}, ${JSON.stringify(body ?? {})})`, true);
    noteTestResponse(endpoint, result);
    return result;
  });

  ipcMain.handle("ytf:session", async event => {
    if (!fromMainWindow(event.sender)) return null;
    const ytmView = getYtmView();
    if (!ytmView) return { loggedIn: false };
    await ytmView.webContents.executeJavaScript(innertubeScript, true);
    return ytmView.webContents.executeJavaScript("window.__ytfSession()", true);
  });

  ipcMain.on("ytf:command", async (event, command: unknown, value: unknown) => {
    if (!fromMainWindow(event.sender)) return;
    if (typeof command !== "string" || !allowedCommands.has(command)) {
      log.warn(`Ignoring unknown Youtubify command ${String(command)}`);
      return;
    }
    // Nothing plays on the user's account while testing, so their listening history stays untouched
    if (signedInTest && command !== "pause") return log.warn(`Youtubify signed-in test: blocked command ${command}`);
    const contents = getYtmView()?.webContents;
    if (!contents) return;
    // The hidden view never receives real clicks, and its autoplay policy may require user
    // activation; running a no-op as a user gesture grants it so play/resume aren't blocked.
    await contents.executeJavaScript("void 0", true).catch((): undefined => undefined);
    if (command === "navigate") {
      // Dispatched in the page's main world: the preload's isolated-world event loses its detail
      if (!isPlayableEndpoint(value)) return;
      contents.executeJavaScript(`document.dispatchEvent(new CustomEvent("yt-navigate", { detail: { endpoint: ${JSON.stringify(value)} } }))`, true);
      return;
    }
    contents.send("remoteControl:execute", command, value);
  });

  ipcMain.handle("ytf:queueAdd", async (event, target: unknown) => {
    if (!fromMainWindow(event.sender)) throw new Error("ytf:queueAdd is only available to the main window");
    if (signedInTest) throw new Error("queueAdd is blocked in signed-in test mode");
    const t = target as { videoId?: unknown; playlistId?: unknown; next?: unknown } | null;
    const id = (v: unknown) => (typeof v === "string" && /^[\w-]+$/.test(v) ? v : undefined);
    const arg = { videoId: id(t?.videoId), playlistId: id(t?.playlistId), next: t?.next === true };
    if (!arg.videoId && !arg.playlistId) throw new Error("queueAdd needs a videoId or playlistId");
    const contents = getYtmView()?.webContents;
    if (!contents) throw new Error("YouTube Music is not loaded");
    await contents.executeJavaScript(innertubeScript, true);
    return contents.executeJavaScript(`window.__ytfQueueAdd(${JSON.stringify(arg)})`, true);
  });

  // Spotify's queue editing: remove / move one upcoming song, clear everything after the current
  // one, or look up a queued song's artist/album links ("details")
  const queueEditOps = new Set(["remove", "move", "clear", "details"]);
  ipcMain.handle("ytf:queueEdit", async (event, edit: unknown) => {
    if (!fromMainWindow(event.sender)) throw new Error("ytf:queueEdit is only available to the main window");
    const e = edit as { op?: unknown; index?: unknown; to?: unknown; videoId?: unknown } | null;
    const position = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined);
    const op = typeof e?.op === "string" && queueEditOps.has(e.op) ? e.op : undefined;
    const arg = {
      op,
      index: position(e?.index),
      to: position(e?.to),
      videoId: typeof e?.videoId === "string" && /^[\w-]+$/.test(e.videoId) ? e.videoId : undefined
    };
    if (!op) throw new Error("invalid queue edit");
    if (op !== "clear" && (arg.index === undefined || !arg.videoId)) throw new Error("queue edit needs an index and videoId");
    if (op === "move" && arg.to === undefined) throw new Error("queue move needs a target index");
    const contents = getYtmView()?.webContents;
    if (!contents) throw new Error("YouTube Music is not loaded");
    await contents.executeJavaScript(innertubeScript, true);
    return contents.executeJavaScript(`window.__ytfQueueEdit(${JSON.stringify(arg)})`, true);
  });

  ipcMain.on("ytf:signIn", event => {
    if (!fromMainWindow(event.sender)) return;
    if (isTestCopy && !signedInTest) return log.warn("Youtubify test copy: sign-in is disabled");
    getYtmView()?.webContents.loadURL(SIGN_IN_URL);
  });

  // Sign out the way YTM's own account menu does; the view comes back to YouTube Music signed out
  // and the UI reloads (see onUrl)
  ipcMain.on("ytf:signOut", async event => {
    if (!fromMainWindow(event.sender)) return;
    const contents = getYtmView()?.webContents;
    if (!contents) return;
    const own: unknown = await contents.executeJavaScript("window.__ytfSignOutUrl || ''", true).catch((): string => "");
    let url = SIGN_OUT_URL;
    try {
      const resolved = typeof own === "string" && own ? new URL(own, YTM_URL).href : "";
      if (isAccountUrl(resolved)) url = resolved;
    } catch {
      // keep the fallback
    }
    // (the log redacts URL paths, so say which link it is)
    log.info(`Youtubify: signing out via ${url === SIGN_OUT_URL ? "YouTube's logout page" : "YTM's sign-out link"} on ${new URL(url).host}`);
    // Lets test builds check the flow without actually signing out
    if (process.env.YTF_SIGN_OUT_DRY_RUN === "1") return;
    signingOut = true;
    contents.loadURL(url);
  });

  ipcMain.on("ytf:openExternal", (event, url: unknown) => {
    if (!fromMainWindow(event.sender)) return;
    if (!isAccountUrl(url)) {
      log.warn(`Youtubify: not opening ${String(url)}`);
      return;
    }
    shell.openExternal(url);
  });

  ipcMain.handle("ytf:appVersion", event => (fromMainWindow(event.sender) ? app.getVersion() : null));

  // The app menu's Exit and the Settings page's restart prompt
  ipcMain.on("ytf:app", (event, action: unknown) => {
    if (!fromMainWindow(event.sender)) return;
    if (action === "restart") app.relaunch();
    if (action === "restart" || action === "quit") app.quit();
  });

  // Leave sign-in/consent without finishing it
  ipcMain.on("ytf:closeYtmView", event => {
    if (!fromMainWindow(event.sender)) return;
    getYtmView()?.webContents.loadURL(YTM_URL);
  });

  ipcMain.handle("ytf:getPlayerState", event => {
    if (!fromMainWindow(event.sender)) return null;
    return playerStateStore.getState();
  });

  playerStateStore.addEventListener(state => send("ytf:playerState", state));

  return {
    /** Call for every (re)created YTM view. */
    provide(ytmView: BrowserView) {
      if (providedViews.has(ytmView)) return;
      providedViews.add(ytmView);
      visible = false;
      signingOut = false;
      ytmView.webContents.on("did-navigate", (_event, url) => onUrl(url));
      ytmView.webContents.on("did-navigate-in-page", (_event, url) => onUrl(url));
    },
    isVisible: () => visible
  };
}
