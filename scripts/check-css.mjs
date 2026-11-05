// Build guard: lightningcss (Vite's CSS minifier) silently drops the
// unprefixed `backdrop-filter` when a rule declares it BEFORE its
// `-webkit-` twin. Source CSS must write `-webkit-backdrop-filter` first.
// This fails the build if any built rule has the prefixed property alone.
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../dist/assets/", import.meta.url);
let bad = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith(".css"))) {
  const css = readFileSync(new URL(f, dir), "utf8");
  for (const m of css.matchAll(/\{([^{}]*)\}/g)) {
    const b = m[1];
    if (b.includes("-webkit-backdrop-filter") && !/(^|[^-])backdrop-filter/.test(b)) {
      bad++;
      console.error(`${f}: rule has -webkit-backdrop-filter but no unprefixed backdrop-filter: ${b.slice(0, 90)}`);
    }
  }
}
if (bad) {
  console.error("Write -webkit-backdrop-filter BEFORE backdrop-filter in the source CSS.");
  process.exit(1);
}
console.log("css check: backdrop-filter intact");
