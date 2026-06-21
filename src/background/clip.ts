// Clip orchestration: capture -> handoff envelope -> native-messaging host.
//
// FOUNDATION SCOPE (the tracer bullet). The background:
//   1. injects the content capture bundle into the active tab on a user gesture
//      (`activeTab` + `scripting`, never `<all_urls>`),
//   2. asks it to capture a FUNCTIONAL (not faithful) clip,
//   3. wraps it in the versioned handoff envelope (SYNC-10),
//   4. sends it to the desktop over `runtime.connectNative` (TB10),
//   5. returns the host's tiny `accepted | error | locked` reply (SYNC-13).
//
// Keyless by design: this never holds a vault key (A14). It carries ONLY the
// scoped pairing token (NOT a key) the desktop minted on Accept. It NEVER
// writes a clip to browser storage (SYNC-1a — zero plaintext-at-rest) and never
// sources vault structure (SYNC-15). It NEVER fetches a URL — every byte comes
// from the in-page capture (SYNC-12).
import browser from "webextension-polyfill";

import {
  buildContentClipEnvelope,
  type CapturedClip,
  type HandoffEnvelope,
} from "./envelope";
import { HOST_NAME } from "./host-name";
import { getPairingToken } from "./pairing-token";

/** How a clip was captured (mirrors the content capture / host `CaptureKind`). */
export type CaptureKind = "full-article" | "selection" | "bookmark";

// Re-export the wire SHAPE (owned by the pure `./envelope` module) so existing
// consumers keep importing `HandoffEnvelope` / `CapturedClip` from `./clip`.
export type { CapturedClip, HandoffEnvelope } from "./envelope";

/**
 * The host -> ext reply wire shape (mirrors `clipper::envelope::HostReply`).
 *
 * SYNC-13: `accepted` means "the desktop ACCEPTED the handoff", NOT "encrypted +
 * written to the vault" — the desktop is the sole write authority. The popup
 * confirm therefore says "Saved/Sent to Myne", never "Encrypted".
 */
export type HostReply =
  | { status: "accepted"; confirm: string }
  | { status: "error"; reason: string }
  | { status: "locked" };

/**
 * The honest local outcome the background reports to the popup.
 *
 * It is the host's reply, plus:
 *   - `unreachable` — `connectNative` threw or the port disconnected with NO
 *     reply (the closed-desktop / crashed-host case — never a fake success).
 *   - on `accepted`, the `captureKind` the extension captured, so the popup can
 *     pick the right honest confirm copy ("Saved to Myne" clip / "Sent to Myne"
 *     bookmark). The host reply itself stays tiny (SYNC-13); the kind is local
 *     knowledge the extension already has from its own capture.
 */
export type ClipOutcome =
  | { status: "accepted"; confirm: string; captureKind: CaptureKind }
  | { status: "error"; reason: string }
  | { status: "locked" }
  | { status: "unreachable" };

// The versioned handoff envelope (`HandoffEnvelope`) and the captured-clip shape
// (`CapturedClip`) are owned by the PURE `./envelope` module (re-exported above)
// so the wire shape loads under Vitest without `browser.*`. A bookmark builds the
// SAME shape via `buildBookmarkEnvelope` and reuses the SAME transport
// (`sendEnvelopeToHost`) — a degenerate clip on this one channel, not a second
// wire contract.

function isCapturedClip(v: unknown): v is CapturedClip {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as CapturedClip).markdownBody === "string" &&
    typeof (v as CapturedClip).sourceUrl === "string"
  );
}

function isHostReply(v: unknown): v is HostReply {
  if (typeof v !== "object" || v === null) return false;
  const status = (v as { status?: unknown }).status;
  return status === "accepted" || status === "error" || status === "locked";
}

// Inject the content capture bundle into the active tab and ask it to capture.
// `activeTab` grants the temporary host permission for THIS tab on the user
// gesture; `scripting.executeScript({ files })` injects the bundled content
// script, then `tabs.sendMessage` triggers the capture and resolves with the
// clip. No broad host permission is used.
async function captureActiveTab(): Promise<CapturedClip | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return null;
  const tabId = tab.id;
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch {
    // Injection can fail on privileged pages (browser settings, the web store);
    // there is nothing to clip there.
    return null;
  }
  const clip = await browser.tabs.sendMessage(tabId, { type: "myne-capture" });
  return isCapturedClip(clip) ? clip : null;
}

/**
 * How long to wait for the host's clip reply before treating the desktop as not
 * reachable (X2). It must EXCEED the app's clip-dispatch budget — the desktop
 * parks up to ~30 s assembling a clip (resolving `[[wikilinks]]` against a large
 * decrypted vault) and then ALWAYS replies — so a legitimate clip is never cut
 * off. The margin bounds the silent path: a revoked / invalid token is SILENTLY
 * IGNORED by the desktop (no reply AND no disconnect — `relay.rs`'s
 * `serve_connection` keeps the connection open), so without a bound the clip
 * Promise hangs forever and the toolbar icon is stranded in "clipping". Mirrors
 * `status.ts`'s `STATUS_QUERY_TIMEOUT_MS` (a status read is quick → 2 s; a clip
 * can be slow → this larger budget).
 */
