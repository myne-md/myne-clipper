// Locked-vault BOOKMARK behaviour (url-bookmark task 4).
//
// This is a VERIFICATION slice, not new machinery. The locked-reply mechanics
// (`accepted | error | locked`) and the unlock-prompt transport are inherited
// wholesale from the foundation (sub-feature 1) / desktop-ingest — this file
// pins that the BOOKMARK case honours them EXACTLY, with NO bookmark-specific
// queue and NO special-casing:
//
//   - SYNC-1a (no plaintext pending-queue): a bookmark fired while the vault is
//     locked WRITES NOTHING to browser/extension storage — no URL, no title, no
//     payload. The extension captures nothing and prompts the user to unlock; it
//     must unlock + re-trigger. There is no `chrome.storage` clip buffer.
//
//     CREDENTIAL vs CLIP: since the pairing handshake landed, the extension holds
//     a durable scoped pairing TOKEN in `storage.local` (a revocable credential,
//     NOT a key, NOT a clip). Reading that credential (`storage.local.get`) is
//     legitimate — the dispatch needs the token to even address the host. The
//     SYNC-1a invariant is specifically about a plaintext CLIP/payload at rest:
//     the load-bearing guarantee is that a locked bookmark never WRITES a payload
//     (`storage.local.set` / `storage.local.remove` are never called). A
//     credential `get` is permitted; a clip `set`/`remove` is forbidden.
//   - O4 / unlock prompt: a `locked` host reply drives the actionable
//     "Unlock Myne" prompt (`MYNE_LOCKED` status + `UNLOCK_MYNE` button), NOT a
//     silent queue.
//   - SYNC-13 (handoff-accepted ≠ write-committed): on the SUCCESS path the
//     bookmark toast reads "Sent to Myne" — a handoff acknowledgement, never a
//     write claim ("Encrypted" / "written to vault" is forbidden).
//
// The bookmark handler (`bookmarkActiveTab`) is PURE + injectable, so this runs
// with NO `browser` global and NO real native-messaging port — the locked reply
// is supplied by a recording bridge that mirrors the foundation transport's
// honest pass-through (`sendEnvelopeToHost` settles a `locked` reply verbatim).
import { describe, expect, it, vi } from "vitest";

import {
  bookmarkActiveTab,
  type BookmarkBridge,
  type BookmarkPayload,
  type BookmarkTab,
  type BookmarkTabAccessor,
} from "../src/background/bookmark";
import type { ClipOutcome } from "../src/background/clip";
import {
  MYNE_LOCKED,
  SENT_TO_MYNE,
  stateForOutcome,
  UNLOCK_MYNE,
  viewForOutcome,
} from "../src/popup/copy";

/** A fake tab accessor returning a fixed tab. */
function fakeTabAccessor(tab: BookmarkTab | null): BookmarkTabAccessor {
  return () => Promise.resolve(tab);
}

/**
 * A recording bridge that replies `locked` for every dispatch — the foundation
 * transport's honest pass-through of a `locked` host reply, with NO storage
 * touch of its own (it only records the payloads it was handed).
 */
function lockedBridge(): BookmarkBridge & { dispatched: BookmarkPayload[] } {
  const dispatched: BookmarkPayload[] = [];
  return {
    dispatched,
    dispatch(payload: BookmarkPayload): Promise<ClipOutcome> {
      dispatched.push(payload);
      return Promise.resolve({ status: "locked" });
    },
  };
}

const LOCKED_TAB: BookmarkTab = {
  url: "https://example.com/locked-page",
  title: "A Page Bookmarked While Locked",
};

