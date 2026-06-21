// The locked/closed/unpaired prompt CONTROLLER (clip-time-ux sub-feature 4,
// task 7). Same pure + injectable shape as the toast controller.
//
// Owns the prompt BEHAVIOR:
//   - SINGLE-PROMPT: a new prompt replaces the prior immediately (no stack).
//   - NO AUTO-DISMISS: a prompt persists until the user activates or dismisses it
//     (it is an actionable "Myne isn't ready" surface, not a fleeting status).
//   - ACTIVATE: clicking the surface invokes the injected open/foreground call
//     (the bridge transport — launch-if-closed), then dismisses.
//   - DISMISS retains NO state — no queued clip, no auto-replay (story 17). The
//     controller writes nothing and stores nothing across a dismiss.
//
// Timing + the `prefers-reduced-motion` read are INJECTED so the controller is
// unit-tested with a fake surface + fake clock. The DOM mounting
// (`./prompt-surface`) is the thin adapter.
import {
  buildPromptModel,
  type PromptKind,
  type PromptModel,
} from "../lib/prompt-model";

import type { PromptHandlers } from "./prompt-view";

/** A live prompt the surface mounted. */
export interface PromptHandle {
  markLeaving(): void;
  remove(): void;
}

/** The DOM seam: mount a prompt for a model + handlers, return its handle. */
export interface PromptSurface {
  mount(model: PromptModel, handlers: PromptHandlers): PromptHandle;
}

/** Injectable timer pair (only used for the brief leave animation). */
export interface PromptClock {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

const DEFAULT_CLOCK: PromptClock = {
  setTimeout: (h, ms) => globalThis.setTimeout(h, ms) as unknown as number,
  clearTimeout: (h) => globalThis.clearTimeout(h),
};

/** Leave-animation duration (ms) before removal (matches `--duration-base`). */
const DEFAULT_EXIT_MS = 180;

export interface PromptControllerOptions {
  readonly surface: PromptSurface;
  readonly clock?: PromptClock;
  readonly exitMs?: number;
  readonly reducedMotion?: () => boolean;
  /** The open/foreground-the-desktop call (the bridge transport; task 7 invokes). */
  readonly onActivate: () => void;
}

export interface PromptController {
  /** Show the prompt for a not-ready state (replacing any current prompt). */
  show(kind: PromptKind): void;
  /** Dismiss the current prompt, if any. Retains no state. */
  dismiss(): void;
  /** Tear the current prompt out IMMEDIATELY (no exit animation). Used when a
   *  DIFFERENT surface (a toast) takes over, so the two never briefly stack in
   *  the shared anchor. Retains no state, exactly like `dismiss()`. */
  clear(): void;
  /** Whether a prompt is currently mounted. */
  readonly isShowing: boolean;
  /** Which kind is showing, or `null`. */
  readonly currentKind: PromptKind | null;
}

/**
 * Build a single-prompt controller. `show(kind)` mounts the right presentation
 * (locked/closed/unpaired), replacing any current prompt; clicking the surface
 * invokes `onActivate` then dismisses. Nothing is stored across a dismiss.
 */
export function createPromptController(
  options: PromptControllerOptions,
): PromptController {
  const surface = options.surface;
  const clock = options.clock ?? DEFAULT_CLOCK;
  const exitMs = options.exitMs ?? DEFAULT_EXIT_MS;
  const reducedMotion = options.reducedMotion ?? (() => false);

  let current: PromptHandle | null = null;
  let kind: PromptKind | null = null;
  let exitTimer: number | null = null;

  const hardRemove = (): void => {
    if (exitTimer !== null) {
      clock.clearTimeout(exitTimer);
      exitTimer = null;
    }
    if (current !== null) {
      current.remove();
      current = null;
      kind = null;
    }
  };

  const dismiss = (): void => {
    if (current === null) return;
    if (exitTimer !== null) return; // already leaving
    const handle = current;
    if (reducedMotion()) {
      handle.remove();
      current = null;
      kind = null;
      return;
    }
    handle.markLeaving();
    exitTimer = clock.setTimeout(() => {
      handle.remove();
      if (current === handle) {
        current = null;
        kind = null;
      }
      exitTimer = null;
    }, exitMs);
  };

  return {
    show(next: PromptKind): void {
      hardRemove(); // replace, never stack
      const model = buildPromptModel(next);
      const handlers: PromptHandlers = {
        onActivate: () => {
          // Invoke the open/foreground transport, then dismiss (the user acted).
          options.onActivate();
          dismiss();
        },
        onDismiss: () => dismiss(),
      };
      current = surface.mount(model, handlers);
      kind = next;
    },
    dismiss(): void {
      dismiss();
    },
    clear(): void {
      hardRemove();
    },
    get isShowing(): boolean {
      return current !== null;
    },
    get currentKind(): PromptKind | null {
      return kind;
    },
  };
}
