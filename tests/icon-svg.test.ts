// Task 3 — the four toolbar-icon state frames + the canonical SVG-wrap helper.
//
// These assertions pin two things together so the "artwork" and the runtime
// rasterizer can never drift:
//   1. `iconSvg` builds the documented `currentColor` stroke `<svg>` (the wrap
//      the `browser.action` adapter rasterizes and the exported frames embody);
//   2. each `src/icons/states/<state>.svg` frame is BYTE-EXACT the output of
//      `iconSvg(iconView(state).glyph)` — the "frames exported for the controller
//      to consume" acceptance criterion, verified rather than asserted by hand.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { iconSvg, STATE_INK } from "../src/lib/icon-svg";
import { ICON_PATHS } from "../src/lib/icons";
import { ICON_STATES, iconView, type IconState } from "../src/lib/icon-state";

function frame(state: IconState): string {
  const path = fileURLToPath(
    new URL(`../src/icons/states/${state}.svg`, import.meta.url),
  );
  return readFileSync(path, "utf8").trim();
}

describe("iconSvg — canonical glyph → SVG wrap", () => {
  it("builds a sized, currentColor, 1.5-stroke SVG by default", () => {
    const svg = iconSvg("scissors");
    expect(svg).toContain('width="24" height="24"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="1.5"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain(ICON_PATHS.scissors);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("honors size, color, and strokeWidth overrides", () => {
    const svg = iconSvg("lock", { size: 16, color: "#b54034", strokeWidth: 2 });
    expect(svg).toContain('width="16" height="16"');
    expect(svg).toContain('stroke="#b54034"');
    expect(svg).toContain('stroke-width="2"');
    // viewBox stays the source 24×24 regardless of render size.
    expect(svg).toContain('viewBox="0 0 24 24"');
  });
});

describe("exported toolbar-state frames", () => {
  it("each state has an exported frame byte-exact to iconSvg(glyph)", () => {
    for (const state of ICON_STATES) {
      const glyph = iconView(state).glyph;
      expect(frame(state)).toBe(iconSvg(glyph));
    }
  });

  it("maps the four states to the resting/in-flight/check/lock language", () => {
    expect(iconView("idle").glyph).toBe("scissors");
    expect(iconView("clipping").glyph).toBe("loader-circle");
    expect(iconView("saved").glyph).toBe("circle-check");
    expect(iconView("locked").glyph).toBe("lock");
  });

  it("renders four shape-distinct glyphs (grayscale-distinguishable)", () => {
    const paths = ICON_STATES.map((s) => ICON_PATHS[iconView(s).glyph]);
    expect(new Set(paths).size).toBe(ICON_STATES.length);
  });
});

describe("STATE_INK — redundant, never-sole color cue", () => {
  it("defines an ink per state", () => {
    for (const state of ICON_STATES) {
      expect(STATE_INK[state]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("uses neutral ink for idle/clipping and distinct success/alert for saved/locked", () => {
    expect(STATE_INK.idle).toBe(STATE_INK.clipping); // both resting-neutral
    expect(STATE_INK.saved).not.toBe(STATE_INK.idle); // success green
    expect(STATE_INK.locked).not.toBe(STATE_INK.idle); // alert red
    expect(STATE_INK.saved).not.toBe(STATE_INK.locked); // and distinct from each other
  });
});
