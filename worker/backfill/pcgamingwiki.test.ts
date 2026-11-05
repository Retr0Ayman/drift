import { describe, expect, it } from "vitest";
import { classifyDrm, extractTemplates, interpretPcgwReply, parsePcgwPage, parseRemovalDate, resolvePcgwBatch, splitTopLevel, type PcgwHttp } from "./pcgamingwiki";

// Real lines from PCGamingWiki wikitext, fetched 2026-11-05.
const ATOMIC = `{{Infobox game
|steam appid  = 668580
}}
{{ii}} {{Removed DRM|Denuvo Anti-Tamper}} was removed on August 3, 2026.<ref>{{Refurl|url=https://steamdb.info/patchnotes/24534183/|title=The executable of the game's size has been reduced drastically, indicating that Denuvo has been removed.|date=2026-08-03}}</ref>`;
const FARCRY = `|steam appid  = 371660\n{{ii}} All versions require {{DRM|Uplay||Denuvo Anti-Tamper}}.<ref>{{Refurl|url=https://store.steampowered.com//eula/371660_eula_1|title=EULA|date=May 2023}}</ref>`;
const HIFI = `|steam appid  = 1817230\n{{ii}} All versions require {{DRM|VMProtect}}.\n{{ii}} {{Removed DRM|Denuvo}} was removed on December 4, 2025.<ref>{{Refurl|url=https://steamdb.info/patchnotes/20567064/|title=Denuvo removed in Patch 10.|date=2025-12-04}}</ref>`;

describe("parsePcgwPage", () => {
  it("reads a sourced, dated removal", () => {
    const p = parsePcgwPage(ATOMIC);
    expect(p.appids).toEqual([668580]);
    expect(p.usesDenuvo).toBe(false);
    expect(p.removedDenuvo).toEqual({ hasRef: true, dateMs: Date.UTC(2026, 7, 3), url: "https://steamdb.info/patchnotes/24534183/" });
  });
  it("reads current Denuvo inside a multi-argument DRM template", () => {
    const p = parsePcgwPage(FARCRY);
    expect(p.usesDenuvo).toBe(true);
    expect(p.removedDenuvo).toBeNull();
  });
  it("other DRM on the page doesn't count as Denuvo", () => {
    const p = parsePcgwPage(HIFI);
    expect(p.usesDenuvo).toBe(false);
    expect(p.removedDenuvo?.dateMs).toBe(Date.UTC(2025, 11, 4));
  });
  it("a removal with no ref is reported as such (not enough to act on)", () => {
    const p = parsePcgwPage("|steam appid = 5\n{{ii}} {{Removed DRM|Denuvo}} was removed on May 5, 2026.");
    expect(p.removedDenuvo).toEqual({ hasRef: false, dateMs: Date.UTC(2026, 4, 5), url: null });
  });
  it("handles several appids, and a <ref> wrapping onto the next line", () => {
    const p = parsePcgwPage("|steam appid = 10, 20\n{{ii}} {{Removed DRM|Denuvo}}.<ref>{{Refurl|url=https://x.test/a\n|date=2026-01-02}}</ref>");
    expect(p.appids).toEqual([10, 20]);
    expect(p.removedDenuvo?.dateMs).toBe(Date.UTC(2026, 0, 2));
  });
  it("a month-only date is not a removal date", () => {
    expect(parseRemovalDate("{{Refurl|date=May 2023}}")).toBeNull();
    expect(parseRemovalDate("date=2026-08")).toBeNull();
  });
});

describe("interpretPcgwReply", () => {
  it("treats the real permissiondenied body (HTTP 200) as a failure", () => {
    const body = '{"error":{"code":"permissiondenied","info":"You don\'t have permission to run arbitrary Cargo queries."}}';
    expect(interpretPcgwReply(200, body)).toEqual({ ok: false, status: 200, reason: "api_permissiondenied" });
  });
  it("treats a Cloudflare challenge page and non-200s as failures", () => {
    expect(interpretPcgwReply(200, "<!DOCTYPE html><title>Just a moment...</title>")).toMatchObject({ ok: false, reason: "challenge" });
    expect(interpretPcgwReply(403, "x")).toMatchObject({ ok: false, reason: "http_403" });
    expect(interpretPcgwReply(200, "not json")).toMatchObject({ ok: false, reason: "parse_error" });
  });
  it("accepts a clean API answer", () => {
    expect(interpretPcgwReply(200, '{"query":{}}')).toMatchObject({ ok: true });
  });
});

function page(title: string, wikitext: string | null) {
  return wikitext == null ? { title, missing: true } : { title, revisions: [{ slots: { main: { content: wikitext } } }] };
}

