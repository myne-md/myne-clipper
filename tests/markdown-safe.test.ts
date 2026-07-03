// Unit tests for the shared markdown/URL safety helpers (`src/lib/markdown-safe`).
//
// These two PURE helpers are the single source of truth for the first-line-of-
// defense sanitizers shared by the content-clip path (`content/capture`) and the
// bookmark path (`background/bookmark` + `background/envelope`): leading-marker
// escaping (page-controlled text can't forge markdown block structure) and
// http(s) URL gating (a `file:` / `data:` / `javascript:` URL never reaches the
// note body verbatim). They are defense-in-depth — the desktop re-validates too —
// but the point is that BOTH producer paths now apply the SAME first-line guard.
import { describe, expect, it } from "vitest";

import { escapeLineStart, safeHttpUrl } from "../src/lib/markdown-safe";

describe("escapeLineStart — leading block-marker escaping", () => {
  it("escapes each leading markdown block marker", () => {
    expect(escapeLineStart("# heading")).toBe("\\# heading");
    expect(escapeLineStart("> quote")).toBe("\\> quote");
    expect(escapeLineStart("- bullet")).toBe("\\- bullet");
    expect(escapeLineStart("* bullet")).toBe("\\* bullet");
    expect(escapeLineStart("+ bullet")).toBe("\\+ bullet");
    expect(escapeLineStart("1. ordered")).toBe("\\1. ordered");
  });

  it("leaves text without a leading marker unchanged", () => {
    expect(escapeLineStart("plain text")).toBe("plain text");
    expect(escapeLineStart("a # mid-line hash")).toBe("a # mid-line hash");
    expect(escapeLineStart("")).toBe("");
  });

  it("only escapes the FIRST marker (anchored, non-global)", () => {
    expect(escapeLineStart("## two hashes")).toBe("\\## two hashes");
  });
});

describe("safeHttpUrl — http(s)-only gate", () => {
  it("returns the normalized href for http and https", () => {
    expect(safeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHttpUrl("http://example.com/")).toBe("http://example.com/");
  });

  it('returns "" for every non-http(s) scheme', () => {
    for (const raw of [
      "file:///etc/passwd",
      "data:text/html,<b>x</b>",
      "blob:https://example.com/uuid",
      "about:blank",
      "javascript:alert(1)",
      "chrome://extensions",
      "mailto:a@b.com",
      "ftp://example.com/f",
    ]) {
      expect(safeHttpUrl(raw)).toBe("");
    }
  });

  it('returns "" for an unparseable / empty / relative URL', () => {
    expect(safeHttpUrl("")).toBe("");
    expect(safeHttpUrl("not a url")).toBe("");
    expect(safeHttpUrl("/relative/path")).toBe("");
  });
});
