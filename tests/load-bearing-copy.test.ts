// Byte-exact assertions for the load-bearing capture copy (clip-time-ux task 1).
//
// These literals are asserted by FULL-LITERAL equality by the clip-time-ux E2E
// (task 13). This module is the single source of truth — the popup re-exports
// them, and every later clip-time-ux surface imports them rather than inlining a
// copy. The honesty contract (SYNC-13): the success strings acknowledge a
// HANDOFF, never claim an encrypted vault write, so the word "Encrypted" must
// never appear.
import { describe, expect, it } from "vitest";

import {
  MYNE_LOCKED,
  OPEN_MYNE_TO_CLIP,
  SAVED_TO_MYNE,
  SENT_TO_MYNE,
  UNLOCK_MYNE,
} from "../src/lib/load-bearing-copy";

describe("load-bearing capture copy — exact literals", () => {
  it("the three pinned capture literals are byte-exact", () => {
    expect(SAVED_TO_MYNE).toBe("Saved to Myne");
    expect(SENT_TO_MYNE).toBe("Sent to Myne");
    // The locked status literal uses an EM-DASH (U+2014), not a hyphen-minus.
    expect(MYNE_LOCKED).toBe("Myne is locked — click to unlock");
  });

  it("the locked status literal carries an em-dash, not a hyphen", () => {
    expect(MYNE_LOCKED).toContain("—"); // — em-dash
    expect(MYNE_LOCKED).not.toContain(" - "); // not a spaced hyphen-minus
  });

  it("the locked status and the unlock button are DISTINCT constants", () => {
    expect(MYNE_LOCKED).not.toBe(UNLOCK_MYNE);
    expect(UNLOCK_MYNE).toBe("Unlock Myne");
    expect(OPEN_MYNE_TO_CLIP).toBe("Open Myne to clip");
  });

  it("no literal ever says 'Encrypted' or claims a vault write (SYNC-13)", () => {
    const forbidden = /encrypt|written to|wrote to|saved to (your )?vault/i;
    for (const copy of [
      SAVED_TO_MYNE,
      SENT_TO_MYNE,
      MYNE_LOCKED,
      UNLOCK_MYNE,
      OPEN_MYNE_TO_CLIP,
    ]) {
      expect(copy).not.toMatch(forbidden);
    }
  });

  it("no literal contains an emoji (text + iconography only)", () => {
    // Any Extended_Pictographic code point would be an emoji; the surface is
    // text + Lucide stroke glyphs only (PRODUCT.md / docs/design/README.md).
    const emoji = /\p{Extended_Pictographic}/u;
    for (const copy of [
      SAVED_TO_MYNE,
      SENT_TO_MYNE,
      MYNE_LOCKED,
      UNLOCK_MYNE,
      OPEN_MYNE_TO_CLIP,
    ]) {
      expect(copy).not.toMatch(emoji);
    }
  });

  it("the capture literals are sentence case (one leading capital)", () => {
    // Sentence case: first char upper, no interior Title Case run like
    // "Saved To Myne". "Myne" is a proper noun so an interior capital is fine;
    // assert there's no ALL-Title-Case shape on the multi-word phrases.
    expect(SAVED_TO_MYNE).toBe("Saved to Myne");
    expect(SENT_TO_MYNE).toBe("Sent to Myne");
    expect(MYNE_LOCKED.startsWith("Myne is locked")).toBe(true);
  });
});
