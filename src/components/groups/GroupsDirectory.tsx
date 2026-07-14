import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { useStarredGroupSummaries } from "../../hooks/useStarredGroupSummaries";
import { groupsIndex } from "../../lib/groups";
import { colorForName, fmtDateMs } from "../../lib/format";
import GlassPanel from "../ui/GlassPanel";
import Reveal from "../ui/Reveal";
import "./Groups.css";

export default function GroupsDirectory() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const { summaries } = useStarredGroupSummaries();
  const idx = groupsIndex(games, summaries);
  const totalCracks = idx.reduce((s, e) => s + e.count, 0);
  const totalHv = idx.reduce((s, e) => s + e.hv, 0);
  const starredCount = idx.filter((e) => e.starred).length;

  const topByVolume = useMemo(() => [...idx].sort((a, b) => b.count - a.count)[0], [idx]);

  return (
    <div className="wrap groups-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>

      <Reveal>
        <div className="groups-hero">
          <div className="groups-hero-main">
            <span className="groups-eyebrow">Scene &amp; P2P groups</span>
            <h1>Every group Orvyn is tracking</h1>
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
                <span className="groups-signal-l">Starred (P2P-only)</span>
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

      <div className="groups-grid">
        {idx.map((e, i) => {
          const hvPct = e.count ? Math.round((e.hv / e.count) * 100) : 0;
          return (
            <Reveal key={e.key} delay={Math.min(i, 8) * 0.04}>
              <Link to={`/group/${e.key}`}>
                <GlassPanel className={`group-card${e.starred ? " group-card--starred" : ""}`}>
                  <div className="group-card-top">
                    <div className="group-badge" style={{ background: colorForName(e.name) }}>
                      {e.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="group-name">
                        {e.name}
                        {e.starred ? <span className="group-star" title="Starred group">★</span> : null}
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
                  <div className="group-last">Last active {fmtDateMs(e.lastTs)}</div>
                </GlassPanel>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
