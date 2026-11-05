/* PCGamingWiki as a DRM source, via plain MediaWiki page wikitext.

   History: this file used to query PCGamingWiki's Cargo API. On 2026-11-05
   that was confirmed dead -- every cargoquery (join, single table, GET,
   POST, with or without a User-Agent, from the Worker runtime and from a
   laptop) returns HTTP 200 + {"error":{"code":"permissiondenied",...,"info":
   "You don't have permission to run arbitrary Cargo queries."}}. Not a
   Cloudflare challenge, not a UA problem: a server-side permission change.
   The old code treated `data.error` as "skip" and then stamped the row as
   checked, so the outage looked like "nothing changed" for months.

   What still works, and is normal permitted API use: action=query with
   prop=revisions. The page wikitext carries what we need:
     |steam appid = 668580
     {{DRM|Denuvo Anti-Tamper}}                      (currently used)
     {{Removed DRM|Denuvo}} was removed on July 24, 2026.<ref>{{Refurl|url=...|date=2026-07-24}}</ref>
   We deliberately do NOT use /api/appid.php (Cloudflare-challenged) and do
   not try to get around any bot protection.

   Matching is by page title, but a page is trusted ONLY if its own
   steam appid equals ours. A mismatch or an ambiguous result is "no
   match", never a guess. */

import { fetchWithRetry } from "../shared/fetchRetry";

const API = "https://www.pcgamingwiki.com/w/api.php";

export interface ParsedPcgw {
  appids: number[];
  /* A {{DRM|...Denuvo...}} entry that is not marked removed. */
  usesDenuvo: boolean;
  /* An explicit {{Removed DRM|...Denuvo...}} entry. */
  removedDenuvo: { hasRef: boolean; dateMs: number | null; url: string | null } | null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function monthIndex(name: string): number {
  const n = name.toLowerCase();
  return MONTHS.findIndex((m) => m === n || m.slice(0, 3) === n.slice(0, 3));
}

/* Full dates only (a year-month or bare year isn't a removal date). UTC midnight. */
export function parseRemovalDate(segment: string): number | null {
  const iso = segment.match(/\bdate\s*=\s*(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const mdy = segment.match(/removed on ([A-Za-z]+)\.? (\d{1,2}),? (\d{4})/i);
  if (mdy && monthIndex(mdy[1]) >= 0) return Date.UTC(Number(mdy[3]), monthIndex(mdy[1]), Number(mdy[2]));
  const dmy = segment.match(/removed on (\d{1,2}) ([A-Za-z]+)\.? (\d{4})/i);
  if (dmy && monthIndex(dmy[2]) >= 0) return Date.UTC(Number(dmy[3]), monthIndex(dmy[2]), Number(dmy[1]));
  return null;
}

export function parsePcgwPage(wikitext: string): ParsedPcgw {
  const appidField = wikitext.match(/\|\s*steam appid\s*=\s*([^\n|]*)/i);
  const appids = appidField ? (appidField[1].match(/\d+/g) || []).map(Number) : [];

  const lines = wikitext.split("\n");
  let usesDenuvo = false;
  let removed: ParsedPcgw["removedDenuvo"] = null;
  for (let i = 0; i < lines.length; i++) {
    let seg = lines[i];
    // A <ref> can wrap onto following lines; join until it closes.
    for (let j = i + 1; j < lines.length && /<ref\b/.test(seg) && !/<\/ref>|<ref[^>]*\/>/.test(seg) && j < i + 6; j++) seg += "\n" + lines[j];
    const rem = seg.match(/\{\{\s*Removed DRM\s*\|[^}]*\}\}/i);
    if (rem && /denuvo/i.test(rem[0])) {
      if (!removed) {
        const url = seg.match(/\burl\s*=\s*(https?:\/\/[^|}\s<]+)/i);
        removed = { hasRef: /<ref\b/.test(seg), dateMs: parseRemovalDate(seg), url: url ? url[1] : null };
      }
      continue;
    }
    if (/\{\{\s*DRM\s*\|[^}]*denuvo[^}]*\}\}/i.test(lines[i])) usesDenuvo = true;
  }
  return { appids, usesDenuvo, removedDenuvo: removed };
}

export type PcgwReply = { ok: true; json: any } | { ok: false; status: number | null; reason: string };

/* Classifies a raw HTTP reply. Anything that is not a clean API JSON answer
   -- a non-200, a Cloudflare challenge page, unparseable text, or an API
   `error` object such as permissiondenied -- is a FAILED lookup, which the
   caller must never treat as "checked, nothing there". */
export function interpretPcgwReply(status: number, text: string): PcgwReply {
  if (status !== 200) return { ok: false, status, reason: `http_${status}` };
  const head = text.trimStart().slice(0, 200).toLowerCase();
  if (head.startsWith("<") || head.includes("just a moment")) return { ok: false, status, reason: "challenge" };
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, status, reason: "parse_error" };
  }
  if (json && json.error) return { ok: false, status, reason: `api_${json.error.code || "error"}` };
  return { ok: true, json };
}

export interface PcgwHttp {
  get(url: string): Promise<{ status: number; text: string }>;
  sleep(ms: number): Promise<void>;
}

export const realHttp: PcgwHttp = {
  async get(url) {
    const r = await fetchWithRetry(url);
    return { status: r.status, text: await r.text() };
  },
  sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
};

// Gentle: small batches, a pause between requests, and stop at the first failure.
const BATCH_TITLES = 8;
const PAUSE_MS = 400;

interface PageHit {
  title: string;
  wikitext: string;
}

/* Fetches wikitext for several titles in one request. Returns, per
   requested title, the page it resolved to (following the API's own
   normalization and redirects), or null when the page doesn't exist. */
