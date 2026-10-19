// Runs in the YouTube Music page (main world). Calls YTM's internal "innertube" API with the page's
// own signed-in session, the same way YTM's frontend does, and returns the raw JSON.
(() => {
  if (window.__ytfInnertube) return;

  const sha1Hex = async text => {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  };

  // ytcfg is set up by YTM's own scripts; requests can arrive while the page is still booting
  const ytcfgReady = async () => {
    for (let i = 0; i < 100; i++) {
      if (window.ytcfg?.get?.("INNERTUBE_CONTEXT")) return window.ytcfg;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("YouTube Music did not finish loading");
  };

  window.__ytfSession = async () => {
    await ytcfgReady();
    const loggedIn = !!window.ytcfg.get("LOGGED_IN");
    if (!loggedIn) return { loggedIn };
    try {
      const menu = await window.__ytfInnertube("account/account_menu", {});
      // First node (depth-first) that passes the test
      const find = (node, test) => {
        if (!node || typeof node !== "object") return null;
        if (test(node)) return node;
        for (const v of Object.values(node)) {
          const hit = find(v, test);
          if (hit) return hit;
        }
        return null;
      };
      const textOf = t => (t?.runs ?? []).map(r => r.text).join("") || t?.simpleText || "";
      const header = find(menu, n => n.activeAccountHeaderRenderer)?.activeAccountHeaderRenderer;
      const photos = header?.accountPhoto?.thumbnails ?? [];
      // "Your channel" links to the user's channel (missing for accounts without one)
      const channelId = find(menu, n => typeof n.browseId === "string" && n.browseId.startsWith("UC"))?.browseId ?? "";
      // YTM's own "Sign out" link; the bridge's sign-out prefers it over YouTube's logout page
      const signOut = find(menu, n => n.signOutEndpoint);
      window.__ytfSignOutUrl = signOut?.commandMetadata?.webCommandMetadata?.url ?? "";
      return {
        loggedIn,
        name: textOf(header?.accountName),
        handle: textOf(header?.channelHandle),
        avatar: photos[photos.length - 1]?.url ?? "",
        channelId
      };
    } catch {
      return { loggedIn };
    }
  };

  // Add a song (videoId) or whole playlist/album (playlistId) to YTM's play queue, like its own
  // "Play next" / "Add to queue" menu items: fetch the queue entries, then insert them into the
  // queue in YTM's store (hooked by ytmview/preload.ts). Returns false when nothing is queued yet.
  window.__ytfQueueAdd = async ({ videoId, playlistId, next }) => {
    const store = window.__YTMD_HOOK__?.ytmStore;
    if (!store) throw new Error("YouTube Music's queue isn't available yet");
    const queue = store.getState().queue;
    if (!queue?.items?.length) return false;
    const res = await window.__ytfInnertube("music/get_queue", videoId ? { videoIds: [videoId] } : { playlistId });
    const items = (res.queueDatas ?? []).map(d => d.content).filter(Boolean);
    if (!items.length) throw new Error("Nothing to add");
    const rendererOf = item => item.playlistPanelVideoRenderer ?? item.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
    const current = queue.items.findIndex(item => rendererOf(item)?.selected);
    store.dispatch({
      type: "ADD_ITEMS",
      payload: {
        nextQueueItemId: queue.nextQueueItemId,
        index: next && current >= 0 ? current + 1 : queue.items.length,
        items,
        shuffleEnabled: false,
        shouldAssignIds: true
      }
    });
    return true;
  };

  window.__ytfInnertube = async (endpoint, body) => {
    const cfg = await ytcfgReady();
    const headers = {
      "Content-Type": "application/json",
      "X-Origin": location.origin,
      "X-Goog-AuthUser": String(cfg.get("SESSION_INDEX") ?? 0),
      "X-Youtube-Client-Name": String(cfg.get("INNERTUBE_CONTEXT_CLIENT_NAME") ?? 67),
      "X-Youtube-Client-Version": String(cfg.get("INNERTUBE_CLIENT_VERSION") ?? "")
    };
    const sapisid = (document.cookie.match(/(?:^|; )(?:__Secure-3PAPISID|SAPISID)=([^;]+)/) || [])[1];
    if (sapisid) {
      const ts = Math.floor(Date.now() / 1000);
      headers.Authorization = `SAPISIDHASH ${ts}_${await sha1Hex(`${ts} ${sapisid} ${location.origin}`)}`;
    }
    const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ context: cfg.get("INNERTUBE_CONTEXT"), ...body })
    });
    if (!res.ok) throw new Error(`innertube ${endpoint} failed: ${res.status}`);
    return res.json();
  };
})();