/* A fake wiki: pages by exact (case-sensitive) title, plus a search index. */
function fakeHttp(pages: Record<string, string>, search: Record<string, string[]> = {}, opts: { failAt?: number } = {}): PcgwHttp & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    sleep: async () => {},
    async get(url) {
      calls.push(url);
      if (opts.failAt != null && calls.length === opts.failAt) return { status: 200, text: '{"error":{"code":"permissiondenied"}}' };
      const u = new URL(url);
      if (u.searchParams.get("list") === "search") {
        const q = u.searchParams.get("srsearch")!;
        return { status: 200, text: JSON.stringify({ query: { search: (search[q] || []).map((title) => ({ title })) } }) };
      }
      const titles = u.searchParams.get("titles")!.split("|");
      return { status: 200, text: JSON.stringify({ query: { pages: titles.map((t) => page(t, pages[t] ?? null)) } }) };
    },
  };
}

describe("resolvePcgwBatch", () => {
  it("matches by exact title only when the page's own appid equals ours", async () => {
    const http = fakeHttp({ "Atomic Heart": ATOMIC });
    const r = await resolvePcgwBatch([{ id: "a", appid: 668580, title: "Atomic Heart", knownPage: null }], http);
    expect(r.failure).toBeNull();
    expect(r.outcomes.get("a")).toMatchObject({ status: "match", page: "Atomic Heart" });
  });

  it("falls back to search on a case mismatch and accepts the single appid-matching page", async () => {
    const http = fakeHttp({ "Dragon Ball FighterZ": "|steam appid = 678950\n" }, { "DRAGON BALL FighterZ": ["Dragon Ball FighterZ"] });
    const r = await resolvePcgwBatch([{ id: "d", appid: 678950, title: "DRAGON BALL FighterZ", knownPage: null }], http);
    expect(r.outcomes.get("d")).toMatchObject({ status: "match", page: "Dragon Ball FighterZ" });
  });

  it("a page with a different appid is no match, never a guess", async () => {
    const http = fakeHttp({ "Some Game": "|steam appid = 999\n" }, { "Some Game": ["Some Game"] });
    const r = await resolvePcgwBatch([{ id: "g", appid: 111, title: "Some Game", knownPage: null }], http);
    expect(r.outcomes.get("g")).toEqual({ status: "nomatch", reason: "appid_mismatch" });
  });

  it("two pages carrying our appid is ambiguous: no match", async () => {
    const http = fakeHttp({ A: "|steam appid = 5\n", B: "|steam appid = 5\n" }, { Zed: ["A", "B"] });
    const r = await resolvePcgwBatch([{ id: "z", appid: 5, title: "Zed", knownPage: null }], http);
    expect(r.outcomes.get("z")).toEqual({ status: "nomatch", reason: "ambiguous" });
  });

  it("a missing page with no search hits is a real 'no page' answer", async () => {
    const r = await resolvePcgwBatch([{ id: "n", appid: 1, title: "Nope", knownPage: null }], fakeHttp({}));
    expect(r.outcomes.get("n")).toEqual({ status: "nomatch", reason: "no_page" });
  });

  it("uses the cached page title first", async () => {
    const http = fakeHttp({ "Real Title": "|steam appid = 7\n" });
    const r = await resolvePcgwBatch([{ id: "k", appid: 7, title: "Steam Title", knownPage: "Real Title" }], http);
    expect(r.outcomes.get("k")).toMatchObject({ status: "match", page: "Real Title" });
    expect(http.calls).toHaveLength(1);
  });

  it("an API error aborts the batch and marks every game failed (nothing to stamp)", async () => {
    const http = fakeHttp({ "Atomic Heart": ATOMIC }, {}, { failAt: 1 });
    const r = await resolvePcgwBatch(
      [
        { id: "a", appid: 668580, title: "Atomic Heart", knownPage: null },
        { id: "b", appid: 2, title: "Other", knownPage: null },
      ],
      http,
    );
    expect(r.failure).toEqual({ status: 200, reason: "api_permissiondenied" });
    expect([...r.outcomes.values()].every((o) => o.status === "failed")).toBe(true);
    expect(http.calls).toHaveLength(1);
  });
});

// Real excerpts (PCGamingWiki wikitext, 2026-11-05).
const DBFZ = `|steam appid  = 678950
|anticheat        = Easy Anti-Cheat
|anticheat notes  = <ref>{{Refurl|url=https://steamdb.info/app/678950/info/|title=SteamDB|date=2025-11-25}}</ref>
==Availability==
{{Availability|
{{Availability/row| Gamersgate | dragon-ball-fighterz | Steam | {{store link|Gamersgate|dragon-ball-fighterz-fighterz-edition|FighterZ Edition}} also available. | | Windows }}
{{Availability/row| Microsoft Store | 9nztsfkr9m94 | Microsoft Store | {{store link|Microsoft Store|9N22XXKKV3XF|FighterZ Edition}} also available. | | Windows }}
{{Availability/row| Steam | 678950 | Steam | {{store link|steam-sub|212600|FighterZ Edition}} also available. | | Windows }}
}}
{{ii}} The Steam version requires {{DRM|Denuvo Anti-Tamper}}.<ref>[https://store.steampowered.com//eula/678950_eula_0 EULA].</ref>`;