async function fetchPages(titles: string[], http: PcgwHttp): Promise<{ ok: true; hits: Map<string, PageHit | null> } | { ok: false; status: number | null; reason: string }> {
  const url =
    `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=` +
    encodeURIComponent(titles.join("|"));
  const reply = interpretPcgwReply(...(await http.get(url).then((r) => [r.status, r.text] as const)));
  if (!reply.ok) return reply;
  const q = reply.json.query || {};
  const norm = new Map<string, string>((q.normalized || []).map((n: any) => [n.from, n.to]));
  const redir = new Map<string, string>((q.redirects || []).map((n: any) => [n.from, n.to]));
  const byTitle = new Map<string, PageHit | null>();
  for (const p of q.pages || []) {
    const wt = p.revisions?.[0]?.slots?.main?.content;
    byTitle.set(p.title, p.missing || typeof wt !== "string" ? null : { title: p.title, wikitext: wt });
  }
  const hits = new Map<string, PageHit | null>();
  for (const t of titles) {
    let cur = t;
    if (norm.has(cur)) cur = norm.get(cur)!;
    if (redir.has(cur)) cur = redir.get(cur)!;
    hits.set(t, byTitle.get(cur) ?? null);
  }
  return { ok: true, hits };
}

async function searchTitles(query: string, http: PcgwHttp): Promise<{ ok: true; titles: string[] } | { ok: false; status: number | null; reason: string }> {
  const url = `${API}?action=query&list=search&srnamespace=0&srlimit=4&format=json&formatversion=2&srsearch=${encodeURIComponent(query)}`;
  const reply = interpretPcgwReply(...(await http.get(url).then((r) => [r.status, r.text] as const)));
  if (!reply.ok) return reply;
  return { ok: true, titles: ((reply.json.query?.search as any[]) || []).map((s) => String(s.title)) };
}

export interface PcgwGameInput {
  id: string;
  appid: number;
  title: string;
  /* Page title that matched our appid on an earlier cycle, if any. */
  knownPage: string | null;
}

export type PcgwOutcome =
  | { status: "match"; page: string; parsed: ParsedPcgw }
  | { status: "nomatch"; reason: "no_page" | "appid_mismatch" | "ambiguous" }
  | { status: "failed"; httpStatus: number | null; reason: string };

export interface PcgwBatchResult {
  outcomes: Map<string, PcgwOutcome>;
  /* null when every request succeeded (or none was needed). */
  failure: { status: number | null; reason: string } | null;
}

/* Resolves each game to a PCGamingWiki page whose own Steam appid equals
   ours. First guess is the cached page (or Steam's title); only on a miss
   does it search, and a search hit is accepted only when exactly one
   candidate page carries our appid. The first failed request aborts the
   whole batch -- the rest are reported as failed, not retried in a burst. */
export async function resolvePcgwBatch(games: PcgwGameInput[], http: PcgwHttp = realHttp): Promise<PcgwBatchResult> {
  const outcomes = new Map<string, PcgwOutcome>();
  const st: { failure: PcgwBatchResult["failure"] } = { failure: null };
  const fail = (f: { status: number | null; reason: string }) => {
    st.failure = st.failure ?? f;
  };

  const guess = (g: PcgwGameInput) => g.knownPage || g.title;
  const firstHits = new Map<string, PageHit | null>();
  for (let i = 0; i < games.length && !st.failure; i += BATCH_TITLES) {
    const chunk = games.slice(i, i + BATCH_TITLES);
    const titles = [...new Set(chunk.map(guess).filter((t) => !t.includes("|")))];
    if (i > 0) await http.sleep(PAUSE_MS);
    const res = titles.length ? await fetchPages(titles, http) : ({ ok: true, hits: new Map() } as const);
    if (!res.ok) {
      fail({ status: res.status, reason: res.reason });
      break;
    }
    for (const [t, h] of res.hits) firstHits.set(t, h);
  }

  for (const g of games) {
    if (st.failure) {
      outcomes.set(g.id, { status: "failed", httpStatus: st.failure.status, reason: st.failure.reason });
      continue;
    }
    const first = firstHits.get(guess(g)) ?? null;
    if (first) {
      const parsed = parsePcgwPage(first.wikitext);
      if (parsed.appids.includes(g.appid)) {
        outcomes.set(g.id, { status: "match", page: first.title, parsed });
        continue;
      }
    }
    // Miss (no such page, or a page for a different appid): search by title.
    await http.sleep(PAUSE_MS);
    const found = await searchTitles(g.title, http);
    if (!found.ok) {
      fail({ status: found.status, reason: found.reason });
      outcomes.set(g.id, { status: "failed", httpStatus: found.status, reason: found.reason });
      continue;
    }
    const cands = found.titles.filter((t) => t !== first?.title).slice(0, 3);
    if (!cands.length) {
      outcomes.set(g.id, { status: "nomatch", reason: first ? "appid_mismatch" : "no_page" });
      continue;
    }
    await http.sleep(PAUSE_MS);
    const pages = await fetchPages(cands, http);
    if (!pages.ok) {
      fail({ status: pages.status, reason: pages.reason });
      outcomes.set(g.id, { status: "failed", httpStatus: pages.status, reason: pages.reason });
      continue;
    }
    const matching = [...pages.hits.values()]
      .filter((h): h is PageHit => !!h)
      .map((h) => ({ h, parsed: parsePcgwPage(h.wikitext) }))
      .filter((x) => x.parsed.appids.includes(g.appid));
    if (matching.length === 1) outcomes.set(g.id, { status: "match", page: matching[0].h.title, parsed: matching[0].parsed });
    else outcomes.set(g.id, { status: "nomatch", reason: matching.length > 1 ? "ambiguous" : first ? "appid_mismatch" : "no_page" });
  }
  return { outcomes, failure: st.failure };
}
