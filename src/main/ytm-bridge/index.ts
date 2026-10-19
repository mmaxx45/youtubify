import { BrowserView, BrowserWindow, ipcMain } from "electron";
import log from "electron-log";

import playerStateStore from "../player-state-store";
import innertubeScript from "./innertube.script.js?raw";

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
    try {
      host = new URL(url).hostname;
    } catch {
      return;
    }
    if (host !== "music.youtube.com") {
      log.info(`Youtubify: showing YouTube Music view for ${host}`);
      setVisible(true);
    } else if (visible) {
      // Back from sign-in/consent: the session may have changed, so the UI reloads its data
      setVisible(false);
      send("ytf:sessionChanged");
    }
  };

  ipcMain.handle("ytf:innertube", async (event, endpoint: unknown, body: unknown) => {
    if (!fromMainWindow(event.sender)) throw new Error("ytf:innertube is only available to the main window");
    if (typeof endpoint !== "string" || !/^[a-z_/]+$/.test(endpoint)) throw new Error("invalid innertube endpoint");
    const ytmView = getYtmView();
    if (!ytmView) throw new Error("YouTube Music is not loaded");
    const contents = ytmView.webContents;
    // Installing is idempotent; doing it per call covers reloads of the YTM view.
    await contents.executeJavaScript(innertubeScript, true);
    return contents.executeJavaScript(`window.__ytfInnertube(${JSON.stringify(endpoint)}, ${JSON.stringify(body ?? {})})`, true);
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

  ipcMain.on("ytf:signIn", event => {
    if (!fromMainWindow(event.sender)) return;
    getYtmView()?.webContents.loadURL(SIGN_IN_URL);
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
      ytmView.webContents.on("did-navigate", (_event, url) => onUrl(url));
      ytmView.webContents.on("did-navigate-in-page", (_event, url) => onUrl(url));
    },
    isVisible: () => visible
  };
}
