// The toolbar-action handler core (clip-time-ux sub-feature 4, task 8).
//
// The browser-action click entrypoint that ties the slice together. It:
//   0. drops the gesture outright if an earlier one is still in flight, so one
//      gesture is one note (the in-flight gate below);
//   1. reads the desktop vault state via the `is-unlocked-status` bridge FIRST
//      (not a structure read — only unlocked/locked/closed/unpaired);
//   2. branches:
//        unlocked  → icon `clipping` → run the clip handoff →
//                    accepted: icon `saved` + the "Saved to Myne — view" toast;
//                    locked  (raced mid-flight): icon `locked` + locked prompt;
//                    closed  (host vanished):    icon reset + closed prompt;
//                    error:   icon reset + the error result (task 11 surfaces it);
//        locked    → icon `locked` + locked prompt, capturing NOTHING;
//        closed    → icon `locked` + closed prompt, capturing NOTHING;
//        unpaired  → INITIATE PAIRING (the desktop Accept dialog), then on Accept
//                    proceed to clip the clicked page; on decline/closed, prompt.
//
// The unpaired case makes the TOOLBAR CLICK the pairing gesture (no hidden
// keyboard shortcut): there is no token yet, so the click sends a `pair` request,
// the user Accepts on the desktop (SYNC-6), the token is stored, and we continue
// to clip. A reject/timeout re-shows the pair prompt; a closed desktop shows the
// open-Myne prompt. Nothing is captured until the vault is paired AND unlocked.
//
// Dependency-injected: every side effect (status read, clip, icon, the in-page
// toast/prompt) is a passed-in function, so the whole branch table is unit-tested
// with no browser, no host, no DOM. The real wiring (`./index`) supplies the live
// bridge + icon controller + tab messaging. The one piece of module state is the
// in-flight gate below — a gesture counter, not a side effect.
//
// SYNC-15: the clip handoff carries `destination_folder` null + empty `tags`
// (owned by the envelope builder); no folder/tag/structure ever crosses TB10
// here. No clip is captured on any not-ready branch (SYNC-1a).
import { PAIRING_NOTICE, SAVING_NOTICE } from "../lib/load-bearing-copy";
import type { PromptKind } from "../lib/prompt-model";

import type { ClipOutcome } from "./clip";
import type { PairOutcome } from "./pair";
import type { VaultStatus } from "./status-wire";

/** Which capture-success toast a landed outcome shows. */
export type ToastVariant = "clip" | "bookmark";

/** The (testable) result of one toolbar click. */
export type ToolbarOutcome =
  | { readonly kind: "clipped"; readonly variant: ToastVariant }
  | { readonly kind: "prompt"; readonly promptKind: PromptKind }
  | { readonly kind: "error"; readonly reason: string }
  /** A gesture that arrived while a capture was already in flight, and was
   *  dropped so the desktop writes ONE note per gesture (see the gate below). */
  | { readonly kind: "dropped" };

/** The icon transitions the handler drives (a subset of the controller). */
export interface ToolbarIcon {
  clipStarted(): void;
  clipSucceeded(): void;
  clipFailed(): void;
  lock(): void;
}

export interface ToolbarHandlerDeps {
  /** Read the desktop vault status (the `is-unlocked-status` bridge). */
  readonly queryStatus: () => Promise<VaultStatus>;
  /** Run the clip handoff (capture → envelope → host), returning its outcome. */
  readonly clip: () => Promise<ClipOutcome>;
  /** The toolbar icon controller (idle/clipping/saved/locked transitions). */
  readonly icon: ToolbarIcon;
  /** Show the in-page success toast for a landed capture. */
  readonly showToast: (variant: ToastVariant) => Promise<void>;
  /** Show the in-page locked/closed/unpaired prompt. */
  readonly showPrompt: (kind: PromptKind) => Promise<void>;
  /** Show the in-page honest failure toast for a host error reason (task 11). */
  readonly showError: (reason: string) => Promise<void>;
  /** Show the in-flight "Saving to Myne…" banner (replaced by the outcome). */
  readonly showProgress: (message: string) => Promise<void>;
  /**
   * Initiate the pairing handshake (the desktop Accept dialog) and report the
   * outcome. Called when the vault is `unpaired` — the toolbar click IS the pair
   * gesture. On `paired` the token is stored durably before this resolves.
   */
  readonly requestPair: () => Promise<PairOutcome>;
}

/** The toast variant for a landed outcome (a bookmark reads "Sent to Myne"). */
function variantFor(outcome: ClipOutcome & { status: "accepted" }): ToastVariant {
  return outcome.captureKind === "bookmark" ? "bookmark" : "clip";
}

// ONE capture per gesture. The toolbar action, both clip context-menu entries,
// the bookmark entry and the bookmark command are five independent triggers that
// all land here, and this handler holds a window open for seconds: the status
// round trip (with a possible cold host spawn), the bundle injection, the
// capture, and a handoff bounded only by clip.ts's 35 s reply timeout. A second
// gesture inside that window used to run a fully independent capture + handoff,
// so the desktop wrote a SECOND note — and nothing downstream collapses them: the
// handoff envelope carries no request id, and desktop ingest deliberately does
// not dedupe (SYNC-16 ratifies "re-clip = no detection" for a user clipping the
// same page twice ON PURPOSE; it does not cover one gesture counted twice). The
// duplicate is silent, too, because the overlay shows one toast at a time — the
// second replaces the first rather than stacking.
//
// The `clipping` icon state cannot serve as this gate, despite its own comment
// naming it "do not click again". It is a DISPLAY state the locked branch and the
// passive status poller also drive, and `locked -> clipping` / `saved ->
// clipping` are illegal in the transition table — so gating on it would silently
// swallow the click a user makes right after unlocking Myne, or within the 1.5 s
// success window, which is a clip they are owed.
let captureInFlight = false;

