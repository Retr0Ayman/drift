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

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Confirmed live (Watch Dogs 2): its real extracted swatch (#c79340, a
// saturated warm tan/orange, HSL lightness ~0.52) passed MIN_SATURATION
// easily but rendered as a genuinely low-legibility ambient wash --
// mid-lightness saturated colors are the worst case for text/pill overlay
// contrast (too light to read as a "dark backdrop," too saturated/mid-tone
// to read clean against either light or dark foreground text), and this
// app's UI text (--drm amber tags especially) leans into the same warm
// part of the wheel, compounding it. Rather than reject these candidates
// outright (losing real per-game color identity for a lot of genuinely
// fine covers that just happen to extract a mid-lightness swatch), dampen
// -- clamp lightness down to a safe ceiling while preserving hue/
// saturation, so the wash stays recognizably that game's color but
// reliably reads as a dark backdrop, the one thing this site's light-text-
// on-ambient-wash convention (--canvas-ink, tokens.css) actually needs.
// A swatch already darker than the ceiling is untouched.
const MAX_WASH_LIGHTNESS = 0.4;

function dampenForLegibility(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  if (l <= MAX_WASH_LIGHTNESS) return hex;
  return hslToHex(h, s, MAX_WASH_LIGHTNESS);
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
      if (s >= MIN_SATURATION) candidates.push(dampenForLegibility(swatch.hex));
    }

    if (!candidates.length) return { primary: FALLBACK_PRIMARY, secondary: FALLBACK_SECONDARY, extracted: false };
    return { primary: candidates[0], secondary: candidates[1] || candidates[0], extracted: true };
  } catch {
    return { primary: FALLBACK_PRIMARY, secondary: FALLBACK_SECONDARY, extracted: false };
  }
}
