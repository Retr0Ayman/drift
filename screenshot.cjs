// Real visual verification tool -- replaces shelling out to system Edge's
// `--headless` CLI flags, which proved unreliable across this project's
// several rounds of ambient-background/UI work: worked once, then got
// consistently stuck rendering the intro-splash frame (14122-byte PNG,
// same size every time) across every --virtual-time-budget/profile
// variation tried. Playwright drives its OWN bundled Chromium via a real
// CDP connection instead of guessing CLI flags against a shared system
// browser profile -- confirmed reliable across every use this session
// since being added.
//
// One-time setup per machine (the browser binary itself isn't committed):
//   npx playwright install chromium
//
// Usage: npm run screenshot -- <url> <outfile> [waitMs]
//    or: node screenshot.cjs <url> <outfile> [waitMs]
// waitMs (default 3000) is a settle delay after networkidle -- this
// project's IntroAnimation holds a splash screen for ~2.2s on first paint,
// so a shorter wait risks capturing that instead of the real page.
const { chromium } = require("playwright");

(async () => {
  const url = process.argv[2];
  const outfile = process.argv[3];
  const waitMs = Number(process.argv[4] || 3000);
  if (!url || !outfile) {
    console.error("usage: node screenshot.cjs <url> <outfile> [waitMs]");
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: outfile });
  await browser.close();
  console.log("saved:", outfile);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
