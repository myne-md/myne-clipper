// The REAL platform seam for the pair handler (pairing task 6).
//
// This is the impure half of pairing — the ONLY place the pair action touches
// the native-messaging transport. It is split out from the pure handler
// (`./pair`) exactly like `./bookmark-adapter` is split from `./bookmark`: the
// handler stays a PURE injectable unit (no `webextension-polyfill` import, so it
// loads under Vitest), while this file — which imports the polyfill and would
// throw outside an extension — is imported only by the background wiring.
//
// It mirrors the settle/disconnect discipline of `clip.ts`'s `sendEnvelopeToHost`
// (open the port first, settle exactly once, treat a disconnect-before-reply or a
// throw as `unreachable`, never a fake success). Pairing is the FIRST contact, so
// the request carries an EMPTY token — the desktop mints one on Accept and relays
// it back.
import browser from "webextension-polyfill";

import { HOST_NAME } from "./host-name";
import type { PairResult } from "./pair";
import {
  buildPairAwaitEnvelope,
  buildPairBeginEnvelope,
  mapBeginReply,
  mapPairReply,
} from "./pair-wire";

/**
 * Run the two-phase pair handshake over ONE native-messaging port and resolve a
 * single {@link PairResult}. Phase 1 (`pair-begin`) yields the numeric challenge,
 * which we hand to `onChallenge` (the caller shows it for the user to compare),
 * then we send phase 2 (`pair-await`) on the same port and resolve its outcome.
 *
 * A `connectNative` throw or a disconnect BEFORE the terminal reply → `unreachable`
 * (closed-desktop / crashed-host), never a fake success — same settle/disconnect
 * discipline as `clip.ts`'s `sendEnvelopeToHost`. A locked / error phase-1 reply
 * resolves immediately (no phase 2); `onChallenge` fires only on a real challenge.
 */
/**
 * How long the whole two-phase handshake may take before it is abandoned (X2).
 *
 * Phase 2 (`pair-await`) deliberately BLOCKS the desktop until the user clicks
 * Accept / Reject, so this must be a generous HUMAN-scale budget — but it must
 * be FINITE: if the desktop silently ignores the frame (a stale/parse-failed
 * phase-1 reply, or the host stalls) it sends neither a terminal reply nor a
 * disconnect, so an unbounded handshake would leave the in-flight pairing banner
 * up forever. On timeout the handshake resolves `unreachable` (re-pair), never a
 * fake pairing.
 */
const PAIR_REPLY_TIMEOUT_MS = 120_000;

export function defaultSendPairRequest(
  onChallenge: (code: string) => void,
): Promise<PairResult> {
  return new Promise<PairResult>((resolve) => {
    // Open the native-messaging port first so its type is inferred (the ambient
    // polyfill default import exposes no `Runtime.Port` type name).
    let port: ReturnType<typeof browser.runtime.connectNative>;
    try {
      port = browser.runtime.connectNative(HOST_NAME);
    } catch {
      resolve({ status: "unreachable" });
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // `false` while awaiting the phase-1 (begin) reply; `true` once we have sent
    // phase 2 (await) and are waiting for the terminal token/outcome reply.
    let awaiting = false;
    const settle = (result: PairResult): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      try {
        port.disconnect();
      } catch {
        // already gone
      }
      resolve(result);
    };

    port.onMessage.addListener((msg: unknown) => {
      if (!awaiting) {
        const begin = mapBeginReply(msg);
        if (begin.status === "challenge") {
          // Surface the code for the user to compare, then ask the desktop to
          // block for the Accept on the SAME port (phase 2).
          onChallenge(begin.code);
          awaiting = true;
          try {
            port.postMessage(buildPairAwaitEnvelope(browser.runtime.id));
          } catch {
            settle({ status: "unreachable" });
          }
          return;
        }
        // locked / error in phase 1 → terminal, no phase 2.
        settle(begin);
        return;
      }
      // Phase-2 terminal reply: paired (token) / locked / error.
      settle(mapPairReply(msg));
    });
    // A disconnect BEFORE the terminal reply means the host was unreachable /
    // crashed / the app is closed — honest unreachable, never a fake pairing.
    port.onDisconnect.addListener(() => settle({ status: "unreachable" }));
    // Bound the whole handshake: a silently-ignored frame yields neither a
    // terminal reply nor a disconnect, so without this the in-flight pairing
    // would hang forever. Generous (human-scale) but finite.
    timer = setTimeout(() => settle({ status: "unreachable" }), PAIR_REPLY_TIMEOUT_MS);

    port.postMessage(buildPairBeginEnvelope(browser.runtime.id));
  });
}
