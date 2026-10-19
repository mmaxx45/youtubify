import { BrowserView } from "electron";
import log from "electron-log";

import IIntegration from "../integration";
import spotifyCss from "./spotify.css?raw";

// Small page helpers the stylesheet relies on, installed once per document:
// - CSS can't tell a failed <img> apart from a loaded one, and Chromium draws its broken-image icon
//   for covers that fail while YTM switches tracks. Failed images get tagged so the theme can hide
//   them over a placeholder. Capture phase because image load/error events don't bubble.
// - YTM is a single-page app with no per-page marker, so <html ytf-page="..."> mirrors the current
//   section ("home", "explore", "playlist", ...) for page-specific layouts like the home tile grid.
const pageHelperScript = `(() => {
  if (window.__ytfPageHelpers) return;
  window.__ytfPageHelpers = true;
  document.addEventListener("error", e => {
    if (e.target instanceof HTMLImageElement) e.target.classList.add("ytf-img-broken");
  }, true);
  document.addEventListener("load", e => {
    if (e.target instanceof HTMLImageElement) e.target.classList.remove("ytf-img-broken");
  }, true);
  const markPage = () => {
    const section = location.pathname.split("/")[1] || "home";
    if (document.documentElement.getAttribute("ytf-page") !== section) document.documentElement.setAttribute("ytf-page", section);
  };
  markPage();
  window.navigation?.addEventListener("currententrychange", markPage);
  setInterval(markPage, 1000);
})();`;

// Built-in Spotify-style layout for the YTM view. Unlike CustomCSS this ships with the app and
// re-applies itself on every page load, since insertCSS only lives as long as the document.
export default class SpotifyTheme implements IIntegration {
  private ytmView: BrowserView | null = null;
  private isEnabled = false;
  private cssKey: string | null = null;
  // Bumped per document so an insertCSS that resolves after a navigation can't leave a stale key behind.
  private documentGeneration = 0;
  private injectedGeneration = -1;

  private readonly onDomReady = () => {
    this.documentGeneration++;
    this.cssKey = null;
    // Harmless with the theme off (nothing styles the class), so it's installed on every load.
    this.ytmView?.webContents.executeJavaScript(pageHelperScript).catch(e => log.error("Failed to install theme page helpers", e));
    if (this.isEnabled) this.injectCSS();
  };

  public provide(ytmView: BrowserView): void {
    if (ytmView === this.ytmView) return;

    if (this.ytmView && !this.ytmView.webContents.isDestroyed()) {
      this.ytmView.webContents.removeListener("dom-ready", this.onDomReady);
    }

    this.ytmView = ytmView;
    this.cssKey = null;
    this.documentGeneration++;
    this.ytmView.webContents.on("dom-ready", this.onDomReady);

    if (this.isEnabled) this.injectCSS();
  }

  public enable(): void {
    this.isEnabled = true;
    this.injectCSS();
  }

  public disable(): void {
    this.isEnabled = false;
    this.removeCSS();
  }

  public getYTMScripts(): { name: string; script: string }[] {
    return [];
  }

  private async injectCSS() {
    if (!this.ytmView || this.ytmView.webContents.isDestroyed()) return;
    // Nothing loaded yet: the dom-ready listener will inject once YTM has a document.
    if (!this.ytmView.webContents.getURL()) return;

    const generation = this.documentGeneration;
    if (this.injectedGeneration === generation) return;
    this.injectedGeneration = generation;

    try {
      const key = await this.ytmView.webContents.insertCSS(spotifyCss);
      if (generation !== this.documentGeneration) return;
      if (!this.isEnabled) {
        await this.ytmView.webContents.removeInsertedCSS(key);
        return;
      }
      this.cssKey = key;
      this.refitYTMPopups();
    } catch (e) {
      this.injectedGeneration = -1;
      log.error("Failed to inject Spotify theme", e);
    }
  }

  private async removeCSS() {
    this.injectedGeneration = -1;
    if (!this.ytmView || !this.cssKey) return;
    const key = this.cssKey;
    this.cssKey = null;
    await this.ytmView.webContents.removeInsertedCSS(key);
    this.refitYTMPopups();
  }

  private refitYTMPopups() {
    this.ytmView?.webContents.send("ytmView:refitPopups");
  }
}
