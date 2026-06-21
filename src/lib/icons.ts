// Lucide icon paths (https://lucide.dev, MIT) — the small glyph set the
// clip-time-ux capture surface uses, inlined.
//
// CONTRACT COPY, NOT AN IMPORT. These paths are re-declared from the main repo's
// published icon source (`src/lib/icons.ts`) so the extension's iconography
// matches Myne's. The extension is keyless and does not import the desktop
// `src/` tree (SYNC-5) — the glyphs are copied here, not reached across repos.
//
// All glyphs are Lucide stroke icons on a 24×24 viewBox. They render in
// `currentColor` (no fill on the strokes) so a surface tints them by setting
// `color` on the container — e.g. the saved chip sets `color: var(--success)`,
// the locked prompt inherits the prompt ink. The 1.5px stroke + size are applied
// by the renderer (the `<svg>` element this path string is dropped into), per
// the desktop convention (`docs/design/ui_kits/desktop/primitives.jsx`).

/**
 * The inner `<path>`/`<circle>`/… markup for one Lucide glyph (a 24×24 viewBox).
 * Drop into an `<svg>` whose `stroke="currentColor"` `fill="none"`
 * `stroke-width="1.5"` so it renders in the surface's `currentColor`.
 */
export const ICON_PATHS = {
  // Toast / prompt leading glyphs --------------------------------------------
  // Clip-success saved chip (`--success`-tinted) and the locked/closed/unpaired
  // prompt's leading mark.
  "circle-check": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  "circle-alert":
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  // Manual-dismiss control for the injected toast / prompt (clip-time-ux task 4).
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',

  // Toolbar-icon state glyphs (the four `browser.action` states) -------------
  // idle = the resting capture mark (Lucide `scissors` — the clip gesture);
  // clipping = an in-flight progress ring (`loader-circle`, spun/static per
  // reduced-motion at render); saved = `circle-check` (above, reused);
  // locked = `lock`. Each state is distinguishable by SHAPE + glyph (never color
  // alone — PRODUCT.md accessibility); the controller (task 2) plus the artwork
  // (task 3) own the state→glyph mapping and the small-size legibility.
  scissors:
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  "loader-circle": '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
} as const;

/** The names of the inlined glyphs this feature ships. */
export type IconName = keyof typeof ICON_PATHS;