const CLIP_REPLY_TIMEOUT_MS = 35_000;

/**
 * The largest serialized envelope the extension will hand to the host (X1).
 * Chrome / Edge cap a SINGLE extension→host native message at 1 MiB; a larger
 * message is dropped by the browser runtime (the port errors / disconnects with
 * NO reply), which would otherwise surface as a misleading "open Myne" while
 * Myne is open and unlocked. We measure the serialized envelope up-front and
 * fail with an honest `clip_too_large` instead. The cap sits under 1 MiB to
 * leave headroom for the runtime's JSON + 4-byte-length framing overhead. (Note:
 * `image_bytes` is currently a JSON number-array — ~4–7× inflation — so this cap
 * also bounds that until the wire encoding moves to base64.)
 */
const MAX_EXT_TO_HOST_BYTES = 1_000_000;

// Send one envelope to the desktop host over native messaging and resolve with
// an HONEST outcome. The four cases task 8 must keep distinct:
//   - `unreachable` — `connectNative` threw, OR the port disconnected before any
//     reply (host not running / crashed → the closed-desktop "open Myne" prompt);
//   - `accepted`    — the host replied `accepted` (handoff accepted; SYNC-13).
//                     We attach the `captureKind` we ourselves captured so the
//                     popup can pick "Saved to Myne" vs "Sent to Myne";
//   - `locked`      — the host replied `locked` (drives "Unlock Myne");
//   - `error`       — the host replied `error` (incl. `rate_limited`), OR the
//                     reply was a malformed shape (`malformed_reply`). A flaky
//                     handoff surfaces as an error and NEVER as a fake success.
export function sendEnvelopeToHost(
  envelope: HandoffEnvelope,
  captureKind: CaptureKind,
): Promise<ClipOutcome> {
  return new Promise<ClipOutcome>((resolve) => {
    // Size guard (X1): a >1 MiB ext→host message is dropped by Chrome/Edge with
    // no reply — measure the serialized envelope up-front and fail honestly,
    // never spawning the host for a clip that can't traverse the wire.
    let serialized: string;
    try {
      serialized = JSON.stringify(envelope);
    } catch {
      resolve({ status: "error", reason: "malformed_envelope" });
      return;
    }
    if (new TextEncoder().encode(serialized).length > MAX_EXT_TO_HOST_BYTES) {
      resolve({ status: "error", reason: "clip_too_large" });
      return;
    }

    // Open the native-messaging port first so its type is inferred (the
    // ambient polyfill default import exposes no `Runtime.Port` type name).
    let port: ReturnType<typeof browser.runtime.connectNative>;
    try {
      port = browser.runtime.connectNative(HOST_NAME);
    } catch {
      resolve({ status: "unreachable" });
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (outcome: ClipOutcome): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      try {
        port.disconnect();
      } catch {
        // already gone
      }
      resolve(outcome);
    };

    port.onMessage.addListener((msg: unknown) => {
      if (!isHostReply(msg)) {
        // A reply we cannot parse is a flaky/crashed handoff — surface it as an
        // honest error so the user can retry, NEVER as a success (story 18).
        settle({ status: "error", reason: "malformed_reply" });
        return;
      }
      if (msg.status === "accepted") {
        // Enrich the tiny host ack with the locally-known capture kind so the
        // popup renders the right honest confirm copy (SYNC-13 — accepted ≠ written).
        settle({ status: "accepted", confirm: msg.confirm, captureKind });
        return;
      }
      // `error` (incl. the host's `rate_limited` reason) or `locked` pass through
      // verbatim — both are honest, distinct, non-success states.
      settle(msg);
    });
    // A disconnect BEFORE any reply means the host was unreachable / crashed /
    // the app is closed — surface the honest unreachable state, never a fake
    // success (SYNC-13, task 8).
    port.onDisconnect.addListener(() => settle({ status: "unreachable" }));
    // A silently-ignored (revoked / invalid / unpaired) frame yields neither a
    // reply nor a disconnect — bound the wait so a clip can never hang the icon.
    timer = setTimeout(() => settle({ status: "unreachable" }), CLIP_REPLY_TIMEOUT_MS);

    port.postMessage(envelope);
  });
}

/**
 * Clip the active tab end-to-end: capture -> envelope -> host -> reply.
 *
 * Returns one of four HONEST outcomes (task 8): `accepted` (+ captureKind),
 * `locked`, `error` (host error / rate-limit / malformed reply), or
 * `unreachable` (desktop closed / host crashed). Never writes to storage; never
 * claims a write the desktop did not commit (SYNC-13).
 */
export async function clipActiveTab(): Promise<ClipOutcome> {
  const token = await getPairingToken();
  if (token === null) {
    // Not paired yet — there is no scoped token to present. The host would stay
    // silent to an unpaired caller (it never replies), so surface the honest
    // unreachable/needs-pairing state rather than hanging.
    return { status: "unreachable" };
  }
  const clip = await captureActiveTab();
  if (clip === null) return { status: "error", reason: "nothing_to_clip" };

  const envelope = buildContentClipEnvelope({
    extensionId: browser.runtime.id,
    token,
    clip,
  });
  return await sendEnvelopeToHost(envelope, clip.captureKind);
}
