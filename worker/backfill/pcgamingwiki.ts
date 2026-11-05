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
import { isBudgetExceeded } from "../shared/subrequestBudget";

const API = "https://www.pcgamingwiki.com/w/api.php";

export interface ParsedPcgw {
  appids: number[];
  /* A {{DRM|...Denuvo...}} entry that is not marked removed. */
  usesDenuvo: boolean;
  /* An explicit {{Removed DRM|...Denuvo...}} entry. */
  removedDenuvo: { hasRef: boolean; dateMs: number | null; url: string | null } | null;
  /* Every DRM / protection tag this page lists today, same classification the
     old Cargo fields produced (see classifyDrm), including Denuvo when listed
     -- the Denuvo decision itself is made in denuvoDecision.ts. */
  tags: string[];
  /* DRM this page says was removed (non-storefront names). */
  formerTags: string[];
  /* True only when the page has both an Availability table and an anticheat
     field, i.e. we parsed the structures a tag list is derived from. Only
     then may a stored tag be dropped for no longer being listed. */
  complete: boolean;
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

/* Storefront / launcher / non-blocking markers that PCGamingWiki's DRM column
   mixes in with real protection schemes. Lower-cased for matching ("activation"
   is the template's shorthand for "Online activation"). "Steam" is ambiguous in
   the aggregate list (every Steam listing says "Steam") and is resolved
   instead from the Steam row's own DRM cell, relabelled "Steam DRM".
   Rockstar Games Launcher / Ubisoft Connect / Battle.net / EA app are NOT
   noise: each is a single publisher's closed launcher, so listing one is a
   real requirement (confirmed live on RDR2, AC Valhalla, Diablo IV, Jedi
   Survivor). Bethesda.net stays noise (DOOM Eternal counter-example). */
const STOREFRONT_NOISE = new Set(
  [
    "Steam", "GOG.com", "GOG Galaxy", "Epic Games Launcher", "Epic Games Store", "Epic Online Services",
    "Microsoft Store", "Bethesda.net", "Discord", "Twitch", "Twitch Desktop App", "Meta Store", "Mac App Store",
    "Games for Windows - LIVE", "Playfire Client", "Amazon", "Green Man Gaming", "Gamesplanet", "GamersGate",
    "Zoom Platform", "Viveport", "Humble Store", "itch.io", "DRM-free", "Physical", "Unknown", "Account",
    "CD key", "Online activation", "Activation", "Activation limit", "Disc check", "Floppy check", "Dongle",
    "PCjr cartridge", "Retail", "Key",
    // template shorthands seen live in the DRM cells
    "EGS", "MacApp", "GOG", "Disc", "Online",
  ].map((v) => v.toLowerCase()),
);
const isNoise = (v: string) => STOREFRONT_NOISE.has(v.toLowerCase());

/* Cleans an already-stored tag list with the current naming rules: aliases
   normalised (Origin -> EA app, Uplay -> Ubisoft Connect), storefront
   shorthands / debris dropped, duplicates removed. Not a "page no longer lists
   it" judgement -- these names were never protection schemes. */
export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map(canon).filter((t) => t && !isNoise(t) && !isDebris(t)))];
}

/* Same classification the Cargo-era code applied to Uses_DRM / Removed_DRM /
   Anticheat / Steam_DRM, now fed from the page wikitext. Anything in the
   removed list is excluded from current tags. */
export function classifyDrm(
  usesDrm: string[],
  removedDrm: string[],
  anticheat: string[],
  steamDrm: string[],
): { tags: string[]; formerTags: string[] } {
  const removed = new Set(removedDrm.map((v) => v.toLowerCase()));
  const real = usesDrm.filter((v) => !isNoise(v) && !removed.has(v.toLowerCase()));
  const steamReal = steamDrm
    .filter((v) => !removed.has(v.toLowerCase()) && (v.toLowerCase() === "steam" || !isNoise(v)))
    .map((v) => (v.toLowerCase() === "steam" ? "Steam DRM" : v));
  const tags = [...new Set([...real, ...anticheat, ...steamReal])];
  const formerTags = [...new Set(removedDrm.filter((v) => !isNoise(v) && !tags.includes(v)))];
  return { tags, formerTags };
}

/* Splits on `sep` at template/link depth 0 ({{..}} and [[..]] nest). */
export function splitTopLevel(str: string, sep = "|"): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < str.length; i++) {
    const two = str.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      cur += two;
      i++;
    } else if (two === "}}" || two === "]]") {
      depth = Math.max(0, depth - 1);
      cur += two;
      i++;
    } else if (str[i] === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += str[i];
  }
  out.push(cur);
  return out;
}

