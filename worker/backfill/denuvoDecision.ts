import type { PcgwOutcome } from "./pcgamingwiki";
import { noticeListsDenuvo, type SteamNotice } from "./steamDrm";

export const DENUVO_TAG = "Denuvo Anti-Tamper";

/* Decision rules (owner-approved 2026-11-05):

   REMOVED   = PCGamingWiki has an explicit {{Removed DRM|Denuvo...}} WITH a
               source ref, OR a Steam drm_notice that previously listed
               Denuvo no longer does (a directly observed transition).
   DATE      = the dated primary-source ref from PCGamingWiki when present
               (kind "sourced"); otherwise our own detection time (kind
               "detected"). Never guessed.
   CONFLICT  = PCGamingWiki says removed but Steam's page still lists
               Denuvo: shown as removed, flagged, and logged -- not hidden.
   PRESENT   = a working source currently says so; Steam (fresher, fetched
               directly) wins over PCGamingWiki when both answered and differ.
   UNKNOWN   = no source gave a real answer: change nothing.

   Nothing is ever moved to "former" without one of the two removal
   evidences above. */

export type DenuvoState = "present" | "removed" | "absent" | "unknown";

export interface PcgwEvidence {
  status: "match" | "nomatch" | "failed" | "skipped";
  usesDenuvo?: boolean;
  removed?: { hasRef: boolean; dateMs: number | null; url: string | null } | null;
}

export interface SteamEvidence {
  status: "ok" | "unavailable" | "failed" | "skipped";
  lists?: boolean;
}

export interface DecisionInput {
  /* Did the previously stored Steam notice list Denuvo? null = never fetched. */
  prevSteamListed: boolean | null;
  stored: { removedAt: number | null; kind: "sourced" | "detected" | null };
  pcgw: PcgwEvidence;
  steam: SteamEvidence;
  now: number;
}

export interface Decision {
  state: DenuvoState;
  conflict: boolean;
  removal?: { at: number; kind: "sourced" | "detected"; source: "pcgamingwiki" | "steam" | "both"; url: string | null };
  note: string;
}

export function decideDenuvo(i: DecisionInput): Decision {
  const pcgwInfo = i.pcgw.status === "match";
  const steamInfo = i.steam.status === "ok";
  if (!pcgwInfo && !steamInfo) return { state: "unknown", conflict: false, note: "no source gave a usable answer" };

  const pcgwRemoved = pcgwInfo && !!i.pcgw.removed && i.pcgw.removed.hasRef;
  const steamRemoved = steamInfo && i.prevSteamListed === true && !i.steam.lists;

  if (pcgwRemoved || steamRemoved) {
    const conflict = pcgwRemoved && steamInfo && !!i.steam.lists;
    const sourcedDate = pcgwRemoved ? i.pcgw.removed!.dateMs : null;
    const source: "pcgamingwiki" | "steam" | "both" = pcgwRemoved && steamRemoved ? "both" : pcgwRemoved ? "pcgamingwiki" : "steam";
    const url = pcgwRemoved ? i.pcgw.removed!.url : null;
    let at: number;
    let kind: "sourced" | "detected";
    if (sourcedDate != null) {
      at = sourcedDate;
      kind = "sourced";
    } else if (i.stored.removedAt != null) {
      // Keep the first detection; only a sourced date may replace it (below).
      at = i.stored.removedAt;
      kind = i.stored.kind === "sourced" ? "sourced" : "detected";
    } else {
      at = i.now;
      kind = "detected";
    }
    // A stored sourced date is never replaced by a later detection time.
    if (i.stored.removedAt != null && i.stored.kind === "sourced" && sourcedDate == null) {
      at = i.stored.removedAt;
      kind = "sourced";
    }
    return { state: "removed", conflict, removal: { at, kind, source, url }, note: conflict ? "pcgamingwiki says removed, steam notice still lists denuvo" : "removed" };
  }

  // Not (newly) removed. Is it currently protected? Steam wins when it answered.
  const present = steamInfo ? !!i.steam.lists : !!i.pcgw.usesDenuvo;
  if (present) return { state: "present", conflict: false, note: steamInfo ? "steam notice lists denuvo" : "pcgamingwiki lists denuvo" };
  const disagree = pcgwInfo && steamInfo && !!i.pcgw.usesDenuvo && !i.steam.lists;
  return { state: "absent", conflict: false, note: disagree ? "pcgamingwiki lists denuvo but steam notice does not; preferring steam" : "no source lists denuvo" };
}

