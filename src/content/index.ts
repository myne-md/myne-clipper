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

// Reply to a capture request with the functional clip. Returning a Promise from
// the listener (under `webextension-polyfill`) sends the response, so the
// background's `tabs.sendMessage` resolves with the `CapturedClip`.
browser.runtime.onMessage.addListener(
  (message: unknown): Promise<CapturedClip> | undefined => {
    if (!isCaptureRequest(message)) return undefined;
    return Promise.resolve(captureClip());
  },
);

// Wire the in-page capture notices (the success toast + the locked prompt). The
// background drives them by message on `accepted` / `locked` outcomes. Guarded
// against double-registration on re-injection.
setupNotices();

export {};
