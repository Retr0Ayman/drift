import { useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { SEED_GAMES } from "../../data/seedGames";
import { allReleases } from "../../lib/groups";
import { colorForName, dPlusNLabel, fmtDateMs, relOutdated, releaseTs, slugify } from "../../lib/format";
import { STARRED_GROUPS, methodForGroup } from "../../lib/constants";
import { useGroupReleases } from "../../hooks/useGroupReleases";
import GlassPanel from "../ui/GlassPanel";
import Pill from "../ui/Pill";
import Reveal from "../ui/Reveal";
import "./Groups.css";

interface DisplayRow {
  key: string;
  title: string;
  method: "hv" | "trad";
  ts: number;
  dateLabel: string;
  timingLabel: string | null;
  href: string;
  external: boolean;
}

export default function GroupProfile() {
  const { key } = useParams();
  const navigate = useNavigate();
  const seedMatches = allReleases(SEED_GAMES).filter(({ r }) => slugify(r.group || "unknown") === key);

  // The exact display name (needed for the live query) only comes from a
  // seed match; falling back to the URL key itself still works reasonably
  // since xREL's search is case-insensitive substring matching.
  const displayName = seedMatches[0]?.r.group || key || "";
  const { rows: liveRows, loading } = useGroupReleases(displayName || null);

  const seedTitles = useMemo(() => new Set(seedMatches.map(({ g }) => g.title.toLowerCase())), [seedMatches]);

  const seedRows: DisplayRow[] = seedMatches.map(({ g, r }) => ({
    key: g.id + "-" + (r.xrelId || r.date),
    title: g.title,
    method: r.method,
    ts: releaseTs(r) || 0,
    dateLabel: r.date || "—",
    timingLabel: dPlusNLabel(g, r),
    href: `/game/${g.id}`,
    external: false,
  }));

  // Live rows fill in every real release the group has (per the P2P-lookup
  // fix) that isn't already covered by a seed entry -- no reliable Steam
  // release date to compare against for these, so no D+N timing label; link
  // out to the release's own xREL page since there's no local detail page
  // for a title that isn't in the seed catalog.
  const liveExtraRows: DisplayRow[] = liveRows
    .filter((row) => !seedTitles.has((row.ext_info?.title || "").toLowerCase()))
    .map((row) => ({
      key: row.id,
      title: row.ext_info?.title || row.dirname,
      method: methodForGroup(row.group_name || displayName),
      ts: (row.time || 0) * 1000,
      dateLabel: row.time ? fmtDateMs(row.time * 1000) : "—",
      timingLabel: null,
      href: row.link_href || "https://www.xrel.to/",
      external: true,
    }));

  const rows = [...seedRows, ...liveExtraRows].sort((a, b) => b.ts - a.ts);

  if (!rows.length && !loading) {
    return (
      <div className="wrap groups-page">
        <p className="groups-lede">No releases tracked for this group yet.</p>
        <Link to="/groups">‹ Scene groups</Link>
      </div>
    );
  }

  const name = seedMatches[0]?.r.group || liveRows[0]?.group_name || displayName;
  const hv = rows.filter((x) => x.method === "hv").length;
  const trad = rows.length - hv;
  const out = seedMatches.filter(({ g, r }) => relOutdated(g, r)).length;
  const leaning = hv >= trad ? "Hypervisor" : "Traditional";
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
              Scene Group{STARRED_GROUPS.includes(key || "") ? " · Starred" : ""}
            </div>
            <h1>{name}</h1>
            <div className="grouphead-meta">
              {leaning}-leaning{out ? ` · ${out} release${out === 1 ? "" : "s"} currently outdated` : ""}
              {loading ? " · syncing live releases…" : ""}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="group-stats">
          <GlassPanel className="group-stat">
            <div className="group-stat-n">{rows.length}</div>
            <div className="group-stat-l">Cracks tracked</div>
          </GlassPanel>
          <GlassPanel className="group-stat">
            <div className="group-stat-n group-stat-n--sm">{fmtDateMs(lastTs)}</div>
            <div className="group-stat-l">Last active</div>
          </GlassPanel>
          <GlassPanel className="group-stat">
            <div className="group-stat-n" style={{ color: "var(--out)" }}>
              {daysSince == null ? "—" : daysSince}
            </div>
            <div className="group-stat-l">Days since last crack</div>
          </GlassPanel>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="group-releases">
          <h4>Releases by {name}</h4>
          <GlassPanel className="group-rel-list">
            {rows.map((row) =>
              row.external ? (
                <a className="group-rel-row" key={row.key} href={row.href} target="_blank" rel="noopener noreferrer">
                  <span className="group-rel-title">{row.title}</span>
                  <Pill tone={row.method}>{row.method === "hv" ? "HV" : "TRAD"}</Pill>
                  <span className="group-rel-dn">xREL ↗</span>
                </a>
              ) : (
                <Link className="group-rel-row" key={row.key} to={row.href}>
                  <span className="group-rel-title">{row.title}</span>
                  <Pill tone={row.method}>{row.method === "hv" ? "HV" : "TRAD"}</Pill>
                  {row.timingLabel ? <span className="group-rel-dn">{row.timingLabel}</span> : null}
                </Link>
              ),
            )}
          </GlassPanel>
        </div>
      </Reveal>
    </div>
  );
}