export function evidenceFromPcgw(o: PcgwOutcome | undefined): PcgwEvidence {
  if (!o) return { status: "skipped" };
  if (o.status === "match") return { status: "match", usesDenuvo: o.parsed.usesDenuvo, removed: o.parsed.removedDenuvo };
  return { status: o.status === "nomatch" ? "nomatch" : "failed" };
}

export function evidenceFromSteam(s: SteamNotice | undefined): SteamEvidence {
  if (!s) return { status: "skipped" };
  if (s.status === "ok") return { status: "ok", lists: noticeListsDenuvo(s.notice) };
  return { status: s.status === "unavailable" ? "unavailable" : "failed" };
}

export interface StoredRow {
  tags: string | null;
  former_tags: string | null;
  steam_drm_notice: string | null;
  pcgw_page: string | null;
  denuvo_watch: number;
  denuvo_removed_at: number | null;
  denuvo_removed_kind: string | null;
}

const parseList = (raw: string | null): string[] => {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/* The column updates for one recheck of one row, or null when NO source
   gave a real answer -- in which case nothing at all is written, and in
   particular drm_checked_at is NOT stamped, so a failed lookup can never
   masquerade as "checked, nothing changed". "No PCGamingWiki page" and
   "Steam has no data for this app" ARE real answers and do stamp. */
export function planRowUpdate(
  row: StoredRow,
  pcgw: PcgwOutcome | undefined,
  steam: SteamNotice | undefined,
  now: number,
): { sets: Record<string, string | number | null>; decision: Decision } | null {
  const pe = evidenceFromPcgw(pcgw);
  const se = evidenceFromSteam(steam);
  const pcgwReal = pe.status === "match" || pe.status === "nomatch";
  const steamReal = se.status === "ok" || se.status === "unavailable";
  if (!pcgwReal && !steamReal) return null;

  const decision = decideDenuvo({
    prevSteamListed: row.steam_drm_notice == null ? null : noticeListsDenuvo(row.steam_drm_notice),
    stored: { removedAt: row.denuvo_removed_at, kind: row.denuvo_removed_kind === "sourced" ? "sourced" : row.denuvo_removed_at != null ? "detected" : null },
    pcgw: pe,
    steam: se,
    now,
  });

  const sets: Record<string, string | number | null> = { drm_checked_at: now };
  if (steamReal) sets.steam_drm_checked_at = now;
  if (steam?.status === "ok") sets.steam_drm_notice = steam.notice ?? "";
  if (pcgw?.status === "match") sets.pcgw_page = pcgw.page;

  const tags = parseList(row.tags);
  const former = parseList(row.former_tags);
  const without = (l: string[]) => l.filter((t) => t !== DENUVO_TAG);
  if (decision.state === "present") {
    if (!tags.includes(DENUVO_TAG)) sets.tags = JSON.stringify([...tags, DENUVO_TAG]);
    sets.denuvo_watch = 1;
    sets.denuvo_conflict = 0;
  } else if (decision.state === "removed" && decision.removal) {
    if (tags.includes(DENUVO_TAG)) sets.tags = JSON.stringify(without(tags));
    if (!former.includes(DENUVO_TAG)) sets.former_tags = JSON.stringify([...former, DENUVO_TAG]);
    sets.denuvo_watch = 1;
    sets.denuvo_conflict = decision.conflict ? 1 : 0;
    sets.denuvo_removed_at = decision.removal.at;
    sets.denuvo_removed_kind = decision.removal.kind;
    sets.denuvo_removed_source = decision.removal.source;
    sets.denuvo_removed_url = decision.removal.url;
  } else if (decision.state === "absent") {
    if (tags.includes(DENUVO_TAG)) sets.tags = JSON.stringify(without(tags));
    sets.denuvo_conflict = 0;
  }
  return { sets, decision };
}
