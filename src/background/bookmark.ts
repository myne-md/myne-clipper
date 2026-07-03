// The BOOKMARK handler — the SECONDARY capture action (url-bookmark task 1).
//
// SYNC-3: the toolbar/action click is reserved for the full-article CLIP. The
// bookmark is the lighter, far-more-frequent gesture, bound ONLY to the browser
// CONTEXT-MENU entry and a keyboard COMMAND (the thin adapters live in the
// background entry, `./index.ts`). One gesture, instant: it reads the active
// tab's `url` + `title`, builds a CONTENT-LIGHT payload (url + title only — no
// folder, no tags, no metadata-entry popup, SYNC-15/SYNC-16), and dispatches it
// across the foundation's native-messaging bridge.
//
// Keyless by design (A14): this holds no vault key and decrypts nothing. It does
// NOT extract article markdown (that is the clip path's job) — a bookmark is the
// degenerate clip. It writes nothing to storage (SYNC-1a) and sources no vault
// structure (SYNC-15).
//
// ## Reuse + testability
//
// The bookmark is a SECOND TRIGGER into the SAME transport, not a new wire
// contract: the default bridge (`./bookmark-adapter`) builds the foundation's
// versioned `HandoffEnvelope` (SYNC-10) and sends it via the foundation's
// `sendEnvelopeToHost` over `runtime.connectNative` (TB10) — the exact path the
// clip uses.
//
// This module imports NO `webextension-polyfill` / `browser.*` — the impure
// platform seams (the real tab accessor + the real native-messaging bridge) live
// in `./bookmark-adapter`, which the background wiring injects. That keeps this
// handler a PURE, Node/Vitest-loadable unit, tested with NO `browser` global and
// NO real native-messaging port (the same discipline the icon controller uses).
//
// NOTE (task-2 seam): this task carries a content-light payload with AT LEAST the
// url + title across the bridge. The exact SYNC-10 bookmark envelope field shape
// (the formal `capture_kind="bookmark"` degenerate-clip wire form) is formalized
// in task 2; the default bridge already maps onto it, so task 2 refines only the
// body composition, not this trigger.
import { safeHttpUrl } from "../lib/markdown-safe";

import type { CaptureKind, ClipOutcome } from "./clip";

/**
 * The minimal slice of the active tab the bookmark needs. Mirrors the
 * `Tabs.Tab` fields we read — `url` + `title`. `activeTab` (already granted on
 * the user gesture) makes these readable without a broad host permission.
 */
export interface BookmarkTab {
  readonly url?: string;
  readonly title?: string;
}

/** Resolves the active tab (or `null` when there is no usable active tab). */
export type BookmarkTabAccessor = () => Promise<BookmarkTab | null>;

/**
 * The CONTENT-LIGHT bookmark payload (url + title + capture provenance).
 *
 * Deliberately carries NO `destinationFolder`, NO `tags`, and NO extracted
 * article `markdownBody` — a bookmark is url+title only (SYNC-15/SYNC-16). The
 * default bridge maps this onto the foundation's SYNC-10 `HandoffEnvelope`.
 */
export interface BookmarkPayload {
  readonly captureKind: CaptureKind;
  /** The page URL (provenance; written verbatim, never fetched — SYNC-12). */
  readonly sourceUrl: string;
  /** The page title (becomes the note's name desktop-side). */
  readonly title: string;
  /** ISO-8601 capture timestamp (provenance). */
  readonly clipDate: string;
}

/**
 * The bridge client seam: takes a content-light bookmark payload and dispatches
 * it across the native-messaging transport, resolving with the host's honest
 * outcome. Injected as a recorder in tests; the default
 * (`./bookmark-adapter#defaultBookmarkBridge`) reuses the foundation's
 * `sendEnvelopeToHost`.
 */
export interface BookmarkBridge {
  dispatch(payload: BookmarkPayload): Promise<ClipOutcome>;
}

export interface BookmarkOptions {
  /** Resolves the active tab to read `url` + `title` from. */
  readonly getActiveTab: BookmarkTabAccessor;
  /** Dispatches the content-light payload across the bridge. */
  readonly bridge: BookmarkBridge;
  /**
   * An escape hatch the bookmark handler MUST NEVER call — a bookmark opens no
   * popup / picker (one gesture, instant). Present only so a test can assert it
   * is never reached; the production wiring never passes it.
   */
  readonly openPicker?: () => void;
}

/**
 * Read the active tab's `url` + `title`, build a content-light bookmark payload,
 * and dispatch it across the bridge. Returns the host's honest outcome verbatim.
 *
 * A no-op (returns an `error` outcome, dispatches NOTHING) when there is no
 * active tab or the tab has no URL — there is nothing to bookmark. Opens no
 * popup / picker.
 */
export async function bookmarkActiveTab(
  options: BookmarkOptions,
): Promise<ClipOutcome> {
  const tab = await options.getActiveTab();
  // Gate the tab URL to http(s) — the URL is the load-bearing field of a
  // bookmark, and a non-http(s) tab (`file://` / `data:` / `about:` / `blob:` …)
  // must NOT be emitted verbatim into the note. This mirrors the content-clip
  // path's `safeSourceUrl` first-line guard (both share `safeHttpUrl`); a
  // non-http(s) page is honestly un-bookmarkable rather than silently leaking a
  // local path / inline blob across TB10 (the desktop re-validates too, but the
  // two producer paths now apply the SAME first-line gate).
  const url = tab && typeof tab.url === "string" ? safeHttpUrl(tab.url) : "";
  if (tab === null || url === "") {
    return { status: "error", reason: "nothing_to_bookmark" };
  }

  const payload: BookmarkPayload = {
    captureKind: "bookmark",
    sourceUrl: url,
    // The URL is the load-bearing field; an absent title is fine (desktop-ingest
    // falls back). Never reach for a popup to ask for one (one gesture, instant).
    title: typeof tab.title === "string" ? tab.title : "",
    clipDate: new Date().toISOString(),
  };

  return await options.bridge.dispatch(payload);
}
