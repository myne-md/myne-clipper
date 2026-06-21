// The PURE locked/closed/unpaired prompt view-model (clip-time-ux sub-feature 4,
// task 5 — the prompt "design" expressed as code).
//
// Owns WHAT the not-ready prompt shows for each desktop state, as plain data with
// NO DOM and NO `browser.*`. The DOM builder (`../content/prompt-view`) renders
// it; the controller (`../content/prompt-controller`, task 7) owns behavior
// (open/foreground dispatch, no-state-retained guarantee).
//
// Three presentations, ONE component:
//   - locked   → "Myne is locked — click to unlock", action "Unlock Myne";
//   - closed   → SHARES the honest "Myne is locked — click to unlock" framing
//                (stories 12/14 — the app isn't ready either way), action
//                "Open Myne to clip";
//   - unpaired → a DISTINCT first-run "Pair with Myne to start clipping"
//                presentation (story 26), action "Open Myne to pair".
//
// The honesty contract (SYNC-13 / stories 15-16): a prompt shows NO folders/tags/
// structure and NEVER implies a clip was queued or saved — it holds nothing. The
// whole surface is the click target that opens/foregrounds the desktop (task 7).
import type { IconName } from "./icons";
import {
  MYNE_LOCKED,
  MYNE_UNPAIRED,
  OPEN_MYNE_TO_CLIP,
  PAIR_WITH_MYNE,
  UNLOCK_MYNE,
} from "./load-bearing-copy";

/** Which not-ready desktop state the prompt reflects. */
export type PromptKind = "locked" | "closed" | "unpaired";

/** A complete, render-ready description of one prompt. */
export interface PromptModel {
  readonly kind: PromptKind;
  /** The status message (load-bearing literal). */
  readonly message: string;
  /** The action-affordance label (open/foreground/pair). */
  readonly action: string;
  /** The leading glyph — `circle-alert` for the "not ready" language. */
  readonly glyph: IconName;
  /** ARIA role — a polite status region (non-blocking, never a modal). */
  readonly role: "status";
  /** ARIA live politeness. */
  readonly ariaLive: "polite";
  /** Root-surface `data-testid` (E2E hook). */
  readonly testid: string;
  /** The whole-surface activate control `data-testid` (E2E hook). */
  readonly actionTestid: string;
  /** Manual-dismiss control `data-testid` (E2E hook). */
  readonly dismissTestid: string;
}

/** Root surface testid all three presentations share. */
export const PROMPT_TESTID = "clip-prompt";
/** The whole-surface activate (open/foreground) control testid. */
export const PROMPT_ACTION_TESTID = "clip-prompt.action";
/** Manual-dismiss control testid. */
export const PROMPT_DISMISS_TESTID = "clip-prompt.dismiss";

/**
 * Build the prompt model for a not-ready desktop state.
 *
 * locked/closed share the `MYNE_LOCKED` message (differing only in the action
 * verb); unpaired uses the distinct `MYNE_UNPAIRED` framing. The glyph is always
 * `circle-alert`. Carries no structure and no saved/queued affordance — it cannot
 * (there is nothing to show).
 */
export function buildPromptModel(kind: PromptKind): PromptModel {
  const message = kind === "unpaired" ? MYNE_UNPAIRED : MYNE_LOCKED;
  const action =
    kind === "locked"
      ? UNLOCK_MYNE
      : kind === "closed"
        ? OPEN_MYNE_TO_CLIP
        : PAIR_WITH_MYNE;
  return {
    kind,
    message,
    action,
    glyph: "circle-alert",
    role: "status",
    ariaLive: "polite",
    testid: PROMPT_TESTID,
    actionTestid: PROMPT_ACTION_TESTID,
    dismissTestid: PROMPT_DISMISS_TESTID,
  };
}
