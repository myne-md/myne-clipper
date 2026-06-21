// @vitest-environment jsdom
//
// Unit tests for the adversary-facing DOM→markdown capture walker
// (`src/content/capture.ts`) — finding #9: this is the ONLY code that runs
// inside the hostile page DOM (A14 / TB10) and produces the plaintext that
// crosses into the desktop's note pipeline, so its security-relevant behaviors
// are covered directly: the SKIP_TAGS sanitizer, markdown line-start escaping
// (page text can't forge block structure), the link scheme allow-list (X4 — a
// `javascript:` / `data:` href can't become a clickable link), title→H1, and
// provenance-URL normalization. Runs under jsdom (the walker needs a real DOM);
// the rest of the suite stays on the node environment.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureClip } from "../src/content/capture";

beforeEach(() => {
  document.title = "";
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** Put HTML inside an <article> so `pickContentRoot` selects it deterministically. */
function setArticle(html: string): void {
  document.body.innerHTML = `<article>${html}</article>`;
}

describe("capture walker — sanitizer (SKIP_TAGS)", () => {
  it("drops script / style / nav / iframe content, keeps real text", () => {
    setArticle(`
      <p>real paragraph</p>
      <script>window.__x = 1</script>
      <style>.a{color:crimson}</style>
      <nav>home about contact</nav>
      <iframe src="https://evil.example/"></iframe>
    `);
    const { markdownBody } = captureClip();
    expect(markdownBody).toContain("real paragraph");
    expect(markdownBody).not.toContain("__x");
    expect(markdownBody).not.toContain("crimson");
    expect(markdownBody).not.toContain("home about contact");
    expect(markdownBody).not.toContain("evil.example");
  });
});

describe("capture walker — markdown line-start escaping", () => {
  it("escapes a paragraph that starts with a block marker", () => {
    setArticle(`<p># not a heading</p>`);
    const { markdownBody } = captureClip();
    // The leading "#" is escaped so the page text can't forge a heading.
    expect(markdownBody).toContain("\\# not a heading");
  });

  it("escapes the page title's own leading marker in the H1", () => {
    document.title = "- sneaky title";
    setArticle(`<p>body</p>`);
    const { markdownBody } = captureClip();
    // The "# " H1 marker is intentional; the TITLE's leading "-" is escaped.
    expect(markdownBody.startsWith("# \\- sneaky title")).toBe(true);
  });
});

describe("capture walker — link scheme allow-list (X4)", () => {
  it("emits an http(s) link as markdown, resolving a relative href", () => {
    setArticle(`<p><a href="/rel/path">link text</a></p>`);
    const { markdownBody } = captureClip();
    expect(markdownBody).toMatch(/\[link text\]\(https?:\/\/[^)]*\/rel\/path\)/);
  });

  it("DROPS a javascript: href — the link degrades to plain text", () => {
    setArticle(`<p><a href="javascript:alert(1)">click me</a></p>`);
    const { markdownBody } = captureClip();
    expect(markdownBody).toContain("click me");
    expect(markdownBody).not.toContain("javascript:");
    expect(markdownBody).not.toContain("](");
  });

  it("DROPS a data: href — the link degrades to plain text", () => {
    setArticle(`<p><a href="data:text/html,x">dlink</a></p>`);
    const { markdownBody } = captureClip();
    expect(markdownBody).toContain("dlink");
    expect(markdownBody).not.toContain("data:");
    expect(markdownBody).not.toContain("](");
  });
});

describe("capture walker — title + provenance", () => {
  it("makes the title an H1 and reports an http(s) source URL", () => {
    document.title = "My Article";
    setArticle(`<p>hello world</p>`);
    const clip = captureClip();
    expect(clip.markdownBody.startsWith("# My Article")).toBe(true);
    expect(clip.markdownBody).toContain("hello world");
    // Default jsdom location is an http(s) URL → carried as provenance.
    expect(clip.sourceUrl.startsWith("http")).toBe(true);
    expect(clip.captureKind).toBe("full-article");
  });
});
