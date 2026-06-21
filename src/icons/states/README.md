# Toolbar-icon state frames (clip-time-ux task 3)

The four `browser.action` toolbar-icon glyphs, one per logical capture state. These
are the **exported frames** the icon-state controller (task 2) consumes: each file
is the byte-exact output of `src/lib/icon-svg.ts`'s `iconSvg(glyph)` for that
state's glyph, pinned by `tests/icon-svg.test.ts` so artwork and runtime can never
drift. (Built directly as code rather than designed in Penpot — refine later.)

| State | File | Glyph (Lucide) | Language | Badge | Title |
|-------|------|----------------|----------|-------|-------|
| idle | `idle.svg` | `scissors` | the resting clip gesture | — | "Clip this page to Myne" |
| clipping | `clipping.svg` | `loader-circle` | in-flight progress ring | `…` | "Clipping to Myne…" |
| saved | `saved.svg` | `circle-check` | success (held ~1.5s) | `✓` | "Saved to Myne" |
| locked | `locked.svg` | `lock` | vault not ready | `!` | "Myne is locked — click to unlock" |

## Never color alone

Each state is told apart by **glyph shape + badge text + hover title** — three
non-color channels. In grayscale the four marks are unmistakable: an open
scissors, a near-closed ring, a checked circle, and a padlock. The redundant
per-state **ink** (`STATE_INK` in `icon-svg.ts`) — neutral idle/clipping,
`--success` green saved, alert red locked — is layered on top as a fourth,
redundant cue, never the sole differentiator (PRODUCT.md accessibility).

## currentColor + stroke contract

Every frame is a 24×24 Lucide **stroke** glyph, `fill="none"`,
`stroke="currentColor"`, `stroke-width="1.5"`, round caps/joins — the desktop
`docs/design/ui_kits/desktop/primitives.jsx` convention. They tint by context;
the rasterizer resolves `currentColor` to `STATE_INK[state]` per state.

## Reduced motion

The clipping glyph is a **static** progress ring. A toolbar action icon is a
rasterized bitmap and cannot animate, so there is no motion to reduce — the `…`
badge + "Clipping to Myne…" title carry the in-flight read instead. The only
animated capture affordance is the in-page **toast** (tasks 4/6), which collapses
its slide/crossfade under `prefers-reduced-motion` via `src/lib/tokens.css`.
