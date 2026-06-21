// The toolbar-icon four-state CONTROLLER (clip-time-ux sub-feature 4, task 2).
//
// This is the thin, stateful wrapper around the PURE state machine
// (`../lib/icon-state`). It owns exactly two impure things, both INJECTABLE so
// the controller is fully unit-testable without the browser or a real clock:
//   1. the `browser.action` ADAPTER — the only place `setIcon` / `setBadgeText`
//      / `setTitle` are called. The state machine emits a glyph NAME + title +
//      badge; the adapter rasterizes the glyph and pushes it to the platform.
//   2. the saved->idle CLOCK — a `setTimeout`/`clearTimeout` pair (injected) that
//      makes the short-lived `saved` state auto-return to `idle` (story 5), and
//      that is CANCELLED if anything else moves the state first (so a stale timer
//      never silently flips locked->idle).
//
// The controller exposes intent methods (`clipStarted` / `clipSucceeded` /
// `clipFailed` / `lock` / `unlock`) that each request ONE transition through the
// pure `nextState`; an illegal request is a no-op (and renders nothing). This is
// the icon side of the "Toolbar action handler" module in the PRD — the click
// handler (background wiring) will call these as the real clip outcomes resolve.
//
// The actual four-state glyph ARTWORK is task 3 (`[design]`); for now the real
// adapter (`./browser-action-adapter`) rasterizes the task-1 inlined glyph paths,
// so the icon is functional per state.
//
// This module imports NO `webextension-polyfill` / `browser.action` — the impure
// platform seam lives entirely in `./browser-action-adapter`, which the background
// wiring injects. That keeps the controller a pure, Node/Vitest-loadable unit.
import {
  type IconState,
  type IconView,
  iconView,
  nextState,
} from "../lib/icon-state";

/** The browser-action surface, as the controller needs it. Re-exported view. */
export type IconRender = IconView;

/**
 * The thin platform adapter: the ONLY seam that touches `browser.action`. The
 * controller hands it the fully-resolved view; how that becomes an actual icon +
 * badge + title is the adapter's concern. Injected in tests as a recorder.
 */
export interface IconAdapter {
  render(view: IconRender): void;
}

/**
 * The injectable clock for the saved->idle auto-return. Mirrors the `setTimeout`
 * / `clearTimeout` shape so a fake clock (or Vitest fake timers) drives it
 * deterministically. The default uses the ambient globals.
 */
export interface IconClock {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

const DEFAULT_CLOCK: IconClock = {
  setTimeout: (handler, ms) =>
    globalThis.setTimeout(handler, ms) as unknown as number,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

/** How long the `saved` success state lingers before auto-returning to idle. */
const DEFAULT_SAVED_DURATION_MS = 1500;

/**
 * A render that goes nowhere — the safe default when no adapter is injected and
 * the code is running outside an extension (e.g. a unit test that forgot to pass
 * one). The real `browser.action` adapter lives in `./browser-action-adapter`
 * and is injected by the background wiring; the controller never imports it (so
 * it stays free of `webextension-polyfill`).
 */
const NULL_ADAPTER: IconAdapter = { render: (): void => {} };

export interface IconControllerOptions {
  /**
   * The platform adapter. The background wiring injects the real
   * `browser.action` adapter from `./browser-action-adapter`; tests inject a
   * recorder. Defaults to a no-op adapter so the controller is never coupled to
   * the browser API at the module level.
   */
  readonly adapter?: IconAdapter;
  /** The auto-return clock. Defaults to the ambient `setTimeout`/`clearTimeout`. */
  readonly clock?: IconClock;
  /** How long `saved` lingers (ms). Defaults to ~1.5s. */
  readonly savedDurationMs?: number;
}

/** The controller surface the background click-handler drives. */
export interface IconController {
  /** The current logical state. */
  readonly state: IconState;
  /** A clip/handoff began: idle -> clipping. */
  clipStarted(): void;
  /** The handoff was accepted: clipping -> saved (auto-returns to idle). */
  clipSucceeded(): void;
  /** The clip failed: clipping -> idle (story 21 — never stuck in flight). */
  clipFailed(): void;
  /** The desktop is locked / not ready: * -> locked. */
  lock(): void;
  /** The vault became ready: locked -> idle. */
  unlock(): void;
}

/**
 * Build a toolbar-icon controller. Renders the initial `idle` state immediately,
 * then drives the pure state machine on each intent method. The `saved` state
 * schedules a one-shot timer to return to `idle`; any other transition cancels a
 * pending timer first, so the icon can never be flipped by a stale timer.
 */
export function createIconController(
  options: IconControllerOptions = {},
): IconController {
  const adapter = options.adapter ?? NULL_ADAPTER;
  const clock = options.clock ?? DEFAULT_CLOCK;
  const savedDurationMs = options.savedDurationMs ?? DEFAULT_SAVED_DURATION_MS;

  let state: IconState = "idle";
  let savedTimer: number | null = null;

  const cancelSavedTimer = (): void => {
    if (savedTimer !== null) {
      clock.clearTimeout(savedTimer);
      savedTimer = null;
    }
  };

  // Attempt one transition. Returns true if the state actually changed (a legal,
  // non-self transition), false if it was a no-op. Renders only on a real change.
  const transition = (to: IconState): boolean => {
    const resolved = nextState(state, to);
    if (resolved === state) return false; // illegal or self -> no-op, no render
    cancelSavedTimer(); // leaving the prior state — drop any pending auto-return
    state = resolved;
    adapter.render(iconView(state));
    return true;
  };

  // Initial render (idle). This is the resting icon the user sees by default.
  adapter.render(iconView(state));

  return {
    get state(): IconState {
      return state;
    },
    clipStarted(): void {
      transition("clipping");
    },
    clipSucceeded(): void {
      if (transition("saved")) {
        // Short-lived success: schedule the auto-return to idle (story 5).
        savedTimer = clock.setTimeout(() => {
          savedTimer = null;
          transition("idle");
        }, savedDurationMs);
      }
    },
    clipFailed(): void {
      transition("idle");
    },
    lock(): void {
      transition("locked");
    },
    unlock(): void {
      transition("idle");
    },
  };
}
