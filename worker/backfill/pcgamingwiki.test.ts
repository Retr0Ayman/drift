import { describe, expect, it } from "vitest";
import { interpretPcgwReply, parsePcgwPage, parseRemovalDate, resolvePcgwBatch, type PcgwHttp } from "./pcgamingwiki";

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
