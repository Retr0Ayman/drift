import { describe, expect, it } from "vitest";
import { EMPTY_HEALTH, nextHealth } from "./sourceHealth";

describe("nextHealth", () => {
  it("counts consecutive failures and remembers when the run began", () => {
    const a = nextHealth(EMPTY_HEALTH, false, 100, { status: 200, error: "api_permissiondenied" });
    const b = nextHealth(a, false, 200, { status: 403, error: "http_403" });
    expect(b).toMatchObject({ consecutiveFailures: 2, failingSince: 100, lastStatus: 403, lastError: "http_403", lastSuccessAt: null });
  });
  it("a success clears the run but keeps the success time", () => {
    const failed = nextHealth(EMPTY_HEALTH, false, 100, { status: 500 });
    const ok = nextHealth(failed, true, 300);
    expect(ok).toMatchObject({ consecutiveFailures: 0, failingSince: null, lastSuccessAt: 300, lastError: null });
  });
});
