// The PURE toast view-model (clip-time-ux sub-feature 4, task 4 — the toast
// "design" expressed as code).
//
// This module owns WHAT the success toast shows — the honest message, the leading
// success chip glyph, the optional inline "view" action, and the a11y contract —
// as a plain data model, with NO DOM and NO `browser.*`. The DOM builder
// (`../content/toast-view`) turns a model into elements; the controller
// (`../content/toast-controller`, task 6) owns the behavior (replace / dismiss /
// timers / view dispatch). Splitting the model out keeps the copy + structure
// node-testable and single-sourced.
//
// Two variants, ONE component (task 4 design note):
//   - clip     → "Saved to Myne" + a "view" action (open the saved note);
//   - bookmark → "Sent to Myne", NO view action (a bookmark is content-light;
//                there is no article to jump into — different framing, same shell).
// Both messages are the load-bearing handoff-accepted literals (SYNC-13 — never a
// write claim), imported from `./load-bearing-copy`, never inlined.
import type { IconName } from "./icons";
import {
  CLIP_FAILED,
  CLIP_RATE_LIMITED,
  SAVED_TO_MYNE,
  SENT_TO_MYNE,
  VIEW_NOTE,
} from "./load-bearing-copy";

/** Which notice this is — a landed capture, a failure, an in-flight progress, or an info. */
export type ToastVariant = "clip" | "bookmark" | "error" | "progress" | "info";

/** Visual tone: success (check, `--success`), error (alert, `--danger`), or progress (spinner, neutral). */
export type ToastTone = "success" | "error" | "progress";

/** The inline "view" affordance (clip only): a label + its observability hook. */
export interface ToastViewAction {
  readonly label: string;
  /** `data-testid` for the E2E "view" dispatch assertion (task 13). */
  readonly testid: string;
}

/** A complete, render-ready description of one toast (success or error). */
export interface ToastModel {
  readonly variant: ToastVariant;
  /** Success vs error tone (drives the chip glyph + color in the view). */
  readonly tone: ToastTone;
  /** The honest message (a handoff-accepted literal, or an honest failure line). */
  readonly message: string;
  /** The leading chip glyph (`circle-check`/`--success` or `circle-alert`/`--danger`). */
  readonly chipGlyph: IconName;
  /** The inline "view" action, or `null` for the bookmark / error variants. */
  readonly viewAction: ToastViewAction | null;
  /** ARIA role — a polite status region, not an alert (non-blocking). */
  readonly role: "status";
  /** ARIA live politeness — announced without stealing focus. */
  readonly ariaLive: "polite";
  /** Root-surface `data-testid` (E2E hook). */
  readonly testid: string;
  /** Manual-dismiss control `data-testid` (E2E hook). */
  readonly dismissTestid: string;
}

/** Root surface testid both variants share (the single toast on screen). */
export const TOAST_TESTID = "clip-toast";
/** Manual-dismiss control testid. */
export const TOAST_DISMISS_TESTID = "clip-toast.dismiss";
/** The "view" action testid (clip variant). */
export const TOAST_VIEW_TESTID = "clip-toast.view";

/**
 * Build the toast model for a landed capture.
 *
 * `clip` → "Saved to Myne" with a "view" action; `bookmark` → "Sent to Myne"
 * with no action. The chip is always `circle-check` (the success language). The
 * a11y contract is fixed: a polite `status` region (non-blocking).
 */
export function buildToastModel(variant: "clip" | "bookmark"): ToastModel {
  const isClip = variant === "clip";
  return {
    variant,
    tone: "success",
    message: isClip ? SAVED_TO_MYNE : SENT_TO_MYNE,
    chipGlyph: "circle-check",
    viewAction: isClip
      ? { label: VIEW_NOTE, testid: TOAST_VIEW_TESTID }
      : null,
    role: "status",
    ariaLive: "polite",
    testid: TOAST_TESTID,
    dismissTestid: TOAST_DISMISS_TESTID,
  };
}

/** The host's rate-limit error reason (mirrors `clipper::host::RejectReason`). */
const RATE_LIMITED_REASON = "rate_limited";

/**
 * Honest failure copy for a host error reason. The rate-limit case gets its own
 * specific line; everything else gets the generic "Couldn't clip — try again".
 * NEVER a success literal (story 20).
 */
export function errorCopyFor(reason: string): string {
  return reason === RATE_LIMITED_REASON ? CLIP_RATE_LIMITED : CLIP_FAILED;
}

/**
 * Build the ERROR toast model (clip-time-ux task 11): an alert chip + an honest
 * failure message + NO "view" action — never a success claim. Same transient
 * single-toast shell as a success toast (auto + manual dismiss).
 */
export function buildErrorToastModel(reason: string): ToastModel {
  return {
    variant: "error",
    tone: "error",
    message: errorCopyFor(reason),
    chipGlyph: "circle-alert",
    viewAction: null,
    role: "status",
    ariaLive: "polite",
    testid: TOAST_TESTID,
    dismissTestid: TOAST_DISMISS_TESTID,
  };
}

/**
 * Build the in-flight PROGRESS toast (a spinner glyph + the message, neutral
 * tone, no "view"). Shown WHILE a clip/pairing handoff is in flight; the outcome
 * (saved / error / prompt) replaces it. It does NOT auto-dismiss (the controller
 * mounts it persistently).
 */
export function buildProgressToastModel(message: string): ToastModel {
  return {
    variant: "progress",
    tone: "progress",
    message,
    chipGlyph: "loader-circle",
    viewAction: null,
    role: "status",
    ariaLive: "polite",
    testid: TOAST_TESTID,
    dismissTestid: TOAST_DISMISS_TESTID,
  };
}

/** Build a generic success INFO toast (a check + the message, no "view"). */
export function buildInfoToastModel(message: string): ToastModel {
  return {
    variant: "info",
    tone: "success",
    message,
    chipGlyph: "circle-check",
    viewAction: null,
    role: "status",
    ariaLive: "polite",
    testid: TOAST_TESTID,
    dismissTestid: TOAST_DISMISS_TESTID,
  };
}
