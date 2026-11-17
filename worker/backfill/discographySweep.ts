import type { Env } from "../shared/env";
import type { RawXrelRelease } from "../shared/xrel";
import { fetchWithRetry } from "../shared/fetchRetry";
import { handleXrelSearch } from "../routes/xrel/index";
import { groupRowsByTitle } from "./parse";
import { enrichFromSteam } from "./resolve";
import { getBackfillState, setBackfillState, upsertGames } from "./db";
import { remainingSubrequests } from "../shared/subrequestBudget";

/* Publisher-discography sweep: closes the "older / never-seeded titles are
   missing" gap without guessing a single title.

   Title source (real data): Steam's own store listing for each publisher
   already in D1 (search/results?publisher=...). Release source (real data):
   xREL's title search. A Steam app is only ever written when xREL returns
   real releases for a master_game whose normalised title equals the Steam
   title -- no xREL data, no row. Nothing is fabricated; crack dates come
   from the xREL rows exactly as in every other crawl.

   Resumable + budgeted like repairEnrichment.ts: cursor (publisher + Steam
   result offset) in backfill_state, one Steam page per tick, every outbound
   call goes through fetchWithRetry (counted against the invocation's
   budget) and the loop stops while a safety margin remains. Titles already
   checked are remembered in discography_checked (migration 0020). When the
   last publisher is done the sweep idles for CYCLE_PAUSE_MS, then starts
   again so publishers added since get covered. */

const PAGE = 50;
const RESERVE = 8; // enrich (appdetails+colour+header) + margin for retries
const CYCLE_PAUSE_MS = 7 * 86400_000;
const NEGATIVE_TTL_MS = 120 * 86400_000;

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/* Equality key for "is this xREL title the same game as this Steam title":
   lowercase alphanumerics only, trademark glyphs and "&" folded, and edition
   qualifiers dropped on both sides so "Foo: Complete Edition" == "Foo". */
const EDITION = /\b(the )?(complete|definitive|enhanced|remastered|remaster|deluxe|ultimate|gold|goty|game of the year|anniversary|special|standard|digital|director'?s cut)( edition)?\b/g;
export function matchKey(title: string): string {
  return decode(title)
    .replace(/[™®©]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[–—:]/g, " ")
    .replace(EDITION, " ")
    .replace(/[^a-z0-9]/g, "");
}

export interface SteamListing {
  total: number;
  items: Array<{ appid: number; title: string }>;
}

export function parseSteamSearch(json: { total_count?: number; results_html?: string }): SteamListing {
  const html = json.results_html || "";
  const items: SteamListing["items"] = [];
  const re = /data-ds-appid="(\d+)"[\s\S]*?<span class="title">([^<]+)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) items.push({ appid: Number(m[1]), title: decode(m[2]).trim() });
  return { total: json.total_count ?? items.length, items };
}

async function fetchListing(publisher: string, start: number): Promise<SteamListing | null> {
  const u =
    "https://store.steampowered.com/search/results/?query&count=" + PAGE + "&start=" + start +
    "&sort_by=Released_DESC&category1=998&infinite=1&publisher=" + encodeURIComponent(publisher);
  const r = await fetchWithRetry(u, { cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } } } as RequestInit);
  if (!r.ok) return null;
  return parseSteamSearch((await r.json()) as { total_count?: number; results_html?: string });
}

async function unseen(db: D1Database, items: SteamListing["items"]): Promise<SteamListing["items"]> {
  if (!items.length) return [];
  const ids = items.map((i) => i.appid);
  const ph = ids.map(() => "?").join(",");
  const [inGames, checked] = await Promise.all([
    db.prepare(`SELECT appid FROM games WHERE appid IN (${ph})`).bind(...ids).all<{ appid: number }>(),
    db
      .prepare(`SELECT appid FROM discography_checked WHERE appid IN (${ph}) AND (outcome = 'added' OR checked_at > ?)`)
      .bind(...ids, Date.now() - NEGATIVE_TTL_MS)
      .all<{ appid: number }>(),
  ]);
  const skip = new Set([...(inGames.results || []), ...(checked.results || [])].map((r) => r.appid));
  return items.filter((i) => !skip.has(i.appid));
}

