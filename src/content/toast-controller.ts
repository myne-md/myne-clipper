// The clip-success toast CONTROLLER (clip-time-ux sub-feature 4, task 6).
//
// Owns the toast BEHAVIOR, kept pure + injectable (the icon-controller pattern):
//   - SINGLE-TOAST: a new toast replaces the prior one immediately — never a
//     stack (story 23). Only one toast is ever mounted.
//   - AUTO-DISMISS after ~2500ms AND a manual dismiss control (story 22).
//   - REDUCED MOTION: the exit normally plays a brief leave animation, then
//     removes; under `prefers-reduced-motion` it removes IMMEDIATELY (no wait)
//     (story 24).
//   - VIEW: the inline "view" action invokes the injected open-note call, then
//     dismisses (the click is the "handled" signal — story 4).
//
// All timing + the platform `prefers-reduced-motion` read are INJECTED, so the
// whole controller is unit-tested with a fake surface + fake clock + a boolean.
// The real DOM mounting (`./toast-surface`) is the thin adapter.
import {
  buildErrorToastModel,
  buildInfoToastModel,
  buildProgressToastModel,
  buildToastModel,
  type ToastModel,
} from "../lib/toast-model";
import type { ToastHandlers } from "./toast-view";

/** A live toast the surface mounted: it can animate-out and remove itself. */
export interface ToastHandle {
  /** Flag the toast as leaving (the surface plays the exit animation). */
  markLeaving(): void;
  /** Remove the toast from the DOM. */
  remove(): void;
}

/** The DOM seam: mount a toast for a model + handlers, return its handle. */
export interface ToastSurface {
  mount(model: ToastModel, handlers: ToastHandlers): ToastHandle;
}

/** Injectable timer pair (mirrors `setTimeout`/`clearTimeout`). */
export interface ToastClock {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

const DEFAULT_CLOCK: ToastClock = {
  setTimeout: (h, ms) => globalThis.setTimeout(h, ms) as unknown as number,
  clearTimeout: (h) => globalThis.clearTimeout(h),
};

/** How long a toast lingers before auto-dismiss. */
const DEFAULT_AUTO_DISMISS_MS = 2500;
/** How long the leave animation runs before removal (matches `--duration-base`). */
const DEFAULT_EXIT_MS = 180;

export interface ToastControllerOptions {
  /** The DOM mount seam (the real adapter, or a recorder in tests). */
  readonly surface: ToastSurface;
  /** Timer source. Defaults to ambient `setTimeout`/`clearTimeout`. */
  readonly clock?: ToastClock;
  /** Auto-dismiss delay (ms). Defaults to ~2500. */
  readonly autoDismissMs?: number;
  /** Leave-animation duration (ms) before removal. Defaults to ~180. */
  readonly exitMs?: number;
  /** Whether the user prefers reduced motion (skip the leave animation). */
  readonly reducedMotion?: () => boolean;
  /** The "view the saved note" call (the bridge open/foreground-note transport). */
  readonly onView?: () => void;
}

export interface ToastController {
  /** Show the "Saved to Myne" clip toast (with a "view" action). */
  showClip(): void;
  /** Show the "Sent to Myne" bookmark toast (no "view" action). */
  showBookmark(): void;
  /** Show an honest failure toast for a host error reason (task 11; never "Saved"). */
  showError(reason: string): void;
  /** Show an in-flight PROGRESS toast (a spinner + message); it does NOT
   *  auto-dismiss — the outcome (saved/error/prompt) replaces it. */
  showProgress(message: string): void;
  /** Show a generic success INFO toast (e.g. "Paired with Myne"); auto-dismisses. */
  showInfo(message: string): void;
  /** Dismiss the current toast, if any (manual / programmatic). */
  dismiss(): void;
  /** Tear the current toast out IMMEDIATELY (no exit animation). Used when a
   *  DIFFERENT surface (the prompt) takes over, so the two never briefly stack
   *  in the shared anchor — `dismiss()` keeps its 180 ms fade for the same-
   *  surface auto/manual case. */
  clear(): void;
  /** Whether a toast is currently mounted (test/observability aid). */
  readonly isShowing: boolean;
}

/**
 * Build a single-toast controller. `showClip`/`showBookmark` mount the right
 * model (replacing any current toast); the toast auto-dismisses after the delay
 * or on manual dismiss / view-click.
 */
export function createToastController(
  options: ToastControllerOptions,
): ToastController {
  const surface = options.surface;
  const clock = options.clock ?? DEFAULT_CLOCK;
  const autoDismissMs = options.autoDismissMs ?? DEFAULT_AUTO_DISMISS_MS;
  const exitMs = options.exitMs ?? DEFAULT_EXIT_MS;
  const reducedMotion = options.reducedMotion ?? (() => false);

  let current: ToastHandle | null = null;
  let autoTimer: number | null = null;
  let exitTimer: number | null = null;

  const clearTimer = (h: number | null): void => {
    if (h !== null) clock.clearTimeout(h);
  };

  // Tear the current toast out immediately (no animation) and reset all timers —
  // used when a new toast replaces the prior (single-toast, no stack).
  const hardRemove = (): void => {
    clearTimer(autoTimer);
    clearTimer(exitTimer);
    autoTimer = null;
    exitTimer = null;
    if (current !== null) {
      current.remove();
      current = null;
    }
  };

  const dismiss = (): void => {
    if (current === null) return;
    if (exitTimer !== null) return; // already leaving — ignore repeat dismiss
    clearTimer(autoTimer);
    autoTimer = null;
    const handle = current;
    if (reducedMotion()) {
      // No motion to play — remove at once (story 24).
      handle.remove();
      current = null;
      return;
    }
    handle.markLeaving();
    exitTimer = clock.setTimeout(() => {
      handle.remove();
      if (current === handle) current = null;
      exitTimer = null;
    }, exitMs);
  };

  // `autoDismiss` defaults true (the success/error toasts auto-dismiss); a
  // PROGRESS toast passes false — it persists until the outcome toast replaces it.
  const show = (model: ToastModel, autoDismiss = true): void => {
    hardRemove(); // replace, never stack
    const handlers: ToastHandlers = {
      onDismiss: () => dismiss(),
      onView: model.viewAction
        ? () => {
            // Invoke the bridge open/foreground-note call, then dismiss — the
            // click is the "handled" signal (story 4).
            options.onView?.();
            dismiss();
          }
        : undefined,
    };
    current = surface.mount(model, handlers);
    if (autoDismiss) {
      autoTimer = clock.setTimeout(() => dismiss(), autoDismissMs);
    }
  };

  return {
    showClip(): void {
      show(buildToastModel("clip"));
    },
    showBookmark(): void {
      show(buildToastModel("bookmark"));
    },
    showError(reason: string): void {
      show(buildErrorToastModel(reason));
    },
    showProgress(message: string): void {
      // No auto-dismiss: the in-flight banner stays until the outcome replaces it.
      show(buildProgressToastModel(message), false);
    },
    showInfo(message: string): void {
      show(buildInfoToastModel(message));
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
  };
}
