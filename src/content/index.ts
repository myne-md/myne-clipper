// Content script entry point (runs in the adversary-controlled page DOM).
//
// FOUNDATION SCOPE — the tracer-bullet capture path. This entry registers a
// one-shot message listener: when the background asks it to capture (after the
// background injects this bundle into the active tab on a user gesture via
// `activeTab` + `scripting`), it runs the FUNCTIONAL (not faithful) in-page
// HTML->markdown extraction in `capture.ts` and returns the clip.
//
// Faithful Defuddle -> canonical-D1 extraction is sub-feature 2's gate, NOT
// this one. No new dependency is pulled in (SYNC-5).
//
// It is NOT auto-injected by the manifest (no `content_scripts` block, no host
// permissions); the background injects it on demand via `activeTab` +
// `scripting`, never via a broad `<all_urls>` match. It holds no key and writes
// nothing to storage (SYNC-1a).
import browser from "webextension-polyfill";

import { captureClip, type CapturedClip } from "./capture";
import { setupNotices } from "./notices";

/** The message the background sends to trigger an in-page capture. */
interface CaptureRequest {
  readonly type: "myne-capture";
}

function isCaptureRequest(msg: unknown): msg is CaptureRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "myne-capture"
  );
}

/**
 * Global guard so re-injection of this bundle doesn't double-register — the same
 * shape, and the same reason, as `setupNotices`' `__myneClipNotices` flag.
 *
 * The background injects this bundle on EVERY clip gesture (three injecting
 * steps per toolbar click, two per bookmark), and injection re-executes the
 * module in the same isolated world; only a navigation clears it. So this
 * listener stacked one copy per click and stayed for the tab's lifetime, and
 * every copy answers — the first responder's clip wins, so the clip itself was
 * always correct and the cost was invisible. What grew was the work: the 10th
 * clip on one page ran 29 full-page DOM walks on the page's own main thread
 * instead of one, which on a long article is a visible stall in the user's page.
 *
 * The sibling in this same bundle was already guarded, and its header states the
 * re-injection premise outright. Only this listener was missed.
 */
const CAPTURE_FLAG = "__myneClipCapture";

/**
 * Reply to a capture request with the functional clip. Returning a Promise from
 * the listener (under `webextension-polyfill`) sends the response, so the
 * background's `tabs.sendMessage` resolves with the `CapturedClip`.
 *
 * Idempotent, like `setupNotices`: safe to call on every injection.
 */
function setupCaptureListener(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g[CAPTURE_FLAG] === true) return;
  g[CAPTURE_FLAG] = true;

  browser.runtime.onMessage.addListener(
    (message: unknown): Promise<CapturedClip> | undefined => {
      if (!isCaptureRequest(message)) return undefined;
      return Promise.resolve(captureClip());
    },
  );
}

setupCaptureListener();

// Wire the in-page capture notices (the success toast + the locked prompt). The
// background drives them by message on `accepted` / `locked` outcomes. Guarded
// against double-registration on re-injection.
setupNotices();

export {};
