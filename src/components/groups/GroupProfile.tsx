import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Game, Release } from "../../types/game";
import { useCatalog } from "../../hooks/useCatalog";
import { useGroupReleases } from "../../hooks/useGroupReleases";
import { usePlatformP2PIndex } from "../../hooks/usePlatformP2PIndex";
import { useGroupReliability } from "../../hooks/useGroupReliability";
import { allReleases } from "../../lib/groups";
import { colorForName, coverImg, fmtDateMs, recencyStatusFor, relOutdated, releaseTs, slugify } from "../../lib/format";
import { STARRED_GROUPS, isP2PGroup } from "../../lib/constants";
import { buildLiveGameFromRows, mergeP2PReleases, releaseFromRow } from "../../lib/catalog";
import GlassPanel from "../ui/GlassPanel";
import Reveal from "../ui/Reveal";
import AiSummary from "../ui/AiSummary";
import StarRating from "../ui/StarRating";
import SegmentedControl from "../ui/SegmentedControl";
import ReleaseCard from "../game/ReleaseCard";
import { usePageMeta } from "../../hooks/usePageMeta";
import "./Groups.css";

interface RowEntry {
  key: string;
  game: Game;
  release: Release;
  comparisonReleases: Release[];
  method: "hv" | "trad";
  isRepack: boolean;
  ts: number;
  isKnownGame: boolean;
  rawTitle: string;
}

interface MonthGroup {
  key: string; // "2026-07", or "unknown"
  label: string; // "July 2026"
  rows: RowEntry[];
}

function monthKey(ts: number): string {
  if (!ts) return "unknown";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  if (key === "unknown") return "Undated";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function groupByMonth(rows: RowEntry[]): MonthGroup[] {
  const map = new Map<string, RowEntry[]>();
  for (const row of rows) {
    const key = monthKey(row.ts);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return a < b ? 1 : -1;
    })
    .map(([key, rows]) => ({ key, label: monthLabel(key), rows }));
}

const CURRENT_MONTH_KEY = monthKey(Date.now());

/* A P2P title not already in the loaded catalog has no real Steam/game
   data yet -- this fills in just enough of a Game shape for ReleaseCard to
   render honestly (blank/"—" fields, not fabricated ones), until the row
   is clicked and resolveAndGo replaces it with the real thing. */
function syntheticGame(title: string, release: Release): Game {
  return {
    id: slugify(title),
    title,
    appid: null,
    year: release.ts ? new Date(release.ts * 1000).getFullYear() : null,
    released: "",
    developer: "",
    publisher: "",
    genres: [],
    tags: [],
    currentBuild: 0,
    releases: [release],
    desc: "",
    fact: "",
    dlc: [],
    source: { name: "xREL", url: "https://www.xrel.to/" },
  };
}

