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

  const rendererOf = item => item?.playlistPanelVideoRenderer ?? item?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;

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

  // Edit YTM's play queue like Spotify's queue panel. `index`/`to` address the list the engine
  // pushes to the UI (queue items, then autoplay items) and `videoId` must still be at `index`, so
  // a queue that changed meanwhile is never edited in the wrong place. Only songs after the current
  // one can be touched. Removing and moving go through YTM's own queue code (the same paths as its
  // "Remove from queue" item and drag & drop), which also keeps its server-side queue in step.
  window.__ytfQueueEdit = ({ op, index, to, videoId }) => {
    const store = window.__YTMD_HOOK__?.ytmStore;
    const state = store?.getState().queue;
    if (!state) throw new Error("YouTube Music's queue isn't available yet");
    const items = state.items ?? [];
    const all = [...items, ...(state.automixItems ?? [])];
    const current = items.findIndex(item => rendererOf(item)?.selected);
    const upcoming = i => Number.isInteger(i) && i > current && i < all.length;

    if (op === "clear") {
      // Same actions YTM uses when the server replaces the queue after the current song. Local
      // only: removing each song through the queue service would send one server edit per song.
      const removed = all.length - current - 1;
      if (current < 0 || removed <= 0) return 0;
      const ids = { nextQueueItemId: state.nextQueueItemId, shouldAssignIds: false };
      store.dispatch({ type: "UPDATE_ITEMS", payload: { ...ids, items: [], currentIndex: current } });
      store.dispatch({ type: "REPLACE_AUTOMIX_ITEMS", payload: { ...ids, automixItems: [] } });
      return removed;
    }

    const renderer = rendererOf(all[index]);
    if (!upcoming(index) || !renderer || renderer.videoId !== videoId) return false;

    if (op === "details") {
      // The byline's linked runs (artists, album) for "Go to artist" / "Go to album"
      const runs = (renderer.longBylineText ?? renderer.shortBylineText)?.runs ?? [];
      return runs
        .filter(r => r.navigationEndpoint?.browseEndpoint)
        .map(r => ({ text: r.text, navigationEndpoint: { browseEndpoint: r.navigationEndpoint.browseEndpoint } }));
    }

    if (op === "remove") {
      // YTM's queue service finds the entry by its queue item id (watchEndpoint.index)
      const service = document.querySelector("ytmusic-app-layout>ytmusic-player-bar")?.queue;
      const idOf = item => rendererOf(item)?.navigationEndpoint?.watchEndpoint?.index;
      const id = idOf(all[index]);
      if (typeof service?.removeItem === "function" && typeof id === "number" && all.filter(item => idOf(item) === id).length === 1) {
        service.removeItem(String(id));
      } else {
        store.dispatch(index < items.length ? { type: "REMOVE_ITEM", payload: index } : { type: "REMOVE_AUTOMIX_ITEM", payload: index - items.length });
      }
      return true;
    }

    if (op === "move") {
      // Autoplay suggestions can't be reordered in YTM either
      if (!upcoming(to) || index >= items.length || to >= items.length) return false;
      if (index === to) return true;
      // YTM's queue list moves an entry when its drag & drop fires onDrop with the dragged element
      // (matched by its renderer data) at its new position; give it that shape. Fall back to the
      // plain store action if the list isn't rendered with the same items.
      const list = document.querySelector("ytmusic-player-queue");
      const data = items[index].playlistPanelVideoRenderer ?? items[index].playlistPanelVideoWrapperRenderer;
      const listIndex = list?.data?.findIndex?.(d => (d.playlistPanelVideoRenderer ?? d.playlistPanelVideoWrapperRenderer) === data);
      if (typeof list?.onDrop === "function" && list.queue && listIndex === index) {
        const dragEl = { data };
        const children = items.filter((_, i) => i !== index);
        children.splice(to, 0, dragEl);
        dragEl.parentElement = { children };
        list.onDrop({ detail: { dragEl } });
      } else {
        store.dispatch({ type: "MOVE_ITEM", payload: { fromIndex: index, toIndex: to } });
      }
      return rendererOf(store.getState().queue.items[to])?.videoId === videoId;
    }

    throw new Error(`Unknown queue edit ${op}`);
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
