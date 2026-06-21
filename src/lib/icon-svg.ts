// The canonical glyph → standalone-SVG wrap (clip-time-ux sub-feature 4, task 3).
//
// ONE source for "a Lucide path string becomes a full, sized, `currentColor`
// stroke `<svg>`". Both consumers share it so they cannot drift:
//   1. the `browser.action` adapter (`../background/browser-action-adapter`)
//      rasterizes this string into the toolbar icon per state;
//   2. the four exported toolbar-state frames (`../icons/states/*.svg`) are the
//      EXACT output of this helper, pinned by `tests/icon-svg.test.ts` — the
//      "frames exported for the controller to consume" artefact (task 3).
//
// PURE: no `browser.*`, no DOM — it builds a string, so it is node/Vitest-loadable
// and the exported frames can be byte-asserted against it.
import { ICON_PATHS, type IconName } from "./icons";
import type { IconState } from "./icon-state";

export interface IconSvgOptions {
  /** Width/height in px (square). Default 24 — the source viewBox size. */
  readonly size?: number;
  /** What `currentColor` resolves to. Default `"currentColor"` (tint by context). */
  readonly color?: string;
  /** Stroke width. Default 1.5 — the desktop primitive convention. */
  readonly strokeWidth?: number;
}

/**
 * Wrap one inlined glyph (`ICON_PATHS[glyph]`) into a complete `<svg>` document
 * string: square `size`, the 24×24 source viewBox, no fill, `currentColor`
 * (or an explicit `color`) stroke at `strokeWidth`, round caps/joins.
 *
 * The attribute order is FIXED so the exported state frames are byte-stable and
 * the pinning test can assert equality.
 */
export function iconSvg(glyph: IconName, options: IconSvgOptions = {}): string {
  const size = options.size ?? 24;
  const color = options.color ?? "currentColor";
  const strokeWidth = options.strokeWidth ?? 1.5;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[glyph]}</svg>`
  );
}

// Per-state INK — a REDUNDANT color cue, NEVER the sole differentiator. The real
// signal carriers are the distinct glyph SHAPE (scissors / progress-ring /
// check / lock) and the distinct badge + title TEXT (task 2). Color is layered
// on top per PRODUCT.md's "redundant cue, never color alone": neutral ink for the
// resting + in-flight states, the `--success` green when a clip lands, and an
// alert red when the vault is locked. Values mirror the token contract
// (`./tokens.css` `--success`) where one exists; idle/clipping keep the existing
// neutral toolbar ink.
export const STATE_INK: Record<IconState, string> = {
  idle: "#1f2933", // neutral toolbar ink (resting)
  clipping: "#1f2933", // neutral toolbar ink (in-flight; the "…" badge carries the motion read)
  saved: "#2f6048", // --success (light) — the saved-chip green
  locked: "#b54034", // alert red — distinct from success; lock glyph + "!" badge are the real reads
} as const;
