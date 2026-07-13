import type { Game, Release } from "../types/game";
import { fmtBuild } from "./format";

export function nfoText(g: Game, r: Release): string {
  const line = "  ────────────────────────────────────────────────────";
  const pad = (k: string, v: string) => ("    " + k).padEnd(16) + ": " + v;
  const store = g.appid ? "store.steampowered.com/app/" + g.appid : "n/a";
  return [
    "   ▄▄▄  ▄▄▄  ▄  ▄▄▄▄ ▄▄▄▄▄",
    "   █  █ █▀▀▄ █  █▀▀  █   ▀   D R I F T   ·   scene info",
    "   ▀▀▀  ▀  ▀ ▀  ▀    ▀",
    "",
    "        <<< " + r.group + " proudly presents >>>",
    line,
    pad("Title", g.title),
    pad("Group", r.group),
    pad("Cracker", r.group),
    pad("Method", r.label + (r.method === "hv" ? " (hypervisor bypass)" : " (binary patch)")),
    pad("Protection", "Denuvo" + (g.tags && g.tags.length ? " · " + g.tags.join(", ") : "")),
    pad("Build", fmtBuild(r.build)),
    pad("Version", r.version || "-"),
    pad("Date", r.date || "-"),
    pad("Store", store),
    line,
    "    Release notes:",
    "      " + (r.note || "No notes."),
    line,
    "    greetz:  the scene · voices38 · 0xZe0n · DenuvOwO · RUNE",
    "             EMPRESS · and everyone keeping preservation alive",
    line,
    "        this scene .nfo is DRIFT-generated from tracked release data",
  ].join("\n");
}
