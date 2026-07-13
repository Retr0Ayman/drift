import { useParams, Link, useNavigate } from "react-router-dom";
import { SEED_GAMES } from "../../data/seedGames";
import { allReleases } from "../../lib/groups";
import { colorForName, dPlusNLabel, fmtDateMs, relOutdated, releaseTs, slugify } from "../../lib/format";
import { STARRED_GROUPS } from "../../lib/constants";
import GlassPanel from "../ui/GlassPanel";
import Pill from "../ui/Pill";
import Reveal from "../ui/Reveal";
import "./Groups.css";

export default function GroupProfile() {
  const { key } = useParams();
  const navigate = useNavigate();
  const matches = allReleases(SEED_GAMES).filter(({ r }) => slugify(r.group || "unknown") === key);

  if (!matches.length) {
    return (
      <div className="wrap groups-page">
        <p className="groups-lede">No releases tracked for this group{STARRED_GROUPS.includes(key || "") ? " in the seed catalog yet — live data lands next." : "."}</p>
        <Link to="/groups">‹ Scene groups</Link>
      </div>
    );
  }

  const name = matches[0].r.group || "unknown";
  const hv = matches.filter((x) => x.r.method === "hv").length;
  const trad = matches.length - hv;
  const out = matches.filter(({ g, r }) => relOutdated(g, r)).length;
  const leaning = hv >= trad ? "Hypervisor" : "Traditional";
  const lastTs = matches.reduce((mx, { r }) => {
    const t = releaseTs(r);
    return t && t > mx ? t : mx;
  }, 0);
  const daysSince = lastTs ? Math.max(0, Math.floor((Date.now() - lastTs) / 86400000)) : null;
  const sorted = [...matches].sort((a, b) => (releaseTs(b.r) || 0) - (releaseTs(a.r) || 0));

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
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="group-stats">
          <GlassPanel className="group-stat">
            <div className="group-stat-n">{matches.length}</div>
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
            {sorted.map(({ g, r }, i) => {
              const dn = dPlusNLabel(g, r);
              return (
                <Link to={`/game/${g.id}`} className="group-rel-row" key={i}>
                  <span className="group-rel-title">{g.title}</span>
                  <Pill tone={r.method}>{r.method === "hv" ? "HV" : "TRAD"}</Pill>
                  {dn ? <span className="group-rel-dn">{dn}</span> : null}
                </Link>
              );
            })}
          </GlassPanel>
        </div>
      </Reveal>
    </div>
  );
}
