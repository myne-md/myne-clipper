// Unit tests for the BOOKMARK handoff ENVELOPE (url-bookmark task 2).
//
// Task 1 already routes the bookmark onto the foundation's versioned
// `HandoffEnvelope` (SYNC-10). This task FORMALIZES + pins the exact wire shape
// for the bookmark case and proves it is a DEGENERATE CLIP — byte-shape-identical
// to a content clip EXCEPT for the documented bookmark deltas:
//
//   - `capture_kind = "bookmark"`  (vs the content clip's capture kind)
//   - `image_bytes  = []`          (a bookmark carries no in-page images)
//   - `destination_folder = null`  (SYNC-15: root, never sourced from the vault)
//   - a content-light `markdown_body` (title + bare URL, not extracted article)
//
// Everything else — the field SET, the field types, the schema `version`, the
// `kind`, `tags = []`, `source_url`, `clip_date` — is IDENTICAL to a content
// clip. No new envelope field, no new reply variant, no new schema version is
// introduced (the wire shape is the foundation's, reused verbatim).
//
// The builders under test live in the PURE `./envelope` module (no `browser.*`
// import), so they load under Vitest. `bookmark-adapter` / `clip` — the impure
// seams — call these same builders, supplying `extension_id`/`token` from
// `browser.runtime.id`; the WIRE SHAPE is owned here, in the pure layer:
//   - `buildBookmarkEnvelope(...)` — the formalized bookmark envelope builder;
//   - `buildContentClipEnvelope(...)` — the foundation's content-clip builder,
//     so the byte-shape-identity assertion can compare the two shapes side by
//     side without a real native-messaging port.
import { describe, expect, it } from "vitest";

import {
  buildBookmarkEnvelope,
  buildContentClipEnvelope,
  type CapturedClip,
  type HandoffEnvelope,
} from "../src/background/envelope";
import type { BookmarkPayload } from "../src/background/bookmark";

// The fixed identity values both builders are handed, so the ONLY differences in
// the two envelopes are the documented bookmark deltas (not incidental inputs).
const EXTENSION_ID = "ext-abc";
const TOKEN = "deadbeef";
const SOURCE_URL = "https://example.com/article";
const CLIP_DATE = "2026-06-20T12:00:00.000Z";

function bookmarkPayload(): BookmarkPayload {
  return {
    captureKind: "bookmark",
    sourceUrl: SOURCE_URL,
    title: "An Example Article",
    clipDate: CLIP_DATE,
  };
}

function capturedFullArticle(): CapturedClip {
  return {
    captureKind: "full-article",
    markdownBody: "# An Example Article\n\nThe extracted article body…",
    sourceUrl: SOURCE_URL,
    clipDate: CLIP_DATE,
  };
}

describe("buildBookmarkEnvelope — the SYNC-10 bookmark deltas", () => {
  it("sets capture_kind = \"bookmark\"", () => {
    const env = buildBookmarkEnvelope({
      extensionId: EXTENSION_ID,
      token: TOKEN,
      payload: bookmarkPayload(),
    });
    expect(env.capture_kind).toBe("bookmark");
  });

  it("carries empty tags and empty image_bytes (a bookmark has no structure, no images)", () => {
    const env = buildBookmarkEnvelope({
      extensionId: EXTENSION_ID,
      token: TOKEN,
      payload: bookmarkPayload(),
    });
    expect(env.tags).toEqual([]);
    expect(env.image_bytes).toEqual([]);
  });

  it("sets destination_folder = null (SYNC-15: root, never sourced from the vault)", () => {
    const env = buildBookmarkEnvelope({
      extensionId: EXTENSION_ID,
      token: TOKEN,
      payload: bookmarkPayload(),
    });
    expect(env.destination_folder).toBeNull();
  });

  it("carries the page URL in source_url and an RFC-3339 clip_date that parses", () => {
    const env = buildBookmarkEnvelope({
      extensionId: EXTENSION_ID,
      token: TOKEN,
      payload: bookmarkPayload(),
    });
    expect(env.source_url).toBe(SOURCE_URL);
    expect(env.clip_date).toBe(CLIP_DATE);
    // RFC-3339 / ISO-8601-shaped: it parses to a real instant.
    expect(Number.isNaN(Date.parse(env.clip_date))).toBe(false);
  });

  it("uses the foundation's schema version 1 and create-clip kind (no new version)", () => {
    const env = buildBookmarkEnvelope({
      extensionId: EXTENSION_ID,
      token: TOKEN,
      payload: bookmarkPayload(),
    });
    expect(env.version).toBe(1);
    expect(env.kind).toBe("create-clip");
  });

  it("carries no user data beyond url + clip_date + the content-light body", () => {
    // Folding the title into the content-light body matches the Rust envelope
    // (`envelope.rs` has NO `page_title` field — title rides in `markdown_body`).
    const env = buildBookmarkEnvelope({
      extensionId: EXTENSION_ID,
      token: TOKEN,
      payload: bookmarkPayload(),
    });
    // The only user-derived fields are the URL, the date, and the body — there is
    // no extra smuggled field (e.g. a `page_title` the Rust shape never declares).
    expect("page_title" in env).toBe(false);
    expect(env.source_url).toBe(SOURCE_URL);
  });
});