const RDR2 = `|steam appid  = 1174180
|anticheat        =
==Availability==
{{Availability|
{{Availability/row| Epic Games Store | red-dead-redemption-2 | Epic Games Store, Rockstar Games Launcher | {{store link|Epic Games Store|a|Red Dead Online}} also available. | | Windows }}
{{Availability/row| Steam | 1174180 | Steam, Rockstar Games Launcher | | | Windows }}
}}`;

const STARDEW = `|steam appid  = 413150
|anticheat        =
==Availability==
{{Availability|
{{Availability/row| Retail |  | DRM-free |  | Steam | Windows }}
{{Availability/row| Steam | 413150 | DRM-free | DRM-free on Linux when Steam is not installed.<ref>{{Refcheck|user=x|date=2017-07-09}}</ref> | | Windows }}
}}`;

describe("other DRM tags from wikitext (same fetch, no extra requests)", () => {
  it("DBFZ: Steam DRM + Easy Anti-Cheat + Denuvo, storefront names filtered, nested templates in notes handled", () => {
    const p = parsePcgwPage(DBFZ);
    expect(p.tags.sort()).toEqual(["Denuvo Anti-Tamper", "Easy Anti-Cheat", "Steam DRM"]);
    // Denuvo itself is decided in denuvoDecision.ts, not from this list
    expect(p.usesDenuvo).toBe(true);
    expect(p.complete).toBe(true);
  });
  it("RDR2: a publisher's closed launcher is a real requirement, relabelled Steam DRM alongside it", () => {
    expect(parsePcgwPage(RDR2).tags.sort()).toEqual(["Rockstar Games Launcher", "Steam DRM"]);
  });
  it("prose {{DRM|..}} templates count (Hi-Fi Rush: VMProtect current, Denuvo removed -> former only)", () => {
    const p = parsePcgwPage(HIFI);
    expect(p.tags).toEqual(["VMProtect"]);
    expect(p.formerTags).toEqual(["Denuvo Anti-Tamper"]); // "Denuvo" canonicalised
  });
  it("a DRM-free game gets no tags, and the page still counts as a complete parse", () => {
    const p = parsePcgwPage(STARDEW);
    expect(p.tags).toEqual([]);
    expect(p.complete).toBe(true);
  });
  it("a page without an Availability table is not a complete parse (cannot be used to drop tags)", () => {
    expect(parsePcgwPage("|steam appid = 5\n").complete).toBe(false);
  });
  it("classifyDrm keeps removed names out of current tags, in former", () => {
    expect(classifyDrm(["Denuvo Anti-Tamper", "VMProtect"], ["Denuvo Anti-Tamper"], [], ["Steam"])).toEqual({ tags: ["VMProtect", "Steam DRM"], formerTags: ["Denuvo Anti-Tamper"] });
  });
  it("splitTopLevel / extractTemplates respect nesting", () => {
    expect(splitTopLevel("a|{{x|y}}|[[p|q]]|b")).toEqual(["a", "{{x|y}}", "[[p|q]]", "b"]);
    expect(extractTemplates("{{Availability/row| A | {{n|1|2}} }}\n{{Availability/row| B }}", "Availability/row")).toHaveLength(2);
  });
});

describe("subrequest budget: deferral is neither an answer nor a failure", () => {
  it("a spent budget marks the remaining games deferred and reports no source failure", async () => {
    const { SubrequestBudgetExceeded } = await import("../shared/subrequestBudget");
    let n = 0;
    const http: PcgwHttp = {
      sleep: async () => {},
      async get() {
        n++;
        if (n > 1) throw new SubrequestBudgetExceeded();
        return { status: 200, text: JSON.stringify({ query: { pages: [{ title: "Known", missing: true }] } }) };
      },
    };
    const r = await resolvePcgwBatch(
      [
        { id: "a", appid: 1, title: "Known", knownPage: null }, // exact-title miss -> needs a search -> budget spent
        { id: "b", appid: 2, title: "Other", knownPage: null },
      ],
      http,
    );
    expect(r.failure).toBeNull();
    expect(r.outcomes.get("a")).toEqual({ status: "deferred" });
    expect(r.outcomes.get("b")).toEqual({ status: "deferred" });
  });
});
