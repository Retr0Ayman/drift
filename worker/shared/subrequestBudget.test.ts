import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchWithRetry } from "./fetchRetry";
import { isBudgetExceeded, remainingSubrequests, spendSubrequest, withSubrequestBudget } from "./subrequestBudget";

afterEach(() => vi.unstubAllGlobals());

describe("subrequest budget", () => {
  it("does nothing when no budget is active", () => {
    expect(() => spendSubrequest(1000)).not.toThrow();
    expect(remainingSubrequests()).toBeNull();
  });

  it("throws on the attempt that would exceed the limit", async () => {
    await withSubrequestBudget(3, async () => {
      spendSubrequest();
      spendSubrequest();
      expect(remainingSubrequests()).toBe(1);
      spendSubrequest();
      expect(() => spendSubrequest()).toThrow();
    });
  });

  it("keeps concurrent tasks' budgets separate", async () => {
    const a = withSubrequestBudget(1, async () => {
      await new Promise((r) => setTimeout(r, 5));
      spendSubrequest();
      return remainingSubrequests();
    });
    const b = withSubrequestBudget(5, async () => {
      spendSubrequest(2);
      await new Promise((r) => setTimeout(r, 1));
      return remainingSubrequests();
    });
    expect(await Promise.all([a, b])).toEqual([0, 3]);
  });

  it("fetchWithRetry spends one per attempt, retries included, and stops at the budget", async () => {
    const fetchMock = vi.fn(async () => new Response("x", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await withSubrequestBudget(2, async () => {
      // 3 attempts would be made on a 503; the 3rd must be refused by the budget.
      await expect(fetchWithRetry("https://example.test/")).rejects.toSatisfy(isBudgetExceeded);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a successful call costs exactly one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
    await withSubrequestBudget(5, async () => {
      await fetchWithRetry("https://example.test/");
      expect(remainingSubrequests()).toBe(4);
    });
  });
});
