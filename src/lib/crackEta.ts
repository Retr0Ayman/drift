import type { Game } from "../types/game";
import { slugify } from "./format";
import { DENUVO_TAG } from "./denuvoRemoval";
import type { EtaStat } from "../hooks/useCrackEta";

/* Eligible for a Crack ETA estimate: currently Denuvo-protected AND no
   genuine traditional crack exists yet.

   BUG FIX (confirmed live, Resident Evil Requiem): this originally checked
   lib/format.ts's gStatus(game) === "hv", but gStatus's own precedence is
   "does ANY hv release exist" -- it deliberately still reports "hv" for a
   game that has BOTH a hypervisor bypass AND a genuine traditional crack
   (that's the right call for gStatus's actual purpose, GameDetail's status
   ring badge, where a tracked hv release is worth calling out regardless).
   Confirmed live: Resident Evil Requiem has a real voices38 traditional
   crack (9 Apr 2026) on its Crack Timeline alongside an earlier DenuvOwO
   hypervisor release, so gStatus reports "hv" -- but this predictor was
   then telling a visitor "here's when a traditional crack is likely" for a
   game that has already had one for real, which is exactly the kind of
   ungrounded claim this feature exists to never make. Checking `releases`
   directly for a genuine (non-repack, non-anonymous) trad entry is the
   real, unambiguous signal this specific question needs. */
export function isEtaEligible(game: Game): boolean {
  if (!(game.tags || []).includes(DENUVO_TAG)) return false;
  const hasGenuineTradCrack = (game.releases || []).some((r) => r.method === "trad" && !r.isRepack && !r.isAnonymous);
  return !hasGenuineTradCrack;
}

export interface CrackEtaBreakdown {
  publisherStat: EtaStat | null;
  /* Sorted fastest-confident-median first, then by raw sample count for
     groups without a confident median yet -- top 6, real data only, never
     padded to a round number. */
  candidateGroups: EtaStat[];
}

export function buildCrackEtaBreakdown(game: Game, publishers: Record<string, EtaStat>, groups: Record<string, EtaStat>): CrackEtaBreakdown | null {
  if (!isEtaEligible(game)) return null;
  const publisherStat = game.publisher ? publishers[slugify(game.publisher)] || null : null;
  const candidateGroups = Object.values(groups)
    .filter((g) => g.sample_count > 0)
    .sort((a, b) => {
      if (a.median_days != null && b.median_days != null) return a.median_days - b.median_days;
      if (a.median_days != null) return -1;
      if (b.median_days != null) return 1;
      return b.sample_count - a.sample_count;
    })
    .slice(0, 6);
  if (!publisherStat && !candidateGroups.length) return null;
  return { publisherStat, candidateGroups };
}
