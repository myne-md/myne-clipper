// Unit tests for the PURE toolbar-icon four-state machine (clip-time-ux task 2).
//
// The state machine is the load-bearing accessibility + honesty logic of the
// toolbar action: it maps the four logical capture states (idle / clipping /
// saved / locked) to a DISTINCT glyph + DISTINCT title/badge, and it permits
// ONLY the legal transitions. It is a pure function table — no `browser.*`, no
// timers — so it is tested here without the WebExtensions API.
//
// PRODUCT.md accessibility contract under test: every state is distinguishable
// by SHAPE/glyph PLUS text, NEVER by color alone (story 18). Story 21: a failed
// clip resets `clipping → idle` so the icon never sticks "in flight".
import { describe, expect, it } from "vitest";

import type { IconName } from "../src/lib/icons";
import { ICON_PATHS } from "../src/lib/icons";
import {
  ICON_STATES,
  type IconState,
  iconView,
  isLegalTransition,
  nextState,
} from "../src/lib/icon-state";

const ALL_STATES: readonly IconState[] = ICON_STATES;

describe("icon-state — the four states", () => {
  it("declares exactly idle / clipping / saved / locked", () => {
    expect([...ALL_STATES].sort()).toEqual(
      ["clipping", "idle", "locked", "saved"].sort(),
    );
  });
});

describe("iconView — state -> (glyph, title, badge)", () => {
  it("maps each state to an inlined task-1 glyph name", () => {
    const expected: Record<IconState, IconName> = {
      idle: "scissors",
      clipping: "loader-circle",
      saved: "circle-check",
      locked: "lock",
    };
    for (const state of ALL_STATES) {
      const view = iconView(state);
      expect(view.glyph).toBe(expected[state]);
      // The glyph name resolves to a real inlined path (task-1 contract).
      expect(ICON_PATHS[view.glyph]).toBeTypeOf("string");
    }
  });

  it("gives every state a DISTINCT glyph (no two states share a glyph)", () => {
    const glyphs = ALL_STATES.map((s) => iconView(s).glyph);
    expect(new Set(glyphs).size).toBe(ALL_STATES.length);
  });

  it("gives every state a DISTINCT, non-empty title", () => {
    const titles = ALL_STATES.map((s) => iconView(s).title);
    for (const title of titles) expect(title.length).toBeGreaterThan(0);
    expect(new Set(titles).size).toBe(ALL_STATES.length);
  });

  it("gives every state a DISTINCT badge (the passive text read)", () => {
    const badges = ALL_STATES.map((s) => iconView(s).badge);
    // The badges are short passive-read text labels; each state's is distinct so
    // the platform badge alone (no color) tells idle from clipping/saved/locked.
    expect(new Set(badges).size).toBe(ALL_STATES.length);
  });

  it("never distinguishes two states by COLOR ALONE — glyph+text carry it", () => {
    // For every pair of states, they must differ by glyph OR by title/badge text
    // (shape + text), not be separable only by a color attribute.
    for (const a of ALL_STATES) {
      for (const b of ALL_STATES) {
        if (a === b) continue;
        const va = iconView(a);
        const vb = iconView(b);
        const differsByGlyph = va.glyph !== vb.glyph;
        const differsByText = va.title !== vb.title || va.badge !== vb.badge;
        expect(differsByGlyph && differsByText).toBe(true);
      }
    }
  });

  it("the locked title is the load-bearing MYNE_LOCKED literal", async () => {
    const { MYNE_LOCKED } = await import("../src/lib/load-bearing-copy");
    expect(iconView("locked").title).toBe(MYNE_LOCKED);
  });

  it("no title contains an emoji or claims an encrypted write (SYNC-13)", () => {
    const emoji = /\p{Extended_Pictographic}/u;
    const forbidden = /encrypt|written to|wrote to|saved to (your )?vault/i;
    for (const state of ALL_STATES) {
      const { title, badge } = iconView(state);
      expect(title).not.toMatch(emoji);
      expect(title).not.toMatch(forbidden);
      expect(badge).not.toMatch(emoji);
    }
  });
});

describe("isLegalTransition — the transition table", () => {
  const LEGAL: ReadonlyArray<readonly [IconState, IconState]> = [
    ["idle", "clipping"],
    ["clipping", "saved"],
    ["saved", "idle"],
    ["clipping", "idle"], // failure reset (story 21)
    // `* -> locked` from any state (the vault-not-ready branch).
    ["idle", "locked"],
    ["clipping", "locked"],
    ["saved", "locked"],
    ["locked", "locked"],
    // recovery: a locked vault that becomes ready returns to idle.
    ["locked", "idle"],
  ];

  it("accepts every legal transition", () => {
    for (const [from, to] of LEGAL) {
      expect(isLegalTransition(from, to)).toBe(true);
    }
  });

  it("permits `idle -> clipping -> saved -> idle` (the success path)", () => {
    expect(isLegalTransition("idle", "clipping")).toBe(true);
    expect(isLegalTransition("clipping", "saved")).toBe(true);
    expect(isLegalTransition("saved", "idle")).toBe(true);
  });

  it("permits the `clipping -> idle` failure reset (story 21)", () => {
    expect(isLegalTransition("clipping", "idle")).toBe(true);
  });

  it("permits `* -> locked` from any state", () => {
    for (const from of ALL_STATES) {
      expect(isLegalTransition(from, "locked")).toBe(true);
    }
  });

  it("rejects skipping clipping (idle -> saved is illegal)", () => {
    expect(isLegalTransition("idle", "saved")).toBe(false);
  });

  it("rejects going backwards into clipping from saved", () => {
    expect(isLegalTransition("saved", "clipping")).toBe(false);
  });

  it("rejects idle -> idle (a no-op is not a transition)", () => {
    expect(isLegalTransition("idle", "idle")).toBe(false);
  });
});

describe("nextState — applies legal transitions, no-ops illegal ones", () => {
  it("returns the target for a legal transition", () => {
    expect(nextState("idle", "clipping")).toBe("clipping");
    expect(nextState("clipping", "saved")).toBe("saved");
    expect(nextState("saved", "idle")).toBe("idle");
    expect(nextState("clipping", "idle")).toBe("idle");
    expect(nextState("idle", "locked")).toBe("locked");
  });

  it("NO-OPS an illegal transition (returns the current state unchanged)", () => {
    expect(nextState("idle", "saved")).toBe("idle");
    expect(nextState("saved", "clipping")).toBe("saved");
    expect(nextState("idle", "idle")).toBe("idle");
  });
});
