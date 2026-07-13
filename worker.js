/* ==========================================================================
   DRIFT · API engine — Cloudflare Worker (free tier: 100k req/day)
   The always-on, no-human-intervention layer. Browsers can't call Steam or
   xREL directly (CORS); this Worker does it server-side and adds CORS headers.
   It hosts nothing and stores nothing — it just relays live API data.

   ROUTES
     GET /?appid=2358720        -> Steam metadata (dev/publisher/genres/media/DLC)
                                    + live build id (from api.steamcmd.net), merged
     GET /resolve?title=..      -> title -> appid, via Steam's storesearch (small,
                                    targeted, exact-match-only — not the full
                                    ~190k-entry app list, and never a nearest-guess)
     GET /build?appid=2358720   -> just the latest public build id
     GET /xrel?latest=1         -> newest xREL releases (games) — no auth needed
     GET /xrel?q=black+myth     -> search xREL releases — no auth needed
     GET /xrel/info?dirname=..  -> single release info by dirname — no auth needed
     GET /xrel/browse?page=1&per_page=100
                                 -> paginated release feed for catalog crawling
                                    (client walks pages on scroll) — no auth needed
     GET /xrel/nfo?id=..        -> release NFO image (optional — needs
                                    XREL_CLIENT_ID/XREL_CLIENT_SECRET secrets)

   DEPLOY
     dash.cloudflare.com → Workers & Pages → Create Worker → paste → Deploy.
     That's it for the live feed, group classification and drift detection —
     release/latest.json, search/releases.json and release/info.json are all
     unauthenticated per xREL's own API docs, so nothing to sign up for there.
     NFOs (optional, skip unless you want it): only nfo/release.json needs the
     "viewnfo" OAuth scope, and there's no static token to paste in — it needs
     a Consumer Key/Secret from an "app" registered on xREL, which is a manual
     approval process on their end and may just never happen. That's fine: the
     generated ASCII .nfo is the permanent NFO experience regardless, not a
     placeholder waiting on this. If you do ever get a Key/Secret, add them as
     Worker secrets and it starts working with zero other changes:
       XREL_CLIENT_ID     = <Consumer Key>
       XREL_CLIENT_SECRET = <Consumer Secret>
     The Worker exchanges these for a short-lived access token itself via the
     OAuth2 Client Credentials Grant (POST oauth2/token, scope=viewnfo), caches
     it in memory, and re-fetches automatically when it expires — no human
     ever has to re-auth. If the secrets aren't set, /xrel/nfo returns a 501
     instead of silently failing, so the client can just fall back to the
     generated ASCII .nfo.
     Then in drift.html CONFIG:
       STEAM_PROXY: "https://<worker>.workers.dev/?appid="
       XREL_PROXY:  "https://<worker>.workers.dev/xrel"
   ========================================================================== */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "");

    // ---------- xREL: releases, groups, NFOs — all but /nfo need no auth ----------
    if (p.includes("/xrel")) {
      const sub = p.split("/xrel")[1].replace(/^\//, ""); // "", "browse", "info", "nfo"
      let api, auth = false;
      if (sub === "nfo") {
        // Confirmed against xREL's official OpenAPI spec + wiki: the real path
        // is /nfo/release.json (NOT /release/nfo.json as previously guessed).
        // Requires the "viewnfo" OAuth scope; success = raw PNG image body.
        api = "https://api.xrel.to/v2/nfo/release.json?id=" + enc(url.searchParams.get("id"));
        auth = true;
      } else if (sub === "info") {
        api = "https://api.xrel.to/v2/release/info.json?dirname=" + enc(url.searchParams.get("dirname"));
      } else if (sub === "browse") {
        // Paginated catalog crawl (client walks page=1,2,3... on scroll). Same
        // unauthenticated release/latest.json endpoint as ?latest=1 below, just
        // with an explicit page cursor forwarded through.
        api = "https://api.xrel.to/v2/release/latest.json?page=" +
              enc(url.searchParams.get("page") || "1") + "&per_page=" +
              enc(url.searchParams.get("per_page") || "100");
      } else if (url.searchParams.get("latest")) {
        api = "https://api.xrel.to/v2/release/latest.json?per_page=" +
              (url.searchParams.get("per_page") || "100");
      } else {
        api = "https://api.xrel.to/v2/search/releases.json?q=" +
              enc(url.searchParams.get("q")) + "&scene=1&p2p=1";
      }
      const headers = {};
      if (auth) {
        const token = await getXrelToken(env);
        if (!token) return j({ error: "NFO auth not configured (optional — see file header). Client falls back to the generated ASCII .nfo." }, 60, 501);
        headers.Authorization = "Bearer " + token;
      }
      const r = await fetch(api, { headers, cf: { cacheTtl: 900, cacheEverything: true } });
      return relay(r);
    }

    // ---------- latest build id only ----------
    if (p.includes("/build")) {
      const appid = url.searchParams.get("appid");
      if (!/^\d+$/.test(appid || "")) return j({ error: "pass ?appid=" }, 60, 400);
      return j({ appid: Number(appid), buildid: await buildId(appid) }, 3600);
    }

    // ---------- title -> appid resolver (targeted lookup, not the full catalog) ----------
    // Steam's storesearch endpoint does the fuzzy matching server-side and
    // returns one small result set per title — this replaced an earlier design
    // that downloaded Steam's entire ~190k-entry app list through the Worker on
    // every page load just to look up a handful of titles. That was too heavy
    // to reliably relay and parse client-side; this is a single small request
    // per unresolved title, cached client-side in drift.html (see findAppid()).
    if (p.includes("/resolve")) {
      const title = url.searchParams.get("title");
      if (!title) return j({ error: "pass ?title=" }, 60, 400);
      try {
        // No cf.cacheEverything here on purpose: a bad/empty Steam response
        // must not get stuck cached at the edge for a full hour. Successful
        // resolutions are memoized client-side anyway (see findAppid()); a
        // failure just gets a short 30s Cache-Control below and gets retried
        // on the next page load.
        const r = await fetch("https://store.steampowered.com/api/storesearch/?term=" + enc(title) + "&l=english&cc=us");
        if (!r.ok) return j({ query: title, appid: null }, 30);
        const data = await r.json();
        const items = (data && data.items) || [];
        // Exact match only (after light normalization), no "first app result"
        // fallback. Confirmed live: Steam's search returns "DEATH STRANDING 2:
        // ON THE BEACH" as the top/only close hit for the query "Death
        // Stranding" — the old first-match logic would have wired that
        // sequel's art and appid onto the original game. A wrong match is
        // worse than no thumbnail, so an unresolved title stays null.
        const norm = (s) => (s || "")
          .replace(/[™®©]/g, "")
          .replace(/\b(game of the year|goty|definitive|deluxe|ultimate|enhanced|complete|remastered|remake|director'?s cut|gold|standard|digital)\s*(edition)?\b/gi, "")
          .replace(/[:\-–—'".!]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        const target = norm(title);
        const app = items.find((x) => x.type === "app" && norm(x.name) === target) || null;
        return j({ query: title, appid: app ? app.id : null, matchedName: app ? app.name : null }, app ? 3600 : 30);
      } catch (e) {
        return j({ query: title, appid: null }, 30);
      }
    }

    // ---------- Steam per-game details (+ live build id) ----------
    const appid = url.searchParams.get("appid");
    if (!/^\d+$/.test(appid || "")) return j({ error: "pass ?appid= | /resolve?title= | /build | /xrel" }, 60, 400);

    const r = await fetch(
      "https://store.steampowered.com/api/appdetails?appids=" + appid + "&l=english&cc=us",
      { cf: { cacheTtl: 3600, cacheEverything: true } });
    const data = await r.json();
    const node = data && data[appid];
    if (!node || !node.success) return j({ appid: Number(appid), success: false }, 600);
    const d = node.data;
    // Steam returns pc_requirements as {minimum, recommended} HTML strings, or
    // as an empty array [] on some delisted/unusual apps — never assume object shape.
    const pcr = d.pc_requirements && !Array.isArray(d.pc_requirements) ? d.pc_requirements : null;
    const slim = {
      appid: Number(appid),
      title: d.name,
      desc: (d.short_description || "").trim(),
      about: (d.about_the_game || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 700),
      year: parseYear(d.release_date && d.release_date.date),
      released: (d.release_date && d.release_date.date) || "",
      header: d.header_image,
      screenshots: (d.screenshots || []).map((s) => s.path_full),
      trailers: (d.movies || []).map((m) => ({ thumb: m.thumbnail, mp4: m.mp4 && (m.mp4.max || m.mp4["480"]) })),
      dlc: d.dlc || [],
      genres: (d.genres || []).map((x) => x.description),
      developers: d.developers || [],
      publishers: d.publishers || [],
      metacritic: (d.metacritic && d.metacritic.score) || null,
      currentBuild: await buildId(appid),   // live build id merged in
      pcReq: pcr ? { minimum: reqLines(pcr.minimum), recommended: reqLines(pcr.recommended) } : null,
    };
    return j(slim, 3600);
  },
};

async function buildId(appid) {
  try {
    const r = await fetch("https://api.steamcmd.net/v1/info/" + appid,
      { cf: { cacheTtl: 3600, cacheEverything: true } });
    const jn = await r.json();
    const b = jn?.data?.[appid]?.depots?.branches?.public?.buildid;
    return b ? Number(b) : null;
  } catch { return null; }
}

/* ---------- xREL OAuth (Client Credentials Grant) — optional, NFO-only ----------
   Only /xrel/nfo needs this; every other route above is unauthenticated. xREL's
   NFO endpoint needs a Bearer access token with the "viewnfo" scope, and there's
   no such thing as a permanent static token — access tokens expire after 1hr
   (per xREL's docs: https://www.xrel.to/wiki/6440/api-oauth2-token.html). So
   instead of a secret token, this takes a client id/secret (an "app" registered
   on xREL — a manual approval step on their end, may never happen, and that's
   fine) and mints + caches its own token, refreshing automatically whenever
   it's missing or expired. Module-scope vars persist for the lifetime of a
   warm Worker isolate, which is enough to avoid hammering the token endpoint
   on every request; a cold start just mints a fresh one. Without the secrets,
   getXrelToken() just returns null and /xrel/nfo 501s — the generated ASCII
   .nfo in drift.html is the permanent NFO experience either way. */
let _xrelToken = null;
let _xrelTokenExp = 0;
async function getXrelToken(env) {
  if (!env || !env.XREL_CLIENT_ID || !env.XREL_CLIENT_SECRET) return null;
  const now = Date.now();
  if (_xrelToken && now < _xrelTokenExp) return _xrelToken;
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.XREL_CLIENT_ID,
      client_secret: env.XREL_CLIENT_SECRET,
      scope: "viewnfo",
    });
    const r = await fetch("https://api.xrel.to/v2/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!r.ok) return null;
    const tok = await r.json();
    if (!tok || !tok.access_token) return null;
    _xrelToken = tok.access_token;
    // refresh 60s early to avoid edge-of-expiry failures
    _xrelTokenExp = now + Math.max(0, ((tok.expires_in || 3600) - 60)) * 1000;
    return _xrelToken;
  } catch { return null; }
}

const enc = (s) => encodeURIComponent(s || "");
function relay(r, maxage = 900) {
  return new Response(r.body, {
    status: r.status,
    headers: { ...CORS, "Content-Type": r.headers.get("Content-Type") || "application/json",
               "Cache-Control": `public, max-age=${maxage}` },
  });
}
function j(obj, maxage, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxage}` },
  });
}
function parseYear(s) { const m = s && s.match(/\b(19|20)\d{2}\b/); return m ? Number(m[0]) : null; }
// Steam's requirements HTML is a <li>-per-line list (e.g. "OS *: Windows 10");
// turn it into plain-text lines client-side can esc() safely, no HTML relayed.
function reqLines(html) {
  if (!html) return [];
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((s) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim())
    .filter(Boolean);
}