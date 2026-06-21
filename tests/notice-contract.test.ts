// Task 13 — the E2E OBSERVABILITY CONTRACT (the harness-independent slice).
//
// The full clip-time-ux E2E (the cross-process extension↔native-host round-trip
// driven by tauri-driver) is GATED on sub-feature 1's harness (foundation task
// 10), which does not exist in this repo yet. What we CAN pin now — and must, so
// it cannot drift before the harness lands — is the contract that future E2E
// asserts: the exact `data-testid` SELECTORS the scenarios query, and the three
// load-bearing copy literals they match by FULL-LITERAL equality.
//
// The behaviors themselves (icon sequence, single-toast replace, reduced-motion,
// "no Saved on failure", locked prompt) are already covered by the task 6/7/8/11
// controller + handler unit tests; this file locks the surface CONTRACT those
// scenarios depend on. See `e2e/clip-time-ux.scenarios.md` for the authored
// scenarios the harness will run.
import { describe, expect, it } from "vitest";

import {
  MYNE_LOCKED,
  SAVED_TO_MYNE,
  SENT_TO_MYNE,
} from "../src/lib/load-bearing-copy";
import { buildErrorToastModel } from "../src/lib/toast-model";
import {
  TOAST_DISMISS_TESTID,
  TOAST_TESTID,
  TOAST_VIEW_TESTID,
} from "../src/lib/toast-model";
import {
  PROMPT_ACTION_TESTID,
  PROMPT_DISMISS_TESTID,
  PROMPT_TESTID,
} from "../src/lib/prompt-model";

describe("E2E data-testid selectors (the harness query contract)", () => {
  it("toast surface exposes its stable selectors", () => {
    expect(TOAST_TESTID).toBe("clip-toast");
    expect(TOAST_VIEW_TESTID).toBe("clip-toast.view");
    expect(TOAST_DISMISS_TESTID).toBe("clip-toast.dismiss");
  });

  it("prompt surface exposes its stable selectors", () => {
    expect(PROMPT_TESTID).toBe("clip-prompt");
    expect(PROMPT_ACTION_TESTID).toBe("clip-prompt.action");
    expect(PROMPT_DISMISS_TESTID).toBe("clip-prompt.dismiss");
  });

  it("selectors follow the <screen>.<element> convention", () => {
    for (const id of [
      TOAST_VIEW_TESTID,
      TOAST_DISMISS_TESTID,
      PROMPT_ACTION_TESTID,
      PROMPT_DISMISS_TESTID,
    ]) {
      expect(id).toMatch(/^clip-(toast|prompt)\.[a-z]+$/);
    }
  });
});

describe("E2E load-bearing copy (full-literal equality the harness asserts)", () => {
  it("pins the three capture literals verbatim", () => {
    expect(SAVED_TO_MYNE).toBe("Saved to Myne");
    expect(SENT_TO_MYNE).toBe("Sent to Myne");
    expect(MYNE_LOCKED).toBe("Myne is locked — click to unlock");
  });

  it("none of the capture literals ever claim encryption / a write (SYNC-13)", () => {
    for (const s of [SAVED_TO_MYNE, SENT_TO_MYNE, MYNE_LOCKED]) {
      expect(s).not.toMatch(/encrypted|written|saved to vault/i);
    }
  });

  it("the error toast never renders a success literal (story 20)", () => {
    const error = buildErrorToastModel("rate_limited").message;
    expect(error).not.toBe(SAVED_TO_MYNE);
    expect(error).not.toBe(SENT_TO_MYNE);
  });
});
