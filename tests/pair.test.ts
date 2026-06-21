// The pair-initiation handler — the FIRST contact with the desktop (pairing
// task 6). The pure `requestPairing` is unit-tested with fakes for both seams
// (the `connectNative` pair request + the durable token store); the real
// adapters are exercised by the E2E. The load-bearing guarantees: a `paired`
// reply STORES the minted scoped token, and NOTHING is stored on any non-paired
// outcome (rejected / locked / unreachable) — pairing never persists a token the
// desktop did not mint.
import { describe, expect, it } from "vitest";

import {
  type PairResult,
  requestPairing,
} from "../src/background/pair";

/** A fake pair request that always resolves the given result; if `challengeCode`
 *  is given it fires `onChallenge` with it first (the phase-1 relay), mirroring
 *  the real two-phase adapter. */
function fakeRequest(
  result: PairResult,
  challengeCode?: string,
): (onChallenge: (code: string) => void) => Promise<PairResult> {
  return (onChallenge) => {
    if (challengeCode !== undefined) onChallenge(challengeCode);
    return Promise.resolve(result);
  };
}

/** A no-op challenge sink for outcome-focused tests. */
const noChallenge = (): void => {};

/** A recording token store: captures every value `requestPairing` stores. */
function recordingStore(): {
  stored: string[];
  storeToken: (token: string) => Promise<void>;
} {
  const stored: string[] = [];
  return {
    stored,
    storeToken(token: string): Promise<void> {
      stored.push(token);
      return Promise.resolve();
    },
  };
}

describe("requestPairing", () => {
  it("stores the minted scoped token on a paired reply", async () => {
    const store = recordingStore();
    const outcome = await requestPairing({
      sendPairRequest: fakeRequest({ status: "paired", token: "scoped-tok-7" }),
      storeToken: store.storeToken,
      showChallenge: noChallenge,
    });

    expect(outcome).toEqual({ kind: "paired" });
    // The token the desktop minted was persisted durably — exactly once.
    expect(store.stored).toEqual(["scoped-tok-7"]);
  });

  it("reports rejected and stores NOTHING on a host error", async () => {
    const store = recordingStore();
    const outcome = await requestPairing({
      sendPairRequest: fakeRequest({
        status: "error",
        reason: "pairing_rejected",
      }),
      storeToken: store.storeToken,
      showChallenge: noChallenge,
    });

    // The host's reason passes through for an honest prompt; no token minted.
    expect(outcome).toEqual({ kind: "rejected", reason: "pairing_rejected" });
    expect(store.stored).toEqual([]);
  });

  it("reports rejected (reason 'locked') and stores NOTHING on a locked desktop", async () => {
    const store = recordingStore();
    const outcome = await requestPairing({
      sendPairRequest: fakeRequest({ status: "locked" }),
      storeToken: store.storeToken,
      showChallenge: noChallenge,
    });

    // A locked desktop cannot pair — a rejection the trigger turns into an
    // "unlock Myne first" prompt. No token was minted, so none is stored.
    expect(outcome).toEqual({ kind: "rejected", reason: "locked" });
    expect(store.stored).toEqual([]);
  });

  it("reports unreachable and stores NOTHING when the host is unreachable", async () => {
    const store = recordingStore();
    const outcome = await requestPairing({
      sendPairRequest: fakeRequest({ status: "unreachable" }),
      storeToken: store.storeToken,
      showChallenge: noChallenge,
    });

    // Closed desktop / crashed host — never a fake pairing, never a stored token.
    expect(outcome).toEqual({ kind: "unreachable" });
    expect(store.stored).toEqual([]);
  });

  it("surfaces the relayed challenge code via showChallenge, then pairs", async () => {
    // The two-phase handshake (SYNC-6): phase 1 relays the numeric comparison
    // code, which `requestPairing` must hand to `showChallenge` so the user can
    // compare it with the Accept dialog; phase 2 then mints + stores the token.
    const store = recordingStore();
    const shown: string[] = [];
    const outcome = await requestPairing({
      sendPairRequest: fakeRequest({ status: "paired", token: "tok-9" }, "481920"),
      storeToken: store.storeToken,
      showChallenge: (code) => shown.push(code),
    });

    expect(shown).toEqual(["481920"]); // the code reached the user-facing sink
    expect(outcome).toEqual({ kind: "paired" });
    expect(store.stored).toEqual(["tok-9"]);
  });
});
