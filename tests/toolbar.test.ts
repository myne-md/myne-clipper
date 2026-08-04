// Task 8 — the toolbar-action handler branch table (TDD). Pure logic with every
// side effect mocked: status read, clip handoff, icon transitions, in-page
// toast/prompt. Asserts the unlocked/locked/closed/unpaired branches, the icon
// sequencing, and that NOTHING is captured on a not-ready vault.
import { describe, expect, it } from "vitest";

import { SAVING_NOTICE } from "../src/lib/load-bearing-copy";
import type { ClipOutcome } from "../src/background/clip";
import type { PairOutcome } from "../src/background/pair";
import type { VaultStatus } from "../src/background/status-wire";
import { handleClipClick, type ToolbarHandlerDeps } from "../src/background/toolbar";

interface Recorded {
  icon: string[];
  toasts: string[];
  prompts: string[];
  errors: string[];
  progress: string[];
  clipCalls: number;
  pairCalls: number;
}

function makeDeps(opts: {
  status: VaultStatus;
  /** The status returned by the SECOND query (after a successful pair). */
  statusAfterPair?: VaultStatus;
  outcome?: ClipOutcome;
  pairOutcome?: PairOutcome;
  /** Hold the handoff open until this settles, so gestures can overlap. */
  holdClip?: Promise<void>;
  /** Make the handoff throw, to prove the gate reopens on a thrown dep. */
  clipThrows?: boolean;
}): { deps: ToolbarHandlerDeps; rec: Recorded } {
  const rec: Recorded = {
    icon: [],
    toasts: [],
    prompts: [],
    errors: [],
    progress: [],
    clipCalls: 0,
    pairCalls: 0,
  };
  let statusCalls = 0;
  const deps: ToolbarHandlerDeps = {
    queryStatus: async () => {
      statusCalls += 1;
      return statusCalls === 1 ? opts.status : (opts.statusAfterPair ?? opts.status);
    },
    clip: async () => {
      rec.clipCalls += 1;
      if (opts.clipThrows) throw new Error("host transport blew up");
      if (opts.holdClip) await opts.holdClip;
      return opts.outcome ?? { status: "unreachable" };
    },
    icon: {
      clipStarted: () => rec.icon.push("clipStarted"),
      clipSucceeded: () => rec.icon.push("clipSucceeded"),
      clipFailed: () => rec.icon.push("clipFailed"),
      lock: () => rec.icon.push("lock"),
    },
    showToast: async (v) => {
      rec.toasts.push(v);
    },
    showPrompt: async (k) => {
      rec.prompts.push(k);
    },
    showError: async (r) => {
      rec.errors.push(r);
    },
    showProgress: async (m) => {
      rec.progress.push(m);
    },
    requestPair: async () => {
      rec.pairCalls += 1;
      return opts.pairOutcome ?? { kind: "unreachable" };
    },
  };
  return { deps, rec };
}

