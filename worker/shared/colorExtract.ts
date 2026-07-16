import { Vibrant } from "node-vibrant/node";

/* Confirmed live in the real Workers runtime (workerd via wrangler dev, not
   just Node): node-vibrant/node uses Jimp under the hood for image
   decoding, which is pure JS -- no native canvas/sharp bindings, which
   would NOT run in a V8 isolate. Requires nodejs_compat (wrangler.jsonc)
   for the Buffer polyfill this needs. */

// HSL saturation, 0-1. Mandatory gate before accepting any extracted
// swatch -- confirmed via real cover testing (WWE 2K25, EA Sports College
// Football 27, both logo/team-color-heavy) that most real covers extract
// fine through Vibrant's own categorization, but a swatch can still come
// back with near-zero population or a genuinely low-saturation "color"
// (a grey, a near-black, a near-white) that would render as a muddy,
// broken-looking ambient wash rather than no wash at all.
const MIN_SATURATION = 0.18;

// Same reasoning as the rest of this project's "never fabricate/guess"
// rule applied to color instead of data: when nothing extracted clears the
// bar, fall back to a fixed, deliberately-chosen neutral rather than
// showing whatever muddy value Vibrant happened to return. Reuses --hv
// (tokens.css) directly -- it's already a muted, desaturated purple, not a
// new color invented for this purpose -- plus a darker shade of the same
// hue for the secondary, so the two-fallback-color gradient still looks
// like a deliberate pair, not a mismatch.
export const FALLBACK_PRIMARY = "#6b4fa0";
export const FALLBACK_SECONDARY = "#4a3570";

export interface AccentColors {
  primary: string;
  secondary: string;
  /* True when both colors are real extracted swatches; false when the
     saturation gate rejected every candidate and this is the fixed
     fallback pair. Stored alongside the colors so a caller (or a future
     re-run) can tell "this game genuinely has muted cover art" apart from
     "extraction never ran yet." */
  extracted: boolean;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return { h: h * 60, s, l };
}

// Priority order for "which swatch to try first" -- Vibrant and its
// Light/Dark variants keep the most real saturation; the Muted variants
// are only reached as fallbacks within a genuinely extracted palette,
// before ever falling back to the fixed neutral pair above.
const SWATCH_PRIORITY = ["Vibrant", "LightVibrant", "DarkVibrant", "Muted", "DarkMuted", "LightMuted"] as const;

/* Extract 2 accent colors from a cover image URL -- server-side, meant to
   run once per game at enrichment time (backfill + steady-state sync),
   never per pageview. Returns the fixed fallback pair (extracted: false)
   rather than throwing when the image can't be fetched/decoded or nothing
   clears the saturation bar -- a missing/muddy accent should never break
   the enrichment it's attached to. */
export async function extractAccentColors(imageUrl: string): Promise<AccentColors> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return { primary: FALLBACK_PRIMARY, secondary: FALLBACK_SECONDARY, extracted: false };
    const buf = await res.arrayBuffer();
    const palette = await Vibrant.from(Buffer.from(buf)).getPalette();

    const candidates: string[] = [];
    for (const name of SWATCH_PRIORITY) {
      const swatch = palette[name];
      if (!swatch || !swatch.population) continue;
      const { s } = hexToHsl(swatch.hex);
      if (s >= MIN_SATURATION) candidates.push(swatch.hex);
    }

    if (!candidates.length) return { primary: FALLBACK_PRIMARY, secondary: FALLBACK_SECONDARY, extracted: false };
    return { primary: candidates[0], secondary: candidates[1] || candidates[0], extracted: true };
  } catch {
    return { primary: FALLBACK_PRIMARY, secondary: FALLBACK_SECONDARY, extracted: false };
  }
}
