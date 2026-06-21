// The in-page capture-notice wiring (clip-time-ux task 6; extended by task 7).
//
// Runs in the content script. It owns the singleton toast controller (task 6)
// and, later, the locked-prompt controller (task 7), and registers ONE
// `runtime.onMessage` listener that the background drives:
//   - `myne-show-toast` {variant}  → show the "Saved to Myne" / "Sent to Myne"
//     toast (the background sends this on an `accepted` handoff — task 8);
//   - `myne-show-prompt` {kind}     → show the locked/closed/unpaired prompt
//     (task 7 / task 8).
//
// Idempotent: the capture content bundle is re-injected on every clip gesture, so
// `setupNotices` guards against registering twice in the same isolated world
// (otherwise a stale controller would stack toasts). Keyless + storage-free: a
// notice writes nothing (SYNC-1a); the "view"/"open" affordances only POST a
// message to the background, which owns the bridge transport.
import browser from "webextension-polyfill";

import type { PromptKind } from "../lib/prompt-model";

import { createPromptController, type PromptController } from "./prompt-controller";
import { createDomPromptSurface } from "./prompt-surface";
import { createToastController, type ToastController } from "./toast-controller";
import { createDomToastSurface } from "./toast-surface";

/** Global guard so re-injection of the content bundle doesn't double-register. */
const SETUP_FLAG = "__myneClipNotices";

/** Background → content: show a success toast for a landed capture. */
interface ShowToastMessage {
  readonly type: "myne-show-toast";
  readonly variant: "clip" | "bookmark";
}

/** Background → content: show the locked/closed/unpaired prompt. */
interface ShowPromptMessage {
  readonly type: "myne-show-prompt";
  readonly kind: PromptKind;
}

/** Background → content: show an honest failure toast (task 11). */
interface ShowErrorMessage {
  readonly type: "myne-show-error";
  readonly reason: string;
}

/** Background → content: show an in-flight progress banner / a generic info toast. */
interface ShowMessageWithText {
  readonly type: "myne-show-progress" | "myne-show-info";
  readonly message: string;
}

function isShowToastMessage(m: unknown): m is ShowToastMessage {
  if (typeof m !== "object" || m === null) return false;
  const msg = m as { type?: unknown; variant?: unknown };
  return (
    msg.type === "myne-show-toast" &&
    (msg.variant === "clip" || msg.variant === "bookmark")
  );
}

function isProgressMessage(m: unknown): m is ShowMessageWithText {
  if (typeof m !== "object" || m === null) return false;
  const msg = m as { type?: unknown; message?: unknown };
  return msg.type === "myne-show-progress" && typeof msg.message === "string";
}

function isInfoMessage(m: unknown): m is ShowMessageWithText {
  if (typeof m !== "object" || m === null) return false;
  const msg = m as { type?: unknown; message?: unknown };
  return msg.type === "myne-show-info" && typeof msg.message === "string";
}

function isShowErrorMessage(m: unknown): m is ShowErrorMessage {
  if (typeof m !== "object" || m === null) return false;
  const msg = m as { type?: unknown; reason?: unknown };
  return msg.type === "myne-show-error" && typeof msg.reason === "string";
}

function isShowPromptMessage(m: unknown): m is ShowPromptMessage {
  if (typeof m !== "object" || m === null) return false;
  const msg = m as { type?: unknown; kind?: unknown };
  return (
    msg.type === "myne-show-prompt" &&
    (msg.kind === "locked" || msg.kind === "closed" || msg.kind === "unpaired")
  );
}

/** Whether the user asked the OS for reduced motion (skip the toast animation). */
function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Wire the capture notices into this content-script world (once). Creates the
 * toast controller bound to the real DOM surface and registers the
 * background-driven message listener. Safe to call on every injection.
 */
export function setupNotices(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g[SETUP_FLAG] === true) return;
  g[SETUP_FLAG] = true;

  const toast: ToastController = createToastController({
    surface: createDomToastSurface(),
    reducedMotion: prefersReducedMotion,
    // The "view" action asks the background to open/foreground the saved note
    // (the bridge transport is the background's; this only invokes it — task 7).
    onView: () => {
      void browser.runtime
        .sendMessage({ type: "myne-open-note" })
        .catch(() => {
          // Background unreachable — nothing to do; the user can click again.
        });
    },
  });

  const prompt: PromptController = createPromptController({
    surface: createDomPromptSurface(),
    reducedMotion: prefersReducedMotion,
    // Clicking the prompt asks the background to open/foreground (launch-if-
    // closed) the desktop. Retains no state on dismiss (story 17).
    onActivate: () => {
      void browser.runtime
        .sendMessage({ type: "myne-open-foreground" })
        .catch(() => {
          // Background unreachable — the prompt copy already told the user to
          // open Myne; nothing is stored or retried.
        });
    },
  });

  browser.runtime.onMessage.addListener((message: unknown): undefined => {
    // Cross-surface handoff uses `clear()` (instant), never `dismiss()` (180 ms
    // fade): the toast and prompt share one bottom-right anchor, so animating the
    // outgoing one out while the incoming one mounts briefly STACKS two banners
    // in the corner. `clear()` tears the old surface out in the same frame the new
    // one appears, so only ever one capture surface is visible.
    if (isShowToastMessage(message)) {
      // A success toast replaces any prompt that was up (single capture surface).
      prompt.clear();
      if (message.variant === "bookmark") toast.showBookmark();
      else toast.showClip();
    } else if (isShowErrorMessage(message)) {
      // A failure toast replaces any prompt — never a success (story 20).
      prompt.clear();
      toast.showError(message.reason);
    } else if (isProgressMessage(message)) {
      // An in-flight banner ("Saving to Myne…" / "Pairing — approve in Myne").
      // It persists until the outcome (toast/error/prompt) replaces it.
      prompt.clear();
      toast.showProgress(message.message);
    } else if (isInfoMessage(message)) {
      // A generic success notice ("Paired with Myne").
      prompt.clear();
      toast.showInfo(message.message);
    } else if (isShowPromptMessage(message)) {
      // A prompt replaces any toast (the vault went not-ready mid-flight).
      toast.clear();
      prompt.show(message.kind);
    }
    // Always returns undefined: this listener never answers the channel (the
    // capture listener in `./index` owns the capture reply). Never writes storage.
    return undefined;
  });
}
