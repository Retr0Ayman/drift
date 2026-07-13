/* Config list of starred groups (slugified) -- star badge, sorted to top of
   the Groups grid, distinct card treatment. Start with voices38 and
   DenuvOwO per the P2P-groups fix (see worker/routes/xrel/group.ts): these
   two never show up via the main Windows browse feed at all, only through
   the targeted per-group lookup, so they're the groups most worth pinning. */
export const STARRED_GROUPS = ["voices38", "denuvowo"];

const GROUP_METHOD: Record<string, "hv" | "trad"> = {
  denuvowo: "hv",
  "0xzeon": "hv",
  "0xze0n": "hv",
  voices38: "trad",
  rune: "trad",
  empress: "trad",
  cpy: "trad",
  codex: "trad",
  flt: "trad",
  tenoke: "trad",
  skidrow: "trad",
};

export const methodForGroup = (g: string): "hv" | "trad" =>
  GROUP_METHOD[(g || "").toLowerCase().replace(/[^a-z0-9]/g, "")] || "trad";
