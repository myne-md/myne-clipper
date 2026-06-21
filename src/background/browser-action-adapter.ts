// The REAL `browser.action` adapter for the toolbar-icon controller
// (clip-time-ux sub-feature 4, task 2).
//
// This is the ONLY module that touches `browser.action.*`. It is split out from
// the controller (`./icon-controller`) on purpose: the controller stays a PURE,
// injectable-adapter unit (no `webextension-polyfill` import, so it loads under
// Node/Vitest), while this file — the impure platform seam — is imported only by
// the background wiring that actually runs inside the extension.
//
// It rasterizes the inlined glyph (a 24x24 `currentColor` Lucide stroke path)
// into the toolbar-action icon via OffscreenCanvas (available in the MV3 service
// worker / Firefox event page), then pushes the title + badge text. The title +
// badge are the COLOR-FREE text channel and are set unconditionally; the
// rasterized glyph is best-effort.
//
// TASK 3 (the four-state artwork, built directly as code): the glyph SHAPE per
// state is the resting `scissors` (idle) / progress-ring `loader-circle`
// (clipping) / `circle-check` (saved) / `lock` (locked) language, and a REDUNDANT
// per-state INK (`STATE_INK`) tints the rasterized mark — neutral while idle/
// in-flight, `--success` green on a landed clip, alert red when locked. Color is
// never the sole cue (the badge "…"/"✓"/"!" + the title text carry the state
// too). The glyph + wrap come from the shared `../lib/icon-svg` helper, the SAME
// source the exported `../icons/states/*.svg` frames are pinned to. The clipping
// glyph is a STATIC ring — a toolbar action icon cannot animate, so there is no
// motion to honor `prefers-reduced-motion` against (the animated affordance lives
// in the in-page toast, which honors reduced-motion via `tokens.css`).
import browser from "webextension-polyfill";

import { iconSvg, STATE_INK } from "../lib/icon-svg";
import type { IconView } from "../lib/icon-state";

import type { IconAdapter } from "./icon-controller";

/** Icon sizes the toolbar action wants (1x + 2x density). */
const ICON_SIZES = [16, 32] as const;

/**
 * The default adapter. Wraps `browser.action.setIcon` / `setBadgeText` /
 * `setTitle`. Icon rasterization is best-effort: if `OffscreenCanvas` /
 * `createImageBitmap` is unavailable, the title + badge (the color-free text
 * reads) still update, so the state stays legible even without the redrawn glyph.
 */
export function createBrowserActionAdapter(): IconAdapter {
  return {
    render(view: IconView): void {
      // Title + badge are the text channel — always set them (never color alone).
      void browser.action.setTitle({ title: view.title });
      void browser.action.setBadgeText({ text: view.badge });
      // At REST the toolbar shows the Myne BRAND MARK (the desktop's identity),
      // not a line glyph — brand-consistent with the desktop app icon. The
      // transient ACTIVITY states (clipping / saved / locked) keep their distinct
      // functional glyphs (+ badge + title), so no state is told apart by color
      // alone (PRODUCT.md). The mark PNGs are the same static `icons/` artwork.
      if (view.state === "idle") {
        void browser.action.setIcon({
          path: {
            16: "icons/icon-16.png",
            32: "icons/icon-32.png",
            48: "icons/icon-48.png",
            128: "icons/icon-128.png",
          },
        });
      } else {
        void rasterizeIcon(view);
      }
    },
  };
}

/** Rasterize the glyph to ImageData per size and push it to the action icon. */
async function rasterizeIcon(view: IconView): Promise<void> {
  // OffscreenCanvas + createImageBitmap are the SW-safe rasterization path.
  if (
    typeof OffscreenCanvas === "undefined" ||
    typeof createImageBitmap === "undefined"
  ) {
    return;
  }
  // The REDUNDANT per-state ink (task 3): neutral idle/clipping, `--success` on
  // saved, alert on locked. Never the sole cue — the badge + title text and the
  // distinct glyph shape carry the state too (PRODUCT.md never-color-alone).
  const ink = STATE_INK[view.state];
  const imageData: Record<number, ImageData> = {};
  for (const size of ICON_SIZES) {
    const svg = iconSvg(view.glyph, { size, color: ink });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      return; // can't rasterize — title/badge already carry the state
    }
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(bitmap, 0, 0, size, size);
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  try {
    await browser.action.setIcon({ imageData });
  } catch {
    // Setting the icon is best-effort; the text reads already reflect the state.
  }
}
