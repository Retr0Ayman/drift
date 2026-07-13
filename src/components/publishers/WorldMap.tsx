import { useMemo } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldTopology from "world-atlas/countries-110m.json";
import "./WorldMap.css";

interface WorldMapProps {
  countryCounts: Record<string, number>;
  selected: string | null;
  onSelect: (country: string | null) => void;
}

const WIDTH = 760;
const HEIGHT = 380;

/* Built directly on d3-geo + topojson-client rather than react-simple-maps:
   that package's peer deps cap at React 18 (not 19) and its optional zoom
   feature drags in a d3-color version with a known ReDoS advisory. This is
   the same underlying engine react-simple-maps wraps, just without the
   zoom/pan machinery this feature doesn't need anyway -- 0 vulnerabilities
   in the dependency tree instead of 5 high-severity ones. */
export default function WorldMap({ countryCounts, selected, onSelect }: WorldMapProps) {
  const topology = worldTopology as unknown as Topology;
  const features = useMemo(() => {
    const geo = feature(topology, topology.objects.countries as GeometryCollection);
    return geo.features;
  }, [topology]);

  const pathGen = useMemo(() => {
    const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: "Sphere" });
    return geoPath(projection);
  }, []);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="worldmap" role="img" aria-label="Publisher headquarters map">
      {features.map((f) => {
        const name = (f.properties as { name?: string } | undefined)?.name || "";
        const count = countryCounts[name] || 0;
        const isSelected = selected === name;
        const d = pathGen(f) || "";
        return (
          <path
            key={name}
            d={d}
            className={`worldmap-country${count ? " worldmap-country--tagged" : ""}${isSelected ? " worldmap-country--selected" : ""}`}
            onClick={() => count && onSelect(isSelected ? null : name)}
          >
            <title>{count ? `${name} — ${count} publisher${count === 1 ? "" : "s"}` : name}</title>
          </path>
        );
      })}
    </svg>
  );
}
