import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { useStarredGroupSummaries } from "../../hooks/useStarredGroupSummaries";
import { useGroupReliability } from "../../hooks/useGroupReliability";
import { groupsIndex } from "../../lib/groups";
import { colorForName, fmtDateMs } from "../../lib/format";
import GlassPanel from "../ui/GlassPanel";
import Pill from "../ui/Pill";
import StarRating from "../ui/StarRating";
import Reveal from "../ui/Reveal";
import SegmentedControl from "../ui/SegmentedControl";
import { usePageMeta } from "../../hooks/usePageMeta";
import "./Groups.css";

type CategoryFilter = "all" | "p2p" | "scene";

export default function GroupsDirectory() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const { summaries } = useStarredGroupSummaries(games);
  const { data: reliability } = useGroupReliability();
  const idx = groupsIndex(games, summaries);
  usePageMeta({
    title: "Scene & P2P groups",
    description: `${idx.length || "Every"} cracking group orlaz is tracking, hypervisor and traditional alike.`,
  });
  const totalCracks = idx.reduce((s, e) => s + e.count, 0);
  const totalHv = idx.reduce((s, e) => s + e.hv, 0);
  const starredCount = idx.filter((e) => e.starred).length;

  const topByVolume = useMemo(() => [...idx].sort((a, b) => b.count - a.count)[0], [idx]);

  // P2P classification (isP2P) is deliberately broader than "starred" --
  // starring is only about which groups need direct/individual xREL
  // polling because they're invisible to the main browse feed, not about
  // which groups are genuinely P2P/non-scene. See lib/constants.ts's
  // isP2PGroup for the confirmed-live list this now checks against.
  const [category, setCategory] = useState<CategoryFilter>("all");
  const visible = idx.filter((e) => (category === "all" ? true : category === "p2p" ? e.isP2P : !e.isP2P));
  const p2pCount = idx.filter((e) => e.isP2P).length;
  const sceneCount = idx.length - p2pCount;

  return (
    <div className="wrap groups-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>

      <Link to="/digest" className="groups-leaderboard-link">
        Digest — what's notable right now ›
      </Link>

      <Reveal>
        <div className="groups-hero">
          <div className="groups-hero-main">
            <span className="groups-eyebrow">Scene &amp; P2P groups</span>
            <h1>Every group orlaz is tracking</h1>
            <p className="groups-lede">
              Cracking groups seen across tracked titles, hypervisor and traditional alike. Starred groups are
              tracked directly since xREL has no way to browse their releases by category.
            </p>
          </div>
          <GlassPanel strong className="groups-signal">
            <div className="groups-signal-head">Directory signal</div>
            <div className="groups-signal-grid">
              <div className="groups-signal-stat">
                <span className="groups-signal-n">{idx.length || "—"}</span>
                <span className="groups-signal-l">Groups tracked</span>
              </div>
              <div className="groups-signal-stat">
                <span className="groups-signal-n">{totalCracks || "—"}</span>
                <span className="groups-signal-l">Cracks tracked</span>
              </div>
              <div className="groups-signal-stat">
                <span className="groups-signal-n" style={{ color: "var(--hv)" }}>
                  {totalHv || "—"}
                </span>
                <span className="groups-signal-l">Hypervisor releases</span>
              </div>
              <div className="groups-signal-stat">
                <span className="groups-signal-n" style={{ color: "var(--accent)" }}>
                  {starredCount || "—"}
                </span>
                <span className="groups-signal-l">Starred (directly polled)</span>
              </div>
            </div>
            {topByVolume ? (
              <div className="groups-signal-foot">
                Most active right now: <strong>{topByVolume.name}</strong> ({topByVolume.count} tracked)
              </div>
            ) : null}
          </GlassPanel>
        </div>
      </Reveal>

      <div className="groups-filter-row">
        <SegmentedControl
          ariaLabel="Filter by category"
          value={category}
          onChange={(v) => setCategory(v as CategoryFilter)}
          options={[
            { value: "all", label: `All (${idx.length})` },
            { value: "p2p", label: `P2P (${p2pCount})` },
            { value: "scene", label: `Scene (${sceneCount})` },
          ]}
        />
        <span className="groups-filter-note">
          {category === "p2p"
            ? "Confirmed-live P2P/non-scene groups (xREL's own p2p_results classification, curated -- see lib/constants.ts). ★-starred ones are additionally polled directly since xREL has no browse-by-category feed for them."
            : category === "scene"
              ? "Scene groups surface naturally from tracked titles' own crack releases."
              : "P2P groups (confirmed-live, some starred for direct polling) alongside scene groups seen across tracked titles."}
        </span>
      </div>

      <div className="groups-grid">
        {visible.map((e, i) => {
          const hvPct = e.count ? Math.round((e.hv / e.count) * 100) : 0;
          return (
            <Reveal key={e.key} delay={Math.min(i, 8) * 0.04}>
              <Link to={`/group/${e.key}`}>
                <GlassPanel className={`group-card${e.starred ? " group-card--starred" : ""}`} frostStrong>
                  <div className="group-card-top">
                    <div className="group-badge" style={{ background: colorForName(e.name) }}>
                      {e.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="group-name">
                        {e.name}
                        {e.starred ? <span className="group-star" title="Starred group">★</span> : null}
                        {e.isP2P ? (
                          <Pill tone="neutral" className="group-p2p-tag" title="P2P/non-scene group">
                            P2P
                          </Pill>
                        ) : null}
                      </div>
                      <div className="group-count">
                        {e.count} crack{e.count === 1 ? "" : "s"}
                        {e.out ? ` · ${e.out} outdated` : ""}
                      </div>
                    </div>
                  </div>
                  {e.count ? (
                    <div className="group-mix" title={`${hvPct}% hypervisor, ${100 - hvPct}% traditional`}>
                      <span className="group-mix-hv" style={{ width: `${hvPct}%` }} />
                    </div>
                  ) : null}
                  <div className="group-card-foot">
                    <StarRating
                      stars={reliability[e.key]?.stars ?? null}
                      genuineCount={reliability[e.key]?.genuine_count ?? 0}
                      correctionCount={reliability[e.key]?.correction_count ?? 0}
                      avgFixDays={reliability[e.key]?.avg_fix_days ?? null}
                    />
                    <div className="group-last">Last active {fmtDateMs(e.lastTs)}</div>
                  </div>
                </GlassPanel>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
