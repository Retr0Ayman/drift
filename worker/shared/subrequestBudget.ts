import { AsyncLocalStorage } from "node:async_hooks";

/* Workers Free allows 50 subrequests per invocation (Cloudflare docs, "Limits
   > Subrequests": a subrequest is any Fetch API request or request to R2/KV/
   D1; each hop in a redirect chain counts; internal-service calls have their
   own 1,000 cap on Free). Cron slots run several unrelated tasks in ONE
   invocation, so a task that merely "usually" stays small can starve its
   neighbours. This makes the cap explicit and deterministic: a task runs
   inside withSubrequestBudget(n, ...) and every outbound attempt -- retries
   included -- calls spendSubrequest() first; past n it throws
   SubrequestBudgetExceeded instead of letting Cloudflare fail some other
   task's fetch. AsyncLocalStorage keeps concurrent tasks in one isolate from
   sharing a counter. With no budget active (ordinary HTTP requests) nothing
   is counted. */

interface Budget {
  limit: number;
  used: number;
}

const store = new AsyncLocalStorage<Budget>();

export class SubrequestBudgetExceeded extends Error {
  constructor() {
    super("subrequest budget exhausted");
    this.name = "SubrequestBudgetExceeded";
  }
}

export function withSubrequestBudget<T>(limit: number, fn: () => Promise<T>): Promise<T> {
  return store.run({ limit, used: 0 }, fn);
}

/* Call immediately before each outbound attempt. */
export function spendSubrequest(n = 1): void {
  const b = store.getStore();
  if (!b) return;
  if (b.used + n > b.limit) throw new SubrequestBudgetExceeded();
  b.used += n;
}

/* Remaining attempts in the active budget, or null when unbudgeted. */
export function remainingSubrequests(): number | null {
  const b = store.getStore();
  return b ? b.limit - b.used : null;
}

export const isBudgetExceeded = (e: unknown): boolean => e instanceof SubrequestBudgetExceeded || (e instanceof Error && e.name === "SubrequestBudgetExceeded");
