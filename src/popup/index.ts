// Popup entry point — the honest clip-feedback surface.
//
// This file owns the popup's WIRING: it triggers a clip via the background, then
// renders ONE of four honest states for the outcome (task 8). The load-bearing
// COPY and the pure outcome -> state/view mapping live in `./copy` so the
// strings have a single source of truth (sub-feature 4 / clip-time-ux adopts the
// final toast UX against them; the task-10 E2E asserts the exact copy a user
// sees). The honesty contract is SYNC-13: the in-browser confirm means "handoff
// accepted", NEVER "encrypted + written" — the desktop is the sole write
// authority, so this popup never claims a write that may not have happened.
//
// Keyless by design: the popup never holds a vault key and NEVER writes a clip
// buffer to browser storage (SYNC-1a — zero plaintext-at-rest in the browser).
// There is deliberately no `chrome.storage` / `browser.storage` write path here:
// on a `locked` reply the popup prompts the user to unlock and captures NOTHING;
// on a closed/error outcome it captures nothing either. Adding a storage clip
// buffer here would be a boundary violation, not a feature.
import browser from "webextension-polyfill";

import type { ClipOutcome } from "../background/clip";
import {
  type PopupState,
  type StateView,
  stateForOutcome,
  viewForOutcome,
} from "./copy";

// Re-export the wire/outcome types so existing importers and the task-10 E2E can
// reach them from the popup module too.
export type { ClipOutcome } from "../background/clip";
export { type PopupState, stateForOutcome, viewForOutcome } from "./copy";

function render(state: PopupState, view: StateView): void {
  const root = document.getElementById("app");
  if (!root) {
    return;
  }

  root.dataset.state = state;
  root.replaceChildren();

  const title = document.createElement("h1");
  title.className = "popup__title";
  title.textContent = view.title;

  const body = document.createElement("p");
  body.className = "popup__body";
  body.textContent = view.body;

  root.append(title, body);

  if (view.action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "popup__action";
    button.textContent = view.action;
    // Observability hook for the E2E scenarios (task 10): e.g. the locked-state
    // "Unlock Myne" prompt and the closed-state "Open Myne to clip" prompt.
    button.dataset.testid = `popup-action-${state}`;
    // Stub affordance: the real unlock / open flows are wired in later
    // sub-features. It is a UI affordance ONLY — it never writes a clip buffer.
    button.addEventListener("click", () => {
      // Intentionally a no-op in the foundation. NO storage write, ever.
    });
    root.append(button);
  }
}

/**
 * Render the popup for a given honest clip outcome.
 *
 * Exported so the outcome -> surface mapping is testable without a live host. It
 * NEVER persists anything — rendering any state writes zero bytes to storage.
 */
export function renderForOutcome(outcome: ClipOutcome): void {
  render(stateForOutcome(outcome), viewForOutcome(outcome));
}

function isClipOutcome(v: unknown): v is ClipOutcome {
  if (typeof v !== "object" || v === null) return false;
  const status = (v as { status?: unknown }).status;
  return (
    status === "accepted" ||
    status === "error" ||
    status === "locked" ||
    status === "unreachable"
  );
}

// The honest pending state while we wait for the background's outcome: the
// desktop-closed surface. We do NOT show a success or "ready" claim before the
// desktop has actually accepted the handoff (SYNC-13). A thrown / malformed /
// unparseable result also lands on this honest closed state — never a fake
// success. No storage access on boot; nothing is ever queued (SYNC-1a).
const PENDING: ClipOutcome = { status: "unreachable" };

// Boot: trigger a clip of the active tab via the background, then render the
// outcome. The background does the capture + native-messaging handoff (the
// popup holds no key and never touches the host directly).
renderForOutcome(PENDING);
browser.runtime
  .sendMessage({ type: "myne-clip" })
  .then((outcome) => {
    if (isClipOutcome(outcome)) renderForOutcome(outcome);
  })
  .catch(() => {
    // Background unreachable (cold service worker race / no listener) → keep the
    // honest closed state, never a fake success.
    renderForOutcome(PENDING);
  });