/* Bodies of every balanced {{name|...}} template in the wikitext. */
export function extractTemplates(wikitext: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp("\\{\\{\\s*" + name.replace(/[/]/g, "\\/") + "\\s*\\|", "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext))) {
    let depth = 1;
    let i = m.index + 2;
    const start = re.lastIndex;
    while (i < wikitext.length && depth > 0) {
      const two = wikitext.slice(i, i + 2);
      if (two === "{{") {
        depth++;
        i += 2;
      } else if (two === "}}") {
        depth--;
        i += 2;
      } else i++;
    }
    if (depth === 0) out.push(wikitext.slice(start, i - 2));
  }
  return out;
}

const stripMarkup = (v: string) =>
  v
    .replace(/<ref[\s\S]*?(<\/ref>|\/>)/gi, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, ",")
    .trim();

/* PCGamingWiki writes the anti-tamper product as "Denuvo", "Denuvo Anti-Tamper"
   or "Denuvo Antitamper"; one canonical tag (Denuvo Anti-Cheat stays its own). */
const ALIASES: Record<string, string> = {
  uplay: "Ubisoft Connect",
  origin: "EA app",
  "ea app": "EA app",
  enigma: "Enigma Protector",
};
const canon = (v: string): string => {
  const t = v.trim();
  if (/^denuvo(\s+anti-?tamper)?$/i.test(t)) return "Denuvo Anti-Tamper";
  return ALIASES[t.toLowerCase()] ?? t;
};
/* Named template params ("3=Steam"), bare version numbers and digits are
   markup debris, not protection names. */
const isDebris = (v: string): boolean => /=/.test(v) || /^\d+(\.\d+)*$/.test(v);

const namesIn = (v: string | undefined): string[] =>
  stripMarkup(v || "")
    .split(",")
    .map((x) => canon(x))
    .filter((x) => x && !isDebris(x));

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

  // Availability rows: {{Availability/row| store | id | DRM | notes | keys | os }}
  const rows = extractTemplates(wikitext, "Availability/row").map((b) => splitTopLevel(b).map((x) => x.trim()));
  // {{DRM|A||B}} templates in the prose list schemes the table doesn't (VMProtect,
  // Denuvo, a closed launcher...); the Cargo-era Uses_DRM field included them.
  const drmTemplateNames = extractTemplates(wikitext, "DRM").flatMap((b) => splitTopLevel(b).map((x) => canon(stripMarkup(x))).filter((x) => x && !isDebris(x)));
  const usesDrm = [...rows.flatMap((r) => namesIn(r[2])), ...drmTemplateNames];
  const steamRow = rows.find((r) => /^steam$/i.test(stripMarkup(r[0] || "")));
  const steamDrm = steamRow ? namesIn(steamRow[2]) : [];
  const removedDrm = extractTemplates(wikitext, "Removed DRM").flatMap((b) => splitTopLevel(b).map((x) => canon(stripMarkup(x))).filter((x) => x && !isDebris(x)));
  const acField = wikitext.match(/\|\s*anticheat\s*=([^\n]*)/i);
  const anticheat = acField ? namesIn(acField[1].replace(/\|.*$/, "")) : [];
  const { tags, formerTags } = classifyDrm(usesDrm, removedDrm, anticheat, steamDrm);
  return {
    appids,
    usesDenuvo,
    removedDenuvo: removed,
    tags,
    formerTags,
    complete: rows.length > 0 && !!acField,
  };
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

/* One HTTP GET, classified. A spent subrequest budget is reported as reason
   "budget" -- deferral, not a source failure. */
async function getReply(url: string, http: PcgwHttp): Promise<PcgwReply> {
  try {
    const r = await http.get(url);
    return interpretPcgwReply(r.status, r.text);
  } catch (e) {
    if (isBudgetExceeded(e)) return { ok: false, status: null, reason: "budget" };
    return { ok: false, status: null, reason: e instanceof Error ? e.message : "network_error" };
  }
}

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
  const reply = await getReply(url, http);
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
  const reply = await getReply(url, http);
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
  | { status: "failed"; httpStatus: number | null; reason: string }
  /* The invocation's subrequest budget ran out before this game was reached:
     not a source failure and not an answer -- the row simply isn't stamped
     and is picked up on the next tick. */
  | { status: "deferred" };

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
  const st: { failure: PcgwBatchResult["failure"]; deferred: boolean } = { failure: null, deferred: false };
  const fail = (f: { status: number | null; reason: string }) => {
    if (f.reason === "budget") st.deferred = true;
    else st.failure = st.failure ?? f;
  };

  const guess = (g: PcgwGameInput) => g.knownPage || g.title;
  const firstHits = new Map<string, PageHit | null>();
  for (let i = 0; i < games.length && !st.failure && !st.deferred; i += BATCH_TITLES) {
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
    if (st.deferred) {
      outcomes.set(g.id, { status: "deferred" });
      continue;
    }
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
      outcomes.set(g.id, found.reason === "budget" ? { status: "deferred" } : { status: "failed", httpStatus: found.status, reason: found.reason });
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
      outcomes.set(g.id, pages.reason === "budget" ? { status: "deferred" } : { status: "failed", httpStatus: pages.status, reason: pages.reason });
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
