// The PURE toolbar-icon four-state machine (clip-time-ux sub-feature 4, task 2).
//
// This module owns the logical capture states the toolbar icon can show and the
// two things that make them accessible and honest:
//   1. the state -> (glyph, title, badge) mapping — each state has a DISTINCT
//      glyph SHAPE plus DISTINCT text, so a state is NEVER told apart by color
//      alone (PRODUCT.md accessibility, story 18);
//   2. the legal-transition table — only the success path, the failure reset,
//      and the vault-not-ready branch are allowed; everything else is a no-op.
//
// It is deliberately PURE: no `browser.*`, no timers, no I/O. The thin
// `browser.action` adapter and the saved->idle timer live in the controller
// (`../background/icon-controller`) so this table is unit-tested without the
// WebExtensions API or a real clock.
//
// Glyph names come from task 1's inlined Lucide set (`./icons`); titles come from
// the load-bearing copy module (`./load-bearing-copy`) — neither is re-declared
// here. The four-state glyph ARTWORK (the polished per-state marks) is task 3
// (`[design]`); this module wires to the task-1 glyph NAMES only.
import type { IconName } from "./icons";
import {
  ICON_TITLE_CLIPPING,
  ICON_TITLE_IDLE,
  MYNE_LOCKED,
  SAVED_TO_MYNE,
} from "./load-bearing-copy";

/**
 * The four logical capture states the toolbar icon reflects:
 *   - `idle`     — ready; a click will attempt a clip (the resting state).
 *   - `clipping` — a capture/handoff is in flight (story 2 — "do not click again").
 *   - `saved`    — the handoff was accepted; a short-lived success (story 5).
 *   - `locked`   — the desktop vault is locked / not ready (story 19).
 */
export type IconState = "idle" | "clipping" | "saved" | "locked";

/** The four states, for exhaustive iteration in tests and the controller. */
export const ICON_STATES: readonly IconState[] = [
  "idle",
  "clipping",
  "saved",
  "locked",
] as const;

/**
 * What one state renders on the toolbar action. The `badge` is the short passive
 * text label the platform shows next to the icon (`browser.action.setBadgeText`)
 * — a SECOND text channel beyond the hover `title`, so the state is legible from
 * the badge alone (no color). Color (a badge background tint) MAY be added by the
 * adapter as a redundant cue, but it is never the ONLY thing separating states.
 */
export interface IconView {
  readonly state: IconState;
  /** The inlined task-1 glyph NAME the icon draws (a distinct SHAPE per state). */
  readonly glyph: IconName;
  /** `browser.action.setTitle` hover text — a distinct text read per state. */
  readonly title: string;
  /** `browser.action.setBadgeText` short label — a distinct passive read per state. */
  readonly badge: string;
}

// state -> view. Each state has a DISTINCT glyph and DISTINCT title/badge text, so
// no two states are separable by color alone (the never-color-alone invariant is
// asserted exhaustively by the unit tests). idle = scissors (the clip gesture);
// clipping = loader-circle (in-flight ring); saved = circle-check; locked = lock.
const VIEWS: Record<IconState, IconView> = {
  idle: {
    state: "idle",
    glyph: "scissors",
    title: ICON_TITLE_IDLE,
    badge: "",
  },
  clipping: {
    state: "clipping",
    glyph: "loader-circle",
    title: ICON_TITLE_CLIPPING,
    badge: "…",
  },
  saved: {
    state: "saved",
    glyph: "circle-check",
    // Reuse the load-bearing handoff-accepted literal — never a write claim (SYNC-13).
    title: SAVED_TO_MYNE,
    badge: "✓",
  },
  locked: {
    state: "locked",
    glyph: "lock",
    // Reuse the load-bearing locked status literal (em-dash, sentence case).
    title: MYNE_LOCKED,
    badge: "!",
  },
};

/** The (glyph, title, badge) a given state renders. Pure lookup. */
export function iconView(state: IconState): IconView {
  return VIEWS[state];
}

// The legal-transition table. Read as "from -> the set of states it may move to".
//   - idle     -> clipping (start) | locked (vault not ready)
//   - clipping -> saved (success) | idle (FAILURE RESET, story 21) | locked
//   - saved    -> idle (auto-return) | locked
//   - locked   -> idle (recovery, vault became ready) | locked (refresh)
// Notably ABSENT: idle->saved (cannot skip clipping), saved->clipping (no
// backwards), and every self-loop except locked->locked (a re-lock refresh). A
// self-transition (e.g. idle->idle) is NOT a transition — it is a no-op.
const TRANSITIONS: Record<IconState, readonly IconState[]> = {
  idle: ["clipping", "locked"],
  clipping: ["saved", "idle", "locked"],
  saved: ["idle", "locked"],
  locked: ["idle", "locked"],
};

/** Whether moving `from -> to` is a permitted transition. */
export function isLegalTransition(from: IconState, to: IconState): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Apply a transition: returns `to` if `from -> to` is legal, otherwise returns
 * `from` unchanged (an illegal transition is a NO-OP, never a throw — a stray
 * event must never crash the background or strand the icon in a wrong state).
 */
export function nextState(from: IconState, to: IconState): IconState {
  return isLegalTransition(from, to) ? to : from;
}
