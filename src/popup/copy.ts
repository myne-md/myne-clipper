// Popup outcome -> state machine + the popup's view of the load-bearing copy.
//
// SINGLE SOURCE OF TRUTH (clip-time-ux task 1 consolidation):
// The load-bearing capture literals now live in `../lib/load-bearing-copy` —
// the `myne-clipper` analogue of the main repo's `src/lib/load-bearing-copy.ts`
// — so sub-feature 4 (clip-time-ux)'s toast/prompt and this popup render ONE set
// of strings, asserted by full-literal E2E equality. This module re-exports them
// (so existing importers keep their import site) and consumes them in the
// outcome -> view mapping. Do NOT re-declare a literal here; import it.
//
// The strings are SECURITY/HONESTY load-bearing, not cosmetic: the browser
// confirm must mean exactly "handoff accepted" and NEVER assert a write the
// desktop did not commit — the desktop is the sole write authority (SYNC-13).
// "Saved to Myne" / "Sent to Myne" are handoff acknowledgements; "Encrypted" (or
// "Written" / "Saved to vault") is deliberately absent (keyless extension).

import type { ClipOutcome } from "../background/clip";
import {
  MYNE_LOCKED,
  OPEN_MYNE_TO_CLIP,
  SAVED_TO_MYNE,
  SENT_TO_MYNE,
  UNLOCK_MYNE,
} from "../lib/load-bearing-copy";

// Re-export the load-bearing literals so existing importers (popup/index.ts, the
// foundation tests) and clip-time-ux's surfaces can reach them from here too,
// while the single definition lives in `../lib/load-bearing-copy`.
export {
  MYNE_LOCKED,
  OPEN_MYNE_TO_CLIP,
  SAVED_TO_MYNE,
  SENT_TO_MYNE,
  UNLOCK_MYNE,
} from "../lib/load-bearing-copy";

// The placeholder surfaces the popup shows. Each is a DISTINCT, honest state —
// there is no state that claims a success the desktop did not report.
//   - `saved`  = the desktop ACCEPTED the handoff (story 10/12; SYNC-13 — accepted ≠ written).
//   - `locked` = the desktop reported the vault is locked (story 13/16; O4).
//   - `closed` = the native host is unreachable / the desktop is closed (story 14).
//   - `error`  = the handoff was flaky: the host replied `error`, was rate-limited,
//                crashed mid-message, or sent a malformed reply (story 18/21). An
//                error NEVER renders as a success.
export type PopupState = "saved" | "locked" | "closed" | "error";

/** What a single popup state renders. */
export interface StateView {
  readonly title: string;
  readonly body: string;
  /** Label for the single affordance button, or null for a status-only state. */
  readonly action: string | null;
}

// Static copy for the non-saved states. The `saved` view is built per-outcome
// (clip vs bookmark) by `viewForOutcome`, so it is not in this static table.
const STATIC_VIEWS: Record<Exclude<PopupState, "saved">, StateView> = {
  locked: {
    // Title is the honest status literal ("Myne is locked — click to unlock");
    // the affordance button reads "Unlock Myne". Two distinct constants, one
    // source — see `../lib/load-bearing-copy`.
    title: MYNE_LOCKED,
    body: "Unlock Myne on your desktop to clip this page.",
    action: UNLOCK_MYNE,
  },
  closed: {
    title: "Myne isn’t open",
    body: "Open the Myne desktop app to clip this page.",
    action: OPEN_MYNE_TO_CLIP,
  },
  error: {
    title: "Couldn’t clip",
    body: "Myne didn’t accept the clip. Nothing was saved — try clipping again.",
    action: null,
  },
};

// A flaky handoff that hit the host's rate limiter gets its own honest body so
// the user knows WHY (a flood guard tripped), not just that it failed. The host
// surfaces this as the `rate_limited` error reason (clipper::host::RejectReason).
const RATE_LIMITED_VIEW: StateView = {
  title: "Slow down",
  body: "Myne is rate-limiting clips right now. Wait a moment, then try again.",
  action: null,
};

/** The host's error reason for a rate-limit rejection (mirrors the Rust host). */
const RATE_LIMITED_REASON = "rate_limited";

/**
 * Pure mapping: an honest clip outcome -> the popup state to render.
 *
 * This is the load-bearing honesty gate and is intentionally a pure function so
 * it can be unit-tested without a live host:
 *   - `accepted`    -> `saved`  (handoff accepted; the desktop owns the write — SYNC-13).
 *   - `locked`      -> `locked` (the actionable "Unlock Myne" state; O4).
 *   - `unreachable` -> `closed` (desktop not open / host crashed before any reply — story 14).
 *   - `error`       -> `error`  (host replied error / rate-limited / malformed reply — story 18/21).
 *
 * Crucially, `error` and `unreachable` are DISTINCT (a flaky handoff is not the
 * same as a closed desktop), and NEITHER ever maps to a success state.
 */
export function stateForOutcome(outcome: ClipOutcome): PopupState {
  switch (outcome.status) {
    case "accepted":
      return "saved";
    case "locked":
      return "locked";
    case "unreachable":
      return "closed";
    case "error":
      return "error";
  }
}

/**
 * Pure mapping: an honest clip outcome -> the exact view (copy) to render.
 *
 * For `accepted`, the confirm copy is chosen by capture kind — a bookmark reads
 * "Sent to Myne", a page clip reads "Saved to Myne" — both meaning "handoff
 * accepted", never a write claim (SYNC-13). For a rate-limited error the body
 * explains the throttle specifically; other errors get the generic honest error.
 */
export function viewForOutcome(outcome: ClipOutcome): StateView {
  if (outcome.status === "accepted") {
    const confirm =
      outcome.captureKind === "bookmark" ? SENT_TO_MYNE : SAVED_TO_MYNE;
    return {
      title: confirm,
      // Honest by construction: the desktop is the write authority (SYNC-13).
      body: "Myne accepted the clip.",
      action: null,
    };
  }
  if (outcome.status === "error" && outcome.reason === RATE_LIMITED_REASON) {
    return RATE_LIMITED_VIEW;
  }
  // `outcome.status` is `error | locked | unreachable` here (accepted returned
  // above) — map to its honest, non-saved state and look up its static view.
  const state = stateForOutcome(outcome);
  if (state === "saved") {
    // Unreachable in practice (accepted is handled above); the type system needs
    // the guard to narrow away `saved` from the static-view lookup.
    return STATIC_VIEWS.error;
  }
  return STATIC_VIEWS[state];
}