/**
 * Handle one toolbar clip click. Reads vault state, then: `unpaired` → initiate
 * pairing then clip; `unlocked` → clip; `locked`/`closed` → the honest prompt
 * (capturing nothing). A gesture arriving while an earlier one is still in flight
 * is dropped (`kind: "dropped"`) — the in-flight "Saving to Myne…" banner is
 * already the user's feedback. Returns the outcome for observability/testing.
 * Never throws on a bridge/host failure — a closed desktop or a flaky handoff
 * degrades to an honest prompt/error.
 */
export async function handleClipClick(
  deps: ToolbarHandlerDeps,
): Promise<ToolbarOutcome> {
  if (captureInFlight) return { kind: "dropped" };
  captureInFlight = true;
  try {
    return await routeFromStatus(deps);
  } finally {
    // `finally`, not a tail assignment: a dep that throws must reopen the gate,
    // or one bad handoff wedges every later gesture for the worker's lifetime.
    captureInFlight = false;
  }
}

/** The gated body: read vault state and take the matching branch. */
async function routeFromStatus(
  deps: ToolbarHandlerDeps,
): Promise<ToolbarOutcome> {
  const status = await deps.queryStatus();
  if (status === "unpaired") {
    return await initiatePairingThenClip(deps);
  }
  return await proceedFromStatus(deps, status);
}

/**
 * Branch on a (PAIRED) vault status: `unlocked` → clip; `locked`/`closed` →
 * prompt, capturing nothing. (`unpaired` is handled before this is reached; if it
 * somehow appears here it is treated as a not-ready prompt without locking the
 * icon — the original SYNC-1a nuance.)
 */
async function proceedFromStatus(
  deps: ToolbarHandlerDeps,
  status: VaultStatus,
): Promise<ToolbarOutcome> {
  if (status === "unlocked") {
    return await runClipPath(deps);
  }
  // locked / closed (/ defensively unpaired) — capture NOTHING; honest prompt.
  if (status !== "unpaired") deps.icon.lock();
  await deps.showPrompt(status);
  return { kind: "prompt", promptKind: status };
}

/**
 * The unpaired path: the toolbar click IS the pairing gesture. Initiate pairing
 * (the desktop Accept dialog); on Accept the token is stored, so we re-read the
 * now-authenticated vault state and proceed to clip the clicked page. A
 * reject/timeout re-shows the pair prompt (the next click retries); a locked
 * desktop shows the unlock prompt; a closed desktop shows the open-Myne prompt.
 */
async function initiatePairingThenClip(
  deps: ToolbarHandlerDeps,
): Promise<ToolbarOutcome> {
  // Show the in-flight pairing banner so the user knows to approve on the desktop.
  await deps.showProgress(PAIRING_NOTICE);
  const pair = await deps.requestPair();

  if (pair.kind === "paired") {
    // Paired — the token is stored, so a re-read never returns `unpaired`.
    const status = await deps.queryStatus();
    if (status === "unpaired") {
      // Defensive: the just-stored token didn't take → treat as not ready.
      await deps.showPrompt("closed");
      return { kind: "prompt", promptKind: "closed" };
    }
    return await proceedFromStatus(deps, status);
  }

  if (pair.kind === "unreachable") {
    deps.icon.lock();
    await deps.showPrompt("closed");
    return { kind: "prompt", promptKind: "closed" };
  }

  // rejected: a LOCKED desktop → the unlock prompt; a decline/timeout → the pair
  // prompt again (the next click re-initiates).
  const promptKind: PromptKind = pair.reason === "locked" ? "locked" : "unpaired";
  if (promptKind === "locked") deps.icon.lock();
  await deps.showPrompt(promptKind);
  return { kind: "prompt", promptKind };
}

/** The unlocked clip path: icon idle→clipping, run the handoff, branch on its outcome. */
async function runClipPath(deps: ToolbarHandlerDeps): Promise<ToolbarOutcome> {
  deps.icon.clipStarted();
  // Show the in-flight "Saving to Myne…" banner (the middle state). The outcome
  // toast/prompt replaces it (single-toast).
  await deps.showProgress(SAVING_NOTICE);
  const outcome = await deps.clip();

  switch (outcome.status) {
    case "accepted": {
      deps.icon.clipSucceeded();
      const variant = variantFor(outcome);
      await deps.showToast(variant);
      return { kind: "clipped", variant };
    }
    case "locked": {
      // Raced: the vault locked between the status read and the handoff.
      deps.icon.lock();
      await deps.showPrompt("locked");
      return { kind: "prompt", promptKind: "locked" };
    }
    case "unreachable": {
      // The host vanished mid-handoff → the closed-desktop prompt.
      deps.icon.clipFailed();
      await deps.showPrompt("closed");
      return { kind: "prompt", promptKind: "closed" };
    }
    case "error": {
      // A flaky/rejected handoff (story 20/21): reset the icon to idle so the user
      // can retry immediately (never stuck in clipping), and show the honest
      // error toast — NEVER a "Saved" success.
      deps.icon.clipFailed();
      await deps.showError(outcome.reason);
      return { kind: "error", reason: outcome.reason };
    }
  }
}
