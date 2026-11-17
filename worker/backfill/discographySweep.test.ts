import { describe, expect, it } from "vitest";
import { matchKey, parseSteamSearch } from "./discographySweep";

describe("matchKey", () => {
  it("folds trademark glyphs, punctuation and edition qualifiers", () => {
    expect(matchKey("Grand Theft Auto IV: The Complete Edition")).toBe(matchKey("Grand Theft Auto IV"));
    expect(matchKey("Rocksmith® 2014 Remastered")).toBe(matchKey("Rocksmith 2014"));
    expect(matchKey("Dino Crisis")).not.toBe(matchKey("Dino Crisis 2"));
  });
});

describe("parseSteamSearch", () => {
  it("extracts appid/title pairs and decodes entities", () => {
    const html = `<a data-ds-appid="12210" class="x"><span class="title">Grand Theft Auto IV</span></a><a data-ds-appid="9" ><span class="title">Rock &amp; Roll</span></a>`;
    expect(parseSteamSearch({ total_count: 2, results_html: html })).toEqual({
      total: 2,
      items: [{ appid: 12210, title: "Grand Theft Auto IV" }, { appid: 9, title: "Rock & Roll" }],
    });
  });
});
