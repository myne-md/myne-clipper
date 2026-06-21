// The REAL platform seams for the bookmark handler (url-bookmark task 1).
//
// This is the impure half of the bookmark — the ONLY place the bookmark touches
// `browser.tabs` and the native-messaging transport. It is split out from the
// pure handler (`./bookmark`) on purpose, exactly like the icon controller's
// `./browser-action-adapter` split: the handler stays a PURE injectable unit (no
// `webextension-polyfill` import, so it loads under Node/Vitest), while this file
// — which imports the polyfill and would throw outside an extension — is imported
// only by the background wiring that actually runs inside the extension.
import browser from "webextension-polyfill";

import type { BookmarkBridge, BookmarkPayload, BookmarkTab } from "./bookmark";
import { type ClipOutcome, sendEnvelopeToHost } from "./clip";
import { buildBookmarkEnvelope } from "./envelope";
import { getPairingToken } from "./pairing-token";

/**
 * The default tab accessor: read the active tab in the current window. `url` +
 * `title` are populated under `activeTab` (the user-gesture host grant) without a
 * broad host permission.
 */
export async function defaultBookmarkTabAccessor(): Promise<BookmarkTab | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  return { url: tab.url, title: tab.title };
}

/**
 * The default bridge: build the foundation's versioned `HandoffEnvelope`
 * (SYNC-10) for the bookmark case and dispatch it via the foundation's
 * `sendEnvelopeToHost` — the EXACT native-messaging transport the clip uses. A
 * bookmark is a degenerate clip on the one channel, not a second wire contract.
 *
 * The SYNC-10 bookmark wire shape is formalized in the PURE `./envelope` module
 * (`buildBookmarkEnvelope`) — a degenerate clip byte-shape-identical to a content
 * clip except `capture_kind = "bookmark"`, `image_bytes = []`,
 * `destination_folder = null` (SYNC-15), and a content-light body. This seam only
 * supplies the live `browser.runtime.id` + pairing token, then reuses the SAME
 * `sendEnvelopeToHost` transport the clip uses.
 */
export function defaultBookmarkBridge(): BookmarkBridge {
  return {
    async dispatch(payload: BookmarkPayload): Promise<ClipOutcome> {
      // `getPairingToken` is now async (durable, `storage.local`-backed); await
      // the credential before building the handoff.
      const token = await getPairingToken();
      if (token === null) {
        // Not paired — no scoped token to present. The host would stay silent to
        // an unpaired caller, so surface the honest unreachable state.
        return { status: "unreachable" };
      }
      const envelope = buildBookmarkEnvelope({
        extensionId: browser.runtime.id,
        token,
        payload,
      });
      return sendEnvelopeToHost(envelope, "bookmark");
    },
  };
}
