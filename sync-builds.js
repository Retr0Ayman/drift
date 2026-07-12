/* ==========================================================================
   DRIFT · auto build-sync
   Reads status.json, asks api.steamcmd.net for each game's latest PUBLIC
   build id, updates currentBuild, and writes the file back. A GitHub Action
   runs this on a schedule and commits the changes — so "latest build" stays
   accurate with zero manual work and no paid infra.

   api.steamcmd.net is a free, read-only mirror of steamcmd app_info.
   Build id path: data[appid].depots.branches.public.buildid
   Requires Node 18+ (global fetch). Run:  node sync-builds.js
   ========================================================================== */
const fs = require("fs");
const FILE = process.env.STATUS_FILE || "status.json";

async function latestBuild(appid) {
  try {
    const r = await fetch(`https://api.steamcmd.net/v1/info/${appid}`, {
      headers: { "User-Agent": "drift-build-sync" },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const b = j?.data?.[appid]?.depots?.branches?.public?.buildid;
    return b ? Number(b) : null;
  } catch {
    return null;
  }
}

(async () => {
  const games = JSON.parse(fs.readFileSync(FILE, "utf8"));
  let changed = 0;

  for (const g of games) {
    if (!g.appid) continue;
    const build = await latestBuild(g.appid);
    if (build && build !== g.currentBuild) {
      console.log(`${g.title}: ${g.currentBuild ?? "—"} -> ${build}`);
      g.currentBuild = build;
      changed++;
    }
    await new Promise((r) => setTimeout(r, 350)); // be polite to the API
  }

  if (changed) {
    fs.writeFileSync(FILE, JSON.stringify(games, null, 2) + "\n");
    console.log(`Updated ${changed} build id(s).`);
  } else {
    console.log("No build changes.");
  }
  // exit code 0 either way; the workflow decides whether to commit
})();