describe("locked bookmark — WRITES NOTHING (SYNC-1a, no pending-queue)", () => {
  it("never WRITES a clip/payload to storage on a locked bookmark", async () => {
    // Install a `browser.storage` SPY whose WRITE methods THROW the instant they
    // are touched. A locked bookmark keeps no clip buffer (SYNC-1a) — so it must
    // never WRITE a URL/title/payload to storage. If the handler ever queued the
    // payload, one of these write traps would fire and fail the test.
    //
    // The READ methods (`get`) are real spies that RESOLVE (they do not throw):
    // since the pairing handshake landed, reading the durable scoped pairing
    // TOKEN — a revocable credential, not a clip — is legitimate, so a `get` is
    // permitted and merely counted. Only a clip WRITE (`set`/`remove`) is the
    // SYNC-1a violation we forbid.
    const writeTrap = (api: string) =>
      vi.fn(() => {
        throw new Error(`storage.${api} must never be called (SYNC-1a)`);
      });
    const readSpy = () => vi.fn(() => Promise.resolve({}));
    const storageSpy = {
      local: {
        get: readSpy(),
        set: writeTrap("local.set"),
        remove: writeTrap("local.remove"),
      },
      session: {
        get: readSpy(),
        set: writeTrap("session.set"),
        remove: writeTrap("session.remove"),
      },
      sync: {
        get: readSpy(),
        set: writeTrap("sync.set"),
        remove: writeTrap("sync.remove"),
      },
    };
    const globalWithBrowser = globalThis as { browser?: unknown };
    const hadBrowser = "browser" in globalWithBrowser;
    const previous = globalWithBrowser.browser;
    globalWithBrowser.browser = { storage: storageSpy };

    try {
      const bridge = lockedBridge();
      const outcome = await bookmarkActiveTab({
        getActiveTab: fakeTabAccessor(LOCKED_TAB),
        bridge,
      });

      // The host refused to write; the handler surfaces `locked` verbatim.
      expect(outcome).toEqual({ status: "locked" });
      // The load-bearing guarantee (SYNC-1a): the payload went only to the
      // bridge — NO clip WRITE ever reached storage (`set`/`remove` untouched).
      for (const write of [
        storageSpy.local.set,
        storageSpy.local.remove,
        storageSpy.session.set,
        storageSpy.session.remove,
        storageSpy.sync.set,
        storageSpy.sync.remove,
      ]) {
        expect(write).not.toHaveBeenCalled();
      }
    } finally {
      if (hadBrowser) globalWithBrowser.browser = previous;
      else delete globalWithBrowser.browser;
    }
  });

  it("a locked bookmark queues nothing the user could later flush", async () => {
    // There is no pending-queue to inspect because none exists. We assert the
    // contract structurally: the locked outcome carries NO payload echo, no
    // "queued"/"pending" marker, and no retry handle — there is nothing to
    // re-send later; the user must unlock + re-trigger.
    const bridge = lockedBridge();
    const outcome = await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor(LOCKED_TAB),
      bridge,
    });

    expect(outcome.status).toBe("locked");
    // The bridge saw the payload (it was dispatched, not buffered) ...
    expect(bridge.dispatched).toHaveLength(1);
    // ... but the outcome the user/popup observes carries ONLY `{status:"locked"}`
    // — no captured URL, title, or payload that a queue could persist.
    expect(Object.keys(outcome)).toEqual(["status"]);
    expect("queued" in outcome).toBe(false);
    expect("pending" in outcome).toBe(false);
  });
});

describe("locked bookmark — drives the UNLOCK prompt, not a silent queue (O4)", () => {
  it("a locked reply maps to the `locked` popup state", () => {
    expect(stateForOutcome({ status: "locked" })).toBe("locked");
  });

  it("the locked view prompts to unlock, never confirms a save", () => {
    const view = viewForOutcome({ status: "locked" });
    // The actionable unlock affordance — not a queued/pending status.
    expect(view.title).toBe(MYNE_LOCKED);
    expect(view.action).toBe(UNLOCK_MYNE);
    // It must NOT read as a success — a locked bookmark saved nothing.
    expect(view.title).not.toBe(SENT_TO_MYNE);
    expect(`${view.title} ${view.body}`).not.toMatch(/queued|pending|saved/i);
  });
});

describe("success bookmark — toast reflects handoff-accepted, not write-committed (SYNC-13)", () => {
  it("an accepted bookmark confirms 'Sent to Myne' (a handoff ack, never a write claim)", () => {
    const accepted: ClipOutcome = {
      status: "accepted",
      confirm: "ok",
      captureKind: "bookmark",
    };
    const view = viewForOutcome(accepted);
    expect(view.title).toBe(SENT_TO_MYNE);
    // SYNC-13: the keyless extension cannot know a vault write happened, so the
    // copy never claims one.
    const surface = `${view.title} ${view.body} ${view.action ?? ""}`;
    expect(surface).not.toMatch(/encrypt|written to|wrote to|saved to (your )?vault/i);
  });
});