describe("the bookmark envelope is a DEGENERATE CLIP — byte-shape-identical to a content clip", () => {
  // Build both envelopes from the SAME tab identity (same extension id, token,
  // url, date), so any difference between them is a DOCUMENTED bookmark delta and
  // nothing else.
  const bookmark = buildBookmarkEnvelope({
    extensionId: EXTENSION_ID,
    token: TOKEN,
    payload: bookmarkPayload(),
  });
  const content = buildContentClipEnvelope({
    extensionId: EXTENSION_ID,
    token: TOKEN,
    clip: capturedFullArticle(),
  });

  it("has the EXACT same field SET as a content clip (no new field, none dropped)", () => {
    expect(Object.keys(bookmark).sort()).toEqual(Object.keys(content).sort());
  });

  it("shares every NON-delta field byte-for-byte with the content clip", () => {
    // The shared spine: schema version, kind, identity, provenance, tags.
    expect(bookmark.version).toBe(content.version);
    expect(bookmark.kind).toBe(content.kind);
    expect(bookmark.extension_id).toBe(content.extension_id);
    expect(bookmark.token).toBe(content.token);
    expect(bookmark.source_url).toBe(content.source_url);
    expect(bookmark.clip_date).toBe(content.clip_date);
    expect(bookmark.tags).toEqual(content.tags);
    // tags are empty on BOTH (SYNC-15) — the bookmark is not the only one with [].
    expect(content.tags).toEqual([]);
  });

  it("differs from a content clip ONLY in the documented deltas", () => {
    // Delta 1: capture_kind.
    expect(content.capture_kind).toBe("full-article");
    expect(bookmark.capture_kind).toBe("bookmark");
    // Delta 2: image_bytes — content MAY carry images; a bookmark never does.
    expect(bookmark.image_bytes).toEqual([]);
    // Delta 3: destination_folder — null on a bookmark (root, SYNC-15). A content
    // clip is ALSO null under SYNC-15, so this is a delta only by contract intent;
    // assert the bookmark's value explicitly.
    expect(bookmark.destination_folder).toBeNull();
    // Delta 4: the content-light body differs from the extracted article body.
    expect(bookmark.markdown_body).not.toBe(content.markdown_body);
  });

  it("matches the content clip on the TYPE of every shared field (same wire shape)", () => {
    const typeOf = (e: HandoffEnvelope): Record<string, string> => ({
      version: typeof e.version,
      kind: typeof e.kind,
      extension_id: typeof e.extension_id,
      token: typeof e.token,
      markdown_body: typeof e.markdown_body,
      capture_kind: typeof e.capture_kind,
      destination_folder: e.destination_folder === null ? "null" : typeof e.destination_folder,
      tags: Array.isArray(e.tags) ? "array" : typeof e.tags,
      source_url: typeof e.source_url,
      clip_date: typeof e.clip_date,
      image_bytes: Array.isArray(e.image_bytes) ? "array" : typeof e.image_bytes,
    });
    expect(typeOf(bookmark)).toEqual(typeOf(content));
  });

  it("introduces no new reply variant — the bridge resolves the EXISTING ClipOutcome shape", () => {
    // The reply contract is the foundation's `accepted | error | locked`
    // (+ local `unreachable`); the bookmark adds none. We pin this structurally:
    // `BookmarkBridge.dispatch` returns `Promise<ClipOutcome>` (compile-time), and
    // the envelope above carries no reply-shaping field. Asserting the absence of a
    // bookmark-specific status keeps the intent explicit.
    expect("reply_variant" in bookmark).toBe(false);
    expect("status" in bookmark).toBe(false);
  });
});
