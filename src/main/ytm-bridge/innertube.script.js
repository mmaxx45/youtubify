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
      const find = node => {
        if (!node || typeof node !== "object") return null;
        if (node.activeAccountHeaderRenderer) return node.activeAccountHeaderRenderer;
        for (const v of Object.values(node)) {
          const hit = find(v);
          if (hit) return hit;
        }
        return null;
      };
      const header = find(menu);
      const photos = header?.accountPhoto?.thumbnails ?? [];
      const name = (header?.accountName?.runs ?? []).map(r => r.text).join("") || header?.accountName?.simpleText || "";
      return { loggedIn, name, avatar: photos[photos.length - 1]?.url ?? "" };
    } catch {
      return { loggedIn };
    }
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
