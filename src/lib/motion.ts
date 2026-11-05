/* Shared Framer Motion presets -- the JS counterpart to --ease/--dur-* in
   tokens.css. Short, springy, purposeful: motion explains a state change, it
   never loops just to look alive. */
export const EASE = [0.16, 1, 0.3, 1] as const;

export const DUR = { micro: 0.15, ui: 0.25, reveal: 0.5 } as const;

/* UI-sized things (menus, palettes, pills). */
export const SPRING_UI = { type: "spring", stiffness: 380, damping: 32 } as const;
/* Large elements (sections, panels): softer, slower to settle. */
export const SPRING_SOFT = { type: "spring", stiffness: 170, damping: 26 } as const;

/* Scroll reveal: fade + rise once as it enters the viewport. */
export const REVEAL_Y = 20;
export const REVEAL_VIEWPORT = { once: true, margin: "-10%" } as const;
export const REVEAL_TRANSITION = { duration: DUR.reveal, ease: EASE } as const;

/* Per-item stagger across a grid, capped so long lists don't crawl. */
export const STAGGER_STEP = 0.04;
export const stagger = (i: number, cap = 8) => Math.min(i, cap) * STAGGER_STEP;
