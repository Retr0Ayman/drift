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

  return (
    <div className="wrap groups-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>
      <Reveal>
        <div className="groups-head">
          <span className="groups-eyebrow">Scene groups</span>
          <h1>Every group Orvyn is tracking</h1>
          <p className="groups-lede">
            Cracking groups seen across tracked titles, hypervisor and traditional alike. Starred groups are
            tracked directly since xREL has no way to browse their releases by category.
          </p>
          <div className="groups-scoped">
            {idx.length} group{idx.length === 1 ? "" : "s"} synced · {totalCracks} crack{totalCracks === 1 ? "" : "s"} synced
          </div>
        </div>
      </Reveal>

      <div className="groups-grid">
        {idx.map((e, i) => (
          <Reveal key={e.key} delay={Math.min(i, 8) * 0.04}>
            <Link to={`/group/${e.key}`}>
              <GlassPanel className={`group-card${e.starred ? " group-card--starred" : ""}`}>
                <div className="group-card-top">
                  <div className="group-badge" style={{ background: colorForName(e.name) }}>
                    {e.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="group-name">
                    {e.name}
                    {e.starred ? <span className="group-star" title="Starred group">★</span> : null}
                  </div>
                </div>
                <div className="group-count">
                  {e.count} crack{e.count === 1 ? "" : "s"}
                  {e.out ? ` · ${e.out} outdated` : ""}
                </div>
                <div className="group-last">Last active {fmtDateMs(e.lastTs)}</div>
              </GlassPanel>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