async function mark(db: D1Database, appid: number, title: string, outcome: string): Promise<void> {
  await db
    .prepare("INSERT OR REPLACE INTO discography_checked (appid, title, outcome, checked_at) VALUES (?, ?, ?, ?)")
    .bind(appid, title, outcome, Date.now())
    .run();
}

/* Returns "added" | "no-xrel" | "no-match", or null when it could not decide
   (upstream failure) -- null is never recorded, so it is retried later. */
async function tryAdd(env: Env, c: { appid: number; title: string }): Promise<"added" | "no-xrel" | "no-match" | "limited" | null> {
  const res = await handleXrelSearch({
    request: new Request(`https://internal.invalid/api/xrel?q=${encodeURIComponent(c.title.replace(/[™®©]/g, ""))}`),
    env,
  });
  if (res.status === 429) return "limited"; // xREL's rate limit: back off, never hammer
  if (!res.ok) return null;
  const rows = ((await res.json()) as { list?: RawXrelRelease[] }).list || [];
  if (!rows.length) return "no-xrel";
  const grouped = groupRowsByTitle(rows);
  const want = matchKey(c.title);
  const match = [...grouped.values()].find((g) => matchKey(g.title) === want);
  if (!match) return grouped.size ? "no-match" : "no-xrel";
  const enrichment = await enrichFromSteam(env, c.appid);
  if (!enrichment) return null;
  await upsertGames(env.orlaz_catalog, [match], new Map([[match.title, enrichment]]));
  return "added";
}

const MAX_PAGES_PER_TICK = 8;
// xREL answers 429 when searches arrive back to back (confirmed live), so the
// sweep spaces them out and caps how many it makes per tick.
const XREL_SPACING_MS = 1100;
const MAX_SEARCHES_PER_TICK = 16;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runDiscographySweepTick(env: Env): Promise<{ pages: number; added: number; checked: number }> {
  const db = env.orlaz_catalog;
  const out = { pages: 0, added: 0, checked: 0 };
  let searches = 0;
  const doneAt = Number((await getBackfillState(db, "disco_cycle_done_at")) || "0");
  if (doneAt && Date.now() - doneAt < CYCLE_PAUSE_MS) return out;

  let publisher = (await getBackfillState(db, "disco_pub")) || "";
  let start = Number((await getBackfillState(db, "disco_start")) || "0");

  for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
    const left = remainingSubrequests();
    if (left !== null && left < RESERVE + 2) break;

    if (!publisher) {
      const last = (await getBackfillState(db, "disco_last_pub")) || "";
      const next = await db
        .prepare("SELECT publisher FROM games WHERE publisher > ? ORDER BY publisher LIMIT 1")
        .bind(last)
        .first<{ publisher: string }>();
      if (!next) {
        await setBackfillState(db, "disco_last_pub", "");
        await setBackfillState(db, "disco_cycle_done_at", String(Date.now()));
        break;
      }
      publisher = next.publisher;
      start = 0;
    }

    let listing: SteamListing | null = null;
    try {
      listing = await fetchListing(publisher, start);
    } catch {
      break;
    }
    if (!listing) break; // Steam having a bad moment: same page next tick
    out.pages++;

    let finishedPage = true;
    for (const c of await unseen(db, listing.items)) {
      const rem = remainingSubrequests();
      if (rem !== null && rem < RESERVE) {
        finishedPage = false;
        break;
      }
      if (searches >= MAX_SEARCHES_PER_TICK) {
        finishedPage = false;
        break;
      }
      try {
        if (searches > 0) await sleep(XREL_SPACING_MS);
        searches++;
        const outcome = await tryAdd(env, c);
        if (outcome === "limited") {
          finishedPage = false;
          break;
        }
        if (outcome) {
          await mark(db, c.appid, c.title, outcome);
          out.checked++;
          if (outcome === "added") out.added++;
        }
      } catch {
        finishedPage = false; // budget exhausted / transient failure: resume this page next tick
        break;
      }
    }
    if (!finishedPage) break;

    start += PAGE;
    if (start >= listing.total || !listing.items.length) {
      await setBackfillState(db, "disco_last_pub", publisher);
      publisher = "";
      start = 0;
    }
  }

  await setBackfillState(db, "disco_pub", publisher);
  await setBackfillState(db, "disco_start", String(start));
  console.log(`discography pages=${out.pages} checked=${out.checked} added=${out.added} next=${publisher || "-"}@${start}`);
  return out;
}
