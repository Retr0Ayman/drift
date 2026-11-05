import { describe, expect, it } from "vitest";
import { USER_AGENT, withUserAgent } from "./userAgent";

describe("withUserAgent", () => {
  it("adds a descriptive UA with the repo URL, never a personal address", () => {
    const h = new Headers(withUserAgent().headers);
    expect(h.get("User-Agent")).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^orlaz\/\d/);
    expect(USER_AGENT).toContain("github.com/Retr0Ayman/drift");
    expect(USER_AGENT).not.toContain("@");
  });
  it("keeps other headers and body, and never overrides an explicit UA", () => {
    const init = withUserAgent({ method: "POST", headers: { "Content-Type": "x", "User-Agent": "custom" }, body: "b" });
    const h = new Headers(init.headers);
    expect(h.get("User-Agent")).toBe("custom");
    expect(h.get("Content-Type")).toBe("x");
    expect(init.method).toBe("POST");
  });
});