describe("handleClipClick — unlocked vault", () => {
  it("accepted clip → idle→clipping→saved + 'clip' toast", async () => {
    const { deps, rec } = makeDeps({
      status: "unlocked",
      outcome: { status: "accepted", confirm: "ok", captureKind: "full-article" },
    });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "clipped", variant: "clip" });
    expect(rec.icon).toEqual(["clipStarted", "clipSucceeded"]);
    expect(rec.progress).toEqual([SAVING_NOTICE]); // the in-flight banner showed
    expect(rec.toasts).toEqual(["clip"]);
    expect(rec.prompts).toEqual([]);
    expect(rec.clipCalls).toBe(1);
  });

  it("accepted bookmark capture → 'bookmark' toast variant", async () => {
    const { deps, rec } = makeDeps({
      status: "unlocked",
      outcome: { status: "accepted", confirm: "ok", captureKind: "bookmark" },
    });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "clipped", variant: "bookmark" });
    expect(rec.toasts).toEqual(["bookmark"]);
  });

  it("raced locked mid-flight → icon locked + locked prompt", async () => {
    const { deps, rec } = makeDeps({
      status: "unlocked",
      outcome: { status: "locked" },
    });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "prompt", promptKind: "locked" });
    expect(rec.icon).toEqual(["clipStarted", "lock"]);
    expect(rec.prompts).toEqual(["locked"]);
  });

  it("host vanished mid-flight → icon reset + closed prompt", async () => {
    const { deps, rec } = makeDeps({
      status: "unlocked",
      outcome: { status: "unreachable" },
    });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "prompt", promptKind: "closed" });
    expect(rec.icon).toEqual(["clipStarted", "clipFailed"]);
    expect(rec.prompts).toEqual(["closed"]);
  });

  it("error reply → icon reset to idle, error toast, NO 'Saved' toast (story 20/21)", async () => {
    const { deps, rec } = makeDeps({
      status: "unlocked",
      outcome: { status: "error", reason: "nothing_to_clip" },
    });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "error", reason: "nothing_to_clip" });
    expect(rec.icon).toEqual(["clipStarted", "clipFailed"]); // reset, never stuck in clipping
    expect(rec.toasts).toEqual([]); // never a success ("Saved") toast on failure
    expect(rec.errors).toEqual(["nothing_to_clip"]); // honest error surfaced
  });

  it("rate-limited error surfaces its reason to the error toast", async () => {
    const { deps, rec } = makeDeps({
      status: "unlocked",
      outcome: { status: "error", reason: "rate_limited" },
    });
    await handleClipClick(deps);
    expect(rec.errors).toEqual(["rate_limited"]);
    expect(rec.toasts).toEqual([]);
  });

  it("the icon is NEVER left in clipping for any non-accepted outcome (story 21)", async () => {
    const outcomes: ClipOutcome[] = [
      { status: "locked" },
      { status: "unreachable" },
      { status: "error", reason: "boom" },
    ];
    for (const outcome of outcomes) {
      const { deps, rec } = makeDeps({ status: "unlocked", outcome });
      await handleClipClick(deps);
      // After clipStarted, a resetting transition (clipFailed or lock) always
      // follows — the last icon call is never "clipStarted".
      expect(rec.icon[rec.icon.length - 1]).not.toBe("clipStarted");
      expect(["clipFailed", "lock"]).toContain(rec.icon[rec.icon.length - 1]);
    }
  });
});

describe("handleClipClick — not-ready vault captures NOTHING", () => {
  it("locked → icon locked + locked prompt, no capture", async () => {
    const { deps, rec } = makeDeps({ status: "locked" });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "prompt", promptKind: "locked" });
    expect(rec.icon).toEqual(["lock"]);
    expect(rec.prompts).toEqual(["locked"]);
    expect(rec.clipCalls).toBe(0); // never captured
    expect(rec.toasts).toEqual([]);
  });

  it("closed → icon locked + closed prompt, no capture", async () => {
    const { deps, rec } = makeDeps({ status: "closed" });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "prompt", promptKind: "closed" });
    expect(rec.icon).toEqual(["lock"]);
    expect(rec.prompts).toEqual(["closed"]);
    expect(rec.clipCalls).toBe(0);
  });

  it("unpaired → does NOT capture before pairing (the click initiates pairing)", async () => {
    const { deps, rec } = makeDeps({
      status: "unpaired",
      pairOutcome: { kind: "rejected", reason: "pairing_rejected" },
    });
    await handleClipClick(deps);
    expect(rec.pairCalls).toBe(1); // the click started pairing
    expect(rec.clipCalls).toBe(0); // nothing captured (not yet paired)
    expect(rec.toasts).toEqual([]);
  });
});

