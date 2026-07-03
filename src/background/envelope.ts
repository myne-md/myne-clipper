// The versioned ext→host handoff envelope (SYNC-10) + its PURE builders.
//
// This module is the single source of truth for the wire SHAPE the extension
// hands the desktop core over native messaging (TB10). It is deliberately PURE —
// it imports NO `webextension-polyfill` / `browser.*` — so it loads under
// Node/Vitest and the envelope shape can be asserted directly (the impure seams,
// `./clip` + `./bookmark-adapter`, call these builders and supply the
// `extension_id` / `token` from `browser.runtime.id`).
//
// The bookmark is a DEGENERATE CLIP on this one channel, not a second wire
// contract: `buildBookmarkEnvelope` and `buildContentClipEnvelope` emit the SAME
// `HandoffEnvelope` shape (same field set, same types, same schema `version`),
// differing only in the documented bookmark deltas — `capture_kind = "bookmark"`,
// `image_bytes = []`, `destination_folder = null` (SYNC-15), and a content-light
// body. This mirrors the Rust source of truth `src-tauri/src/clipper/envelope.rs`
// (the `HandoffEnvelope` struct), which has NO `page_title` field — the title
// folds into `markdown_body`.
import { escapeLineStart } from "../lib/markdown-safe";

import type { CaptureKind } from "./clip";

/**
 * The versioned handoff envelope (ext → host, SYNC-10).
 *
 * Mirrors `clipper::envelope::HandoffEnvelope` (Rust) field-for-field. The wire
 * SHAPE is forward-incompatible by design (`version` is the only schema the host
 * decodes); secondary capture triggers (the url-bookmark context-menu / hotkey)
 * build the SAME shape and reuse the SAME native-messaging transport — a bookmark
 * is a degenerate clip on this one channel, not a second wire contract.
 */
export interface HandoffEnvelope {
  readonly version: 1;
  readonly kind: "create-clip";
  readonly extension_id: string;
  readonly token: string;
  readonly markdown_body: string;
  readonly capture_kind: CaptureKind;
  // SYNC-15: the foundation NEVER sources structure — folder is always root,
  // tags always empty. Sent as the explicit SYNC-15 shape.
  readonly destination_folder: null;
  readonly tags: readonly string[];
  readonly source_url: string;
  readonly clip_date: string;
  // In-page-captured image bytes (SYNC-12 — every byte originates from in-page
  // capture, zero core-side fetch). Mirrors the Rust `image_bytes: Vec<Vec<u8>>`.
  // A content clip MAY carry images; a bookmark NEVER does (always `[]`).
  readonly image_bytes: readonly (readonly number[])[];
}

/**
 * The in-page-captured content clip, before it is wrapped in an envelope.
 *
 * Mirrors the content capture bundle's output (`captureActiveTab` resolves one
 * of these). The bookmark path produces a `BookmarkPayload` instead — a
 * degenerate, content-light variant of the same provenance.
 */
export interface CapturedClip {
  readonly captureKind: CaptureKind;
  readonly markdownBody: string;
  readonly sourceUrl: string;
  readonly clipDate: string;
  /** Optional in-page-captured image bytes (SYNC-12). Absent → `[]` on the wire. */
  readonly imageBytes?: readonly (readonly number[])[];
}

/** The identity the host binds the handoff to (SYNC-10): exact extension id + scoped token. */
interface HandoffIdentity {
  readonly extensionId: string;
  readonly token: string;
}

/**
 * Build the foundation's CONTENT-CLIP envelope (the headline full-article /
 * selection clip). The single canonical content-clip builder — the impure
 * `./clip` path calls this with the live `browser.runtime.id` + pairing token.
 */
export function buildContentClipEnvelope(
  args: HandoffIdentity & { readonly clip: CapturedClip },
): HandoffEnvelope {
  const { extensionId, token, clip } = args;
  return {
    version: 1,
    kind: "create-clip",
    extension_id: extensionId,
    token,
    markdown_body: clip.markdownBody,
    capture_kind: clip.captureKind,
    // SYNC-15: never source vault structure — folder root, tags empty.
    destination_folder: null,
    tags: [],
    source_url: clip.sourceUrl,
    clip_date: clip.clipDate,
    image_bytes: clip.imageBytes ?? [],
  };
}

/** The content-light bookmark inputs (url + title + capture provenance). */
export interface BookmarkEnvelopeInput {
  readonly captureKind: CaptureKind;
  readonly sourceUrl: string;
  readonly title: string;
  readonly clipDate: string;
}

/**
 * Compose the content-light bookmark BODY: the page title as a heading + the
 * bare source URL. The Rust envelope (`envelope.rs`) has NO `page_title` field,
 * so the title folds into `markdown_body` here. The FINAL bare-autolink body
 * bytes are task 3's desktop composition; this is the envelope-side body the
 * degenerate clip carries across the wire.
 */
function bookmarkBody(input: BookmarkEnvelopeInput): string {
  // Escape the page-controlled title's leading block marker exactly like the
  // content-clip path (`content/capture` escapes its title too) so a bookmark of
  // a page whose title starts with `#`/`>`/`-`/… cannot inject markdown structure
  // into the note. The source URL is already http(s)-gated upstream
  // (`background/bookmark`), so it is a safe bare autolink here.
  const heading = input.title.length > 0 ? "# " + escapeLineStart(input.title) : "";
  return [heading, input.sourceUrl].filter((s) => s.length > 0).join("\n\n");
}

/**
 * Build the BOOKMARK envelope — a DEGENERATE CLIP on the SYNC-10 wire shape.
 *
 * Byte-shape-identical to `buildContentClipEnvelope` EXCEPT the documented
 * bookmark deltas:
 *   - `capture_kind = "bookmark"`,
 *   - `image_bytes  = []`  (a bookmark carries no in-page images),
 *   - `destination_folder = null`  (SYNC-15 root — same as a content clip, made
 *     explicit here),
 *   - a content-light `markdown_body` (title + bare URL, not extracted article).
 *
 * No new field, no new reply variant, no new schema version — the wire shape is
 * the foundation's, reused verbatim.
 */
export function buildBookmarkEnvelope(
  args: HandoffIdentity & { readonly payload: BookmarkEnvelopeInput },
): HandoffEnvelope {
  const { extensionId, token, payload } = args;
  // Route through the SAME content-clip builder so the two envelopes cannot drift
  // apart: the bookmark is literally a content clip with the bookmark deltas.
  return buildContentClipEnvelope({
    extensionId,
    token,
    clip: {
      captureKind: "bookmark",
      markdownBody: bookmarkBody(payload),
      sourceUrl: payload.sourceUrl,
      clipDate: payload.clipDate,
      // A bookmark NEVER carries images — the empty-image-bytes delta.
      imageBytes: [],
    },
  });
}
