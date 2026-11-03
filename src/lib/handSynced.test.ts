import { describe, expect, it } from "vitest";
import * as web from "./constants";
import * as worker from "../../worker/shared/constants";
import { slugify as webSlug } from "./format";
import { slugify as workerSlug } from "../../worker/backfill/parse";

/* The worker and the frontend bundle separately, so these exist twice as
   deliberate hand-synced copies (see the comment atop worker/shared/
   constants.ts). Nothing but this test notices when one is edited and the
   other isn't -- which is exactly how a group ends up classified one way on
   the grid and another way in the API. */
const norm = (g: string) => g.toLowerCase().replace(/[^a-z0-9]/g, "");

describe("worker/frontend hand-synced copies agree", () => {
  it("star the same groups", () => {
    expect(worker.STARRED_GROUPS.map(norm).sort()).toEqual(web.STARRED_GROUPS.map(norm).sort());
  });

  const groups = ["DenuvOwO", "ARTiFACT", "0xZeOn", "0xZe0n", "voices38", "RUNE", "EMPRESS", "CPY", "CODEX", "FLT", "TENOKE", "SKiDROW", "ElAmigos", "FitGirl", "DODI", "x.X.RIDDICK.X.x", "KaOsKrew", "ShadowEagle", "ALI213", "RVTFiX", "P2P", "PLAYMAGiC", "SomeUnknownGroup"];

  it.each(groups)("classify %s identically", (g) => {
    expect(worker.methodForGroup(g)).toBe(web.methodForGroup(g));
    expect(worker.isRepackGroup(g)).toBe(web.isRepackGroup(g));
    expect(worker.isAnonymousUpload(g)).toBe(web.isAnonymousUpload(g));
    expect(worker.isTrainerGroup(g)).toBe(web.isTrainerGroup(g));
    expect(worker.isP2PGroup(g)).toBe(web.isP2PGroup(g));
  });

  it.each(["Call of Duty: Modern Warfare 4", "Assassin's Creed III: Remastered", "  Édition spéciale! ", "", "a".repeat(80)])(
    "slugify %j identically",
    (s) => {
      expect(workerSlug(s)).toBe(webSlug(s));
    },
  );
});

describe("group classification", () => {
  it("classifies the hypervisor groups as hv, case- and punctuation-insensitively", () => {
    for (const g of ["DenuvOwO", "denuvowo", "ARTiFACT", "artifact", "0xZeOn"]) expect(web.methodForGroup(g)).toBe("hv");
  });
  it("defaults an unknown group to traditional rather than guessing", () => {
    expect(web.methodForGroup("BrandNewGroup")).toBe("trad");
  });
  it("keeps repacks and anonymous uploads out of the crack count", () => {
    expect(web.isRepackGroup("ElAmigos")).toBe(true);
    expect(web.isAnonymousUpload("P2P")).toBe(true);
    expect(web.isRepackGroup("RUNE")).toBe(false);
  });
});