describe("handleClipClick — an unpaired click initiates pairing, then clips", () => {
  it("pair accepted + now unlocked → clips the clicked page", async () => {
    const { deps, rec } = makeDeps({
      status: "unpaired",
      pairOutcome: { kind: "paired" },
      statusAfterPair: "unlocked",
      outcome: { status: "accepted", confirm: "ok", captureKind: "full-article" },
    });
    const result = await handleClipClick(deps);
    expect(rec.pairCalls).toBe(1);
    expect(result).toEqual({ kind: "clipped", variant: "clip" });
    expect(rec.icon).toEqual(["clipStarted", "clipSucceeded"]);
    expect(rec.toasts).toEqual(["clip"]);
  });

  it("pair accepted + now locked → locked prompt, no capture", async () => {
    const { deps, rec } = makeDeps({
      status: "unpaired",
      pairOutcome: { kind: "paired" },
      statusAfterPair: "locked",
    });
    const result = await handleClipClick(deps);
    expect(rec.pairCalls).toBe(1);
    expect(result).toEqual({ kind: "prompt", promptKind: "locked" });
    expect(rec.icon).toEqual(["lock"]);
    expect(rec.prompts).toEqual(["locked"]);
    expect(rec.clipCalls).toBe(0);
  });

  it("pair declined (rejected) → pair prompt again, no capture", async () => {
    const { deps, rec } = makeDeps({
      status: "unpaired",
      pairOutcome: { kind: "rejected", reason: "pairing_rejected" },
    });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "prompt", promptKind: "unpaired" });
    expect(rec.icon).toEqual([]); // unpaired prompt does not lock the icon
    expect(rec.prompts).toEqual(["unpaired"]);
    expect(rec.clipCalls).toBe(0);
  });

  it("pair rejected because the desktop is locked → unlock prompt", async () => {
    const { deps, rec } = makeDeps({
      status: "unpaired",
      pairOutcome: { kind: "rejected", reason: "locked" },
    });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "prompt", promptKind: "locked" });
    expect(rec.icon).toEqual(["lock"]);
    expect(rec.prompts).toEqual(["locked"]);
  });

  it("pair unreachable (desktop closed) → open-Myne prompt", async () => {
    const { deps, rec } = makeDeps({
      status: "unpaired",
      pairOutcome: { kind: "unreachable" },
    });
    const result = await handleClipClick(deps);
    expect(result).toEqual({ kind: "prompt", promptKind: "closed" });
    expect(rec.icon).toEqual(["lock"]);
    expect(rec.prompts).toEqual(["closed"]);
    expect(rec.clipCalls).toBe(0);
  });
});

const ACCEPTED_CLIP: ClipOutcome = {
  status: "accepted",
  confirm: "ok",
  captureKind: "full-article",
};

/** Flush pending microtasks so an in-flight gesture has really reached its held
 *  handoff — a real second click lands mid-capture, not mid-status-read. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("handleClipClick — one gesture, one note (the in-flight gate)", () => {
  it("drops a second gesture that lands mid-capture, so ONE note is written", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const clip = makeDeps({
      status: "unlocked",
      outcome: ACCEPTED_CLIP,
      holdClip: held,
    });
    // A different trigger with a different capture function (the bookmark
    // context-menu entry), so this also pins that the gate is shared across the
    // five triggers rather than scoped per deps object.
    const bookmark = makeDeps({
      status: "unlocked",
      outcome: { status: "accepted", confirm: "ok", captureKind: "bookmark" },
    });

    const first = handleClipClick(clip.deps);
    await settle();
    expect(clip.rec.clipCalls).toBe(1); // the first gesture is inside its handoff

    const second = await handleClipClick(bookmark.deps);
    expect(second).toEqual({ kind: "dropped" });
    expect(bookmark.rec.clipCalls).toBe(0); // no second capture → no duplicate note
    expect(bookmark.rec.progress).toEqual([]); // dropped at the door, not mid-flow
    expect(bookmark.rec.toasts).toEqual([]); // and no second toast to hide it

    release();
    expect(await first).toEqual({ kind: "clipped", variant: "clip" });
    expect(clip.rec.clipCalls).toBe(1); // still exactly one capture
  });

  it("reopens the gate once the capture lands (a deliberate re-clip still clips)", async () => {
    const before = makeDeps({ status: "unlocked", outcome: ACCEPTED_CLIP });
    await handleClipClick(before.deps);

    // SYNC-16: clipping the same page again ON PURPOSE is a supported gesture —
    // the gate must close for the flight only, never latch.
    const after = makeDeps({ status: "unlocked", outcome: ACCEPTED_CLIP });
    expect(await handleClipClick(after.deps)).toEqual({
      kind: "clipped",
      variant: "clip",
    });
    expect(after.rec.clipCalls).toBe(1);
  });

  it("reopens the gate when the handoff throws (one bad clip never wedges it)", async () => {
    const throwing = makeDeps({ status: "unlocked", clipThrows: true });
    await expect(handleClipClick(throwing.deps)).rejects.toThrow(
      "host transport blew up",
    );

    const after = makeDeps({ status: "unlocked", outcome: ACCEPTED_CLIP });
    expect(await handleClipClick(after.deps)).toEqual({
      kind: "clipped",
      variant: "clip",
    });
    expect(after.rec.clipCalls).toBe(1);
  });
});
