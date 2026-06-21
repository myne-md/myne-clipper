// Unit tests for the pure outcome -> popup-state/view mapping (task 8).
//
// The mapping is the load-bearing HONESTY gate: it must turn the host's
// `accepted | error | locked` replies and the local `unreachable` outcome into
// DISTINCT, honest popup states, and it must never let a flaky/closed/error
// outcome render as a success. These are pure functions, so they are tested
// here without a live native-messaging host.
//
// SYNC-13 is the contract under test: a successful handoff confirms "handoff
// accepted" ("Saved to Myne" / "Sent to Myne"), NEVER "Encrypted" / a write
// claim — the desktop is the sole write authority.
import { describe, expect, it } from "vitest";

import type { ClipOutcome } from "../src/background/clip";
import {
  MYNE_LOCKED,
  OPEN_MYNE_TO_CLIP,
  SAVED_TO_MYNE,
  SENT_TO_MYNE,
  UNLOCK_MYNE,
  stateForOutcome,
  viewForOutcome,
} from "../src/popup/copy";

describe("stateForOutcome — the honest state machine", () => {
  it("maps an accepted reply to the `saved` success state", () => {
    const outcome: ClipOutcome = {
      status: "accepted",
      confirm: "ok",
      captureKind: "full-article",
    };
    expect(stateForOutcome(outcome)).toBe("saved");
  });

  it("maps a locked reply to the `locked` (Unlock Myne) state", () => {
    expect(stateForOutcome({ status: "locked" })).toBe("locked");
  });

  it("maps an unreachable outcome (closed desktop) to `closed`", () => {
    expect(stateForOutcome({ status: "unreachable" })).toBe("closed");
  });

  it("maps a host error reply to the `error` state (NOT closed)", () => {
    expect(stateForOutcome({ status: "error", reason: "boom" })).toBe("error");
  });

  it("keeps `error` and `unreachable` DISTINCT (flaky != closed)", () => {
    const closed = stateForOutcome({ status: "unreachable" });
    const flaky = stateForOutcome({ status: "error", reason: "malformed_reply" });
    expect(closed).toBe("closed");
    expect(flaky).toBe("error");
    expect(flaky).not.toBe(closed);
  });

  it("maps a rate-limit rejection to `error`, never to success", () => {
    const outcome: ClipOutcome = { status: "error", reason: "rate_limited" };
    expect(stateForOutcome(outcome)).toBe("error");
    expect(stateForOutcome(outcome)).not.toBe("saved");
  });

  it("NEVER maps a non-accepted outcome to `saved`", () => {
    const nonAccepted: ClipOutcome[] = [
      { status: "locked" },
      { status: "unreachable" },
      { status: "error", reason: "malformed_reply" },
      { status: "error", reason: "rate_limited" },
      { status: "error", reason: "note_body_oversized" },
      { status: "error", reason: "nothing_to_clip" },
    ];
    for (const outcome of nonAccepted) {
      expect(stateForOutcome(outcome)).not.toBe("saved");
    }
  });
});

describe("viewForOutcome — honest copy (SYNC-13: accepted != written)", () => {
  it("a page clip confirms 'Saved to Myne'", () => {
    const view = viewForOutcome({
      status: "accepted",
      confirm: "ok",
      captureKind: "full-article",
    });
    expect(view.title).toBe(SAVED_TO_MYNE);
    expect(view.action).toBeNull();
  });

  it("a selection clip also confirms 'Saved to Myne'", () => {
    const view = viewForOutcome({
      status: "accepted",
      confirm: "ok",
      captureKind: "selection",
    });
    expect(view.title).toBe(SAVED_TO_MYNE);
  });

  it("a bookmark confirms 'Sent to Myne'", () => {
    const view = viewForOutcome({
      status: "accepted",
      confirm: "ok",
      captureKind: "bookmark",
    });
    expect(view.title).toBe(SENT_TO_MYNE);
  });

  it("the locked view offers the 'Unlock Myne' affordance", () => {
    const view = viewForOutcome({ status: "locked" });
    expect(view.action).toBe(UNLOCK_MYNE);
  });

  it("the locked view title is the honest 'Myne is locked' status literal", () => {
    const view = viewForOutcome({ status: "locked" });
    expect(view.title).toBe(MYNE_LOCKED);
  });

  it("the closed view prompts 'Open Myne to clip'", () => {
    const view = viewForOutcome({ status: "unreachable" });
    expect(view.action).toBe(OPEN_MYNE_TO_CLIP);
  });

  it("a rate-limit error gets its own honest throttle copy", () => {
    const view = viewForOutcome({ status: "error", reason: "rate_limited" });
    expect(view.title).toBe("Slow down");
    expect(view.action).toBeNull();
  });

  it("a generic/malformed error surfaces an honest error, not success", () => {
    const view = viewForOutcome({ status: "error", reason: "malformed_reply" });
    expect(view.title).toBe("Couldn’t clip");
    expect(view.body).not.toMatch(SAVED_TO_MYNE);
    expect(view.body).not.toMatch(SENT_TO_MYNE);
  });

  it("NO state ever uses the word 'Encrypted' or claims a vault write", () => {
    const outcomes: ClipOutcome[] = [
      { status: "accepted", confirm: "ok", captureKind: "full-article" },
      { status: "accepted", confirm: "ok", captureKind: "bookmark" },
      { status: "locked" },
      { status: "unreachable" },
      { status: "error", reason: "rate_limited" },
      { status: "error", reason: "malformed_reply" },
    ];
    const forbidden = /encrypt|written to|wrote to|saved to (your )?vault/i;
    for (const outcome of outcomes) {
      const view = viewForOutcome(outcome);
      expect(`${view.title} ${view.body} ${view.action ?? ""}`).not.toMatch(
        forbidden,
      );
    }
  });
});

describe("centralized copy constants (single source of truth)", () => {
  it("none of the success/prompt constants say 'Encrypted'", () => {
    for (const copy of [
      SAVED_TO_MYNE,
      SENT_TO_MYNE,
      OPEN_MYNE_TO_CLIP,
      MYNE_LOCKED,
      UNLOCK_MYNE,
    ]) {
      expect(copy).not.toMatch(/encrypt/i);
    }
  });

  it("exposes the exact load-bearing literals the E2E asserts", () => {
    expect(SAVED_TO_MYNE).toBe("Saved to Myne");
    expect(SENT_TO_MYNE).toBe("Sent to Myne");
    expect(OPEN_MYNE_TO_CLIP).toBe("Open Myne to clip");
    // The locked SCREEN/status literal (em-dash, sentence case) and the locked
    // ACTION-BUTTON label are distinct constants from one source.
    expect(MYNE_LOCKED).toBe("Myne is locked — click to unlock");
    expect(UNLOCK_MYNE).toBe("Unlock Myne");
  });
});
