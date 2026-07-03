// Shared, dependency-free markdown/URL safety helpers.
//
// PURE: no `browser.*`, no DOM — every function takes a string and returns a
// string, so this module loads under Node/Vitest and both the content-capture
// path (`../content/capture`) and the pure envelope builders (`../background/
// envelope`) can import it WITHOUT dragging in `webextension-polyfill` or
// `document`. It is the single source of truth for the two first-line-of-defense
// sanitizers that used to live only in the capture walker, so the content-clip
// and bookmark handoff paths cannot drift apart (the content path escaped titles
// + http(s)-gated provenance; the bookmark path must do the same).
//
// These are DEFENSE-IN-DEPTH, not the last line: the desktop core re-validates
// every handed-off byte (DOMPurify allow-list + envelope validation, TB10/A14).
// The point here is that the two producer paths apply the SAME first-line guard.

// The markdown-significant characters that, at the START of a line, would turn a
// captured paragraph/title into a heading/list/quote. Matches the conservative
// set the faithful serializer (capture sub-feature 2) also escapes.
const LINE_START_MARKER = /^([#>\-*+]|\d+\.)/;

/**
 * Escape the leading markdown block-marker of ONE line so page-controlled text
 * (a paragraph or the page title — both hostile input) cannot inject markdown
 * structure into the note the desktop renders. Conservative and idempotent for
 * text that does not start with a marker (returns it unchanged).
 */
export function escapeLineStart(line: string): string {
  return line.replace(LINE_START_MARKER, "\\$1");
}

/**
 * Gate an ABSOLUTE URL to `http:` / `https:` only, returning its normalized
 * `href` or `""` for a parse failure OR any other scheme (`file:` / `data:` /
 * `blob:` / `about:` / `javascript:` / `chrome:` …).
 *
 * This is the string-taking pure core of the capture path's provenance check
 * (`safeSourceUrl`): a `""` result means "no safe URL" so the caller can degrade
 * to "no provenance" (content clip) or reject the handoff (bookmark), instead of
 * emitting a non-http(s) URL verbatim into the note body. It takes an already
 * absolute URL (no base resolution) — the tab URL / page location are absolute.
 */
export function safeHttpUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
}
