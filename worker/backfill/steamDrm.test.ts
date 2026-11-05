import { describe, expect, it } from "vitest";
import { interpretSteamReply, noticeListsDenuvo } from "./steamDrm";

describe("interpretSteamReply", () => {
  it("reads drm_notice, and an absent notice as ok/null", () => {
    expect(interpretSteamReply(1, 200, JSON.stringify({ "1": { success: true, data: { drm_notice: "Denuvo Anti-tamper" } } }))).toEqual({ status: "ok", notice: "Denuvo Anti-tamper" });
    expect(interpretSteamReply(1, 200, JSON.stringify({ "1": { success: true, data: {} } }))).toEqual({ status: "ok", notice: null });
  });
  it("success:false is a real 'unavailable' answer; rate limits and junk are failures", () => {
    expect(interpretSteamReply(1, 200, JSON.stringify({ "1": { success: false } }))).toEqual({ status: "unavailable" });
    expect(interpretSteamReply(1, 429, "")).toMatchObject({ status: "failed", reason: "http_429" });
    expect(interpretSteamReply(1, 200, "<html>")).toMatchObject({ status: "failed", reason: "parse_error" });
    expect(interpretSteamReply(1, 200, "null")).toMatchObject({ status: "failed", reason: "bad_shape" });
  });
  it("detects Denuvo case-insensitively", () => {
    expect(noticeListsDenuvo("Denuvo Anti-tamper<br>x")).toBe(true);
    expect(noticeListsDenuvo("Requires Uplay")).toBe(false);
    expect(noticeListsDenuvo("")).toBe(false);
  });
});