export default function GroupProfile() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { games, mergeOne } = useCatalog();
  const { index: p2pIndex } = usePlatformP2PIndex();
  const { data: reliability } = useGroupReliability();
  const seedMatches = allReleases(games).filter(({ r }) => slugify(r.group || "unknown") === key);

  // The exact display name (needed for the live query) only comes from a
  // seed match; falling back to the URL key itself still works reasonably
  // since xREL's search is case-insensitive substring matching.
  const displayName = seedMatches[0]?.r.group || key || "";
  const { rows: liveRows, loading, complete } = useGroupReleases(displayName || null);

  const seedTitles = useMemo(() => new Set(seedMatches.map(({ g }) => g.title.toLowerCase())), [seedMatches]);

  const seedRows: RowEntry[] = useMemo(
    () =>
      seedMatches.map(({ g, r }) => ({
        key: g.id + "-" + (r.xrelId || r.date),
        game: g,
        release: r,
        comparisonReleases: mergeP2PReleases(g.releases, g.title, p2pIndex),
        method: r.method,
        isRepack: !!r.isRepack,
        ts: releaseTs(r) || 0,
        isKnownGame: true,
        rawTitle: g.title,
      })),
    [seedMatches, p2pIndex],
  );

  // Live rows fill in every real release the group has (per the P2P-lookup
  // fix) that isn't already covered by a seed entry. A title that isn't
  // yet a locally-known game gets a synthetic Game wrapper so ReleaseCard
  // can still render it -- clicking resolves the real thing on demand (see
  // resolveAndGo), same pattern SearchBar's live results already use, so
  // this doesn't have to assume "no local page exists."
  const liveExtraRows: RowEntry[] = useMemo(
    () =>
      liveRows
        .filter((row) => !seedTitles.has((row.ext_info?.title || "").toLowerCase()))
        .map((row) => {
          const title = row.ext_info?.title || row.dirname;
          const release = releaseFromRow(row);
          return {
            key: row.id,
            game: syntheticGame(title, release),
            release,
            comparisonReleases: mergeP2PReleases([release], title, p2pIndex),
            method: release.method,
            isRepack: !!release.isRepack,
            ts: (row.time || 0) * 1000,
            isKnownGame: false,
            rawTitle: title,
          };
        }),
    [liveRows, seedTitles, p2pIndex],
  );

  const rows = [...seedRows, ...liveExtraRows].sort((a, b) => b.ts - a.ts);
  const repackCount = rows.filter((x) => x.isRepack).length;
  const isRepackGroupProfile = rows.length > 0 && repackCount === rows.length;
  const crackRows = rows.filter((x) => !x.isRepack);
  const repackRows = rows.filter((x) => x.isRepack);

  // Cracks are the default/primary view (orlaz-crack-priority-repack-
  // toggle.md) -- repacks only ever show when explicitly toggled on,
  // never mixed into the same list. Exception: a group whose entire
  // tracked output is repacks (isRepackGroupProfile) has nothing to
  // default TO in the crack list -- forcing that permanently-empty state
  // as the default would be a worse experience than just showing what
  // this group actually has, so the effective view falls back to repacks
  // for that case regardless of the toggle's own state.
  const [showRepacks, setShowRepacks] = useState(false);
  const effectiveShowRepacks = showRepacks || (crackRows.length === 0 && repackRows.length > 0);
  const visibleRows = effectiveShowRepacks ? repackRows : crackRows;
  const months = useMemo(() => groupByMonth(visibleRows), [visibleRows]);

  usePageMeta({
    title: displayName || "Group",
    description: displayName
      ? `${rows.length} tracked crack release${rows.length === 1 ? "" : "s"} from ${displayName}.`
      : undefined,
  });

  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set([CURRENT_MONTH_KEY]));
  function toggleMonth(k: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function handleRowClick(row: RowEntry) {
    if (row.isKnownGame) {
      navigate(`/game/${row.game.id}`);
      return;
    }
    const resolved = await buildLiveGameFromRows(row.rawTitle);
    // A live match that never resolves a Steam appid is skipped, not
    // navigated to a placeholder -- a wrong/missing match is worse than
    // staying put (same rule SearchBar's live results already follow).
    if (!resolved) return;
    mergeOne(resolved);
    navigate(`/game/${resolved.id}`);
  }

  if (!rows.length && !loading) {
    return (
      <div className="wrap groups-page">
        <p className="groups-lede">No releases tracked for this group yet.</p>
        <button className="back-link" onClick={() => navigate("/groups")}>
          ‹ Scene groups
        </button>
      </div>
    );
  }

  const name = seedMatches[0]?.r.group || liveRows[0]?.group_name || displayName;
  const hv = crackRows.filter((x) => x.method === "hv").length;
  const trad = crackRows.length - hv;
  const out = seedMatches.filter(({ g, r }) => relOutdated(g, r)).length;
  const leaning = isRepackGroupProfile ? "Repack" : hv >= trad ? "Hypervisor" : "Traditional";
  const lastTs = rows.reduce((mx, r) => (r.ts > mx ? r.ts : mx), 0);
  const daysSince = lastTs ? Math.max(0, Math.floor((Date.now() - lastTs) / 86400000)) : null;

  return (
    <div className="wrap groups-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ Scene groups
      </button>

      <Reveal>
        <div className="grouphead">
          <div className="grouphead-avatar" style={{ background: colorForName(name) }}>
            {name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="grouphead-tag">
              {isP2PGroup(name) ? "P2P Group" : "Scene Group"}
              {STARRED_GROUPS.includes(key || "") ? " · Starred" : ""}
            </div>
            <h1>{name}</h1>
            <div className="grouphead-meta">
              {isRepackGroupProfile ? "Repack group" : `${leaning}-leaning`}
              {out ? ` · ${out} release${out === 1 ? "" : "s"} currently outdated` : ""}
              {loading ? " · syncing live releases…" : ""}
            </div>
            {STARRED_GROUPS.includes(key || "") ? (
              <div className="grouphead-caveat">
                {complete
                  ? "P2P group — full release history pulled from xREL's own group archive, not the capped search endpoint."
                  : loading
                    ? "P2P group — loading full release history…"
                    : "P2P group — xREL has no browsable feed for these; falling back to a search lookup that hard-caps around 30 results. This list may not reflect the group's complete output."}
              </div>
            ) : null}
            <AiSummary
              kind="group"
              cacheKey={key || name}
              name={name}
              ready={!loading}
              facts={{
                "Releases tracked": rows.length,
                Leaning: isRepackGroupProfile ? "Repack group" : `${leaning}-leaning`,
                "Group type": isP2PGroup(name) ? "P2P/non-scene" : "Scene",
                Starred: STARRED_GROUPS.includes(key || "") ? "yes (directly polled)" : "no",
                "Recent titles": rows.slice(0, 8).map((r) => r.game.title),
              }}
            />
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="group-stats">
          <GlassPanel className="group-stat" frost>
            <div className="group-stat-n">{rows.length}</div>
            <div className="group-stat-l">Cracks tracked</div>
          </GlassPanel>
          <GlassPanel className="group-stat" frost>
            <div className="group-stat-n group-stat-n--sm">{fmtDateMs(lastTs)}</div>
            <div className="group-stat-l">Last active</div>
          </GlassPanel>
          <GlassPanel className="group-stat" frost>
            <div className="group-stat-n">{daysSince == null ? "—" : daysSince}</div>
            <div className="group-stat-l">Days since last crack</div>
          </GlassPanel>
          {!isRepackGroupProfile ? (
            <GlassPanel className="group-stat" frost>
              <div className="group-stat-n group-stat-n--sm">
                <StarRating
                  stars={reliability[key || ""]?.stars ?? null}
                  genuineCount={reliability[key || ""]?.genuine_count ?? 0}
                  correctionCount={reliability[key || ""]?.correction_count ?? 0}
                  avgFixDays={reliability[key || ""]?.avg_fix_days ?? null}
                />
              </div>
              <div className="group-stat-l">Crack reliability</div>
            </GlassPanel>
          ) : null}
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="group-releases">
          <div className="group-releases-head">
            <h4>Releases by {name}</h4>
            {repackRows.length && crackRows.length ? (
              <SegmentedControl
                ariaLabel="Cracks or repacks"
                value={effectiveShowRepacks ? "repacks" : "cracks"}
                onChange={(v) => setShowRepacks(v === "repacks")}
                options={[
                  { value: "cracks", label: `Cracks (${crackRows.length})` },
                  { value: "repacks", label: `Repacks (${repackRows.length})` },
                ]}
              />
            ) : null}
          </div>
          {months.map((month) => {
            const isOpen = openMonths.has(month.key);
            return (
              <div className="group-month" key={month.key}>
                <button className="group-month-head" onClick={() => toggleMonth(month.key)} aria-expanded={isOpen}>
                  <span className="group-month-label">{month.label}</span>
                  <span className="group-month-right">
                    <span className="group-month-count">{month.rows.length}</span>
                    <span className={`group-month-chev${isOpen ? " group-month-chev--open" : ""}`}>›</span>
                  </span>
                </button>
                {isOpen ? (
                  <div className="group-rel-grid">
                    {month.rows.map((row) => {
                      const img = coverImg(row.game);
                      const code = row.game.title.split(/[:\s]/)[0].slice(0, 10).toUpperCase();
                      return (
                        <div
                          key={row.key}
                          className="group-rel-card-wrap"
                          role="link"
                          tabIndex={0}
                          onClick={() => handleRowClick(row)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRowClick(row);
                          }}
                        >
                          {/* Same cover-image treatment GameCard uses (coverImg,
                              code-fallback badge) -- these rows used to be bare
                              text titles with no art at all. */}
                          <div className="group-rel-cover">
                            {img ? (
                              <img className="group-rel-thumb" src={img} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} />
                            ) : (
                              <div className="group-rel-code">{code}</div>
                            )}
                          </div>
                          <div className="group-rel-card-title">{row.game.title}</div>
                          <ReleaseCard
                            game={row.game}
                            release={row.release}
                            recencyStatus={recencyStatusFor(row.release, row.comparisonReleases)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}
