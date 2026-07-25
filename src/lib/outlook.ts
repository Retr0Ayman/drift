import type { Game } from "../types/game";
import { relStatus, outdatedDays, crackTimingDays, sortReleasesByPriority } from "./format";

// v2: bumped -- worker/routes/outlook.ts picked up a DRM-name grounding
// backstop (48adf6b) after v1 entries were already cached, so a visitor who
// hit a game like Ground Branch before that fix was stuck with a fabricated
// "Denuvo" claim forever with no way to notice. A v1 entry is a dead key
// now, never read again.
// v3: bumped again -- v2 fed the model a raw Steam BuildID subtraction
// (`driftDelta`) as if it were a per-game update count ("trailing the latest
// Steam build by 388825 builds" on 007 First Light -- BuildID is one global
// counter across Valve's whole platform, so that number was noise, not a
// real per-game stat). v2 cache entries could have that fabricated-precision
// number baked into their cached text forever with no way to notice, same
// class of problem as the v1->v2 bump above.
// v4: bumped again -- same 007 First Light game exposed a second real gap:
// its current `protection` fact alone (no Denuvo) contradicted its own
// Crack Timeline (a hypervisor release, a technique that exists
// specifically to bypass Denuvo). formerProtection (real PCGamingWiki
// Removed_DRM data, worker/backfill/pcgamingwiki.ts) now lets the outlook
// explain that history -- v3 cache entries never had that fact available
// and would otherwise keep serving a Denuvo-silent blurb forever.
const CACHE_PREFIX = "drift.outlook.v4.";

export interface OutlookResult {
  outlook: string | null;
  error: string | null;
}

/* Cached per game in localStorage -- same generate-once, honest-failure
   pattern as fetchFact/fetchFaq. The facts sent are derived client-side via
   lib/format.ts's own relStatus/outdatedDays/crackTimingDays -- the same
   numbers already shown in the sidebar and release cards, just handed to
   the model instead of computed twice in two places. */
export async function fetchOutlook(game: Game): Promise<OutlookResult> {
  const cacheKey = CACHE_PREFIX + game.id;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return { outlook: cached, error: null };

  const releases = sortReleasesByPriority(game.releases || []);
  const lead = releases[0];

  const status = !lead ? "none" : relStatus(game, lead);
  const outdatedFor = status === "out" ? outdatedDays(game) : undefined;
  const methods = [...new Set(releases.map((r) => r.label))];
  const timing = lead ? crackTimingDays(game, lead) : null;

  try {
    const r = await fetch("/api/outlook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: game.title,
        status: status === "out" ? "outdated" : status === "cur" ? "current" : status === "unv" ? "unverified" : "none",
        outdatedDays: outdatedFor != null ? outdatedFor : undefined,
        methods: methods.length ? methods : undefined,
        isRepack: lead?.isRepack,
        crackTimingDays: timing,
        protection: game.tags,
        formerProtection: game.formerTags,
        releaseCount: releases.length,
      }),
    });
    const data = (await r.json()) as { outlook?: string; error?: string };
    if (!r.ok || !data.outlook) {
      return { outlook: null, error: data.error || `Outlook generation failed (${r.status})` };
    }
    try {
      localStorage.setItem(cacheKey, data.outlook);
    } catch {
      // storage full/unavailable -- still return the freshly generated outlook, just won't be cached
    }
    return { outlook: data.outlook, error: null };
  } catch {
    return { outlook: null, error: "Could not reach the outlook service" };
  }
}
