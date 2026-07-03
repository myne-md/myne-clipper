// Functional in-page capture (runs in the adversary-controlled page DOM).
//
// FUNCTIONAL, NOT YET FAITHFUL. A dependency-free recursive DOM->markdown
// walker: it preserves links, headings, nested lists, emphasis/code, and
// blockquotes, and drops page chrome (nav/header/footer/scripts/forms) via a
// skip-list sanitizer. It is NOT the faithful Defuddle -> canonical-D1
// extraction (the `@lezer`->D1 serializer) — that is sub-feature 2
// (capture-extraction), deliberately NOT built here, and this file pulls in NO
// new dependency (SYNC-5 — every transitive dep is attack surface in a hostile
// runtime).
//
// What it captures:
//   - a SELECTION clip when the user has selected text (the selection's DOM is
//     cloned and run through the same walker, keeping its structure);
//   - otherwise an ARTICLE clip: the best content container (article/main/body)
//     walked block-by-block into markdown.
//
// It returns ONLY the in-page-captured bytes (title, body markdown, the page
// URL). It NEVER fetches a URL (SYNC-12 — zero core-side egress; every byte
// originates from this in-page capture) and NEVER reads or transmits any vault
// structure (folders/tags) — there is none in the browser (SYNC-15).

import { escapeLineStart, safeHttpUrl } from "../lib/markdown-safe";

import { chooseCaptureScope } from "./capture-scope";

/** How a clip was captured (mirrors the host `CaptureKind`, kebab-case). */
export type CaptureKind = "full-article" | "selection" | "bookmark";

/** The functional capture result the background turns into a handoff envelope. */
export interface CapturedClip {
  readonly captureKind: CaptureKind;
  /** The functional markdown body (title H1 + content). */
  readonly markdownBody: string;
  /** The source page URL (provenance; written verbatim, never fetched). */
  readonly sourceUrl: string;
  /** ISO-8601 capture timestamp (provenance). */
  readonly clipDate: string;
}

// Collapse runs of whitespace in a single text node to a single space, trimming
// the ends — the minimal normalization a functional emit needs.
function normalizeInline(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Subtrees that are page CHROME, never article content — skipped entirely (the
// "sanitizer"). Dropping these keeps nav bars, cookie buttons, embedded widgets,
// and `<script>`/`<style>` out of the captured markdown.
const SKIP_TAGS = new Set([
  "script", "style", "noscript", "template", "nav", "header", "footer", "aside",
  "form", "button", "input", "select", "textarea", "svg", "canvas", "iframe",
  "video", "audio", "object", "embed", "dialog", "label", "fieldset",
]);

// Tags treated as INLINE inside a block (accumulated into one paragraph, never
// forced onto their own line). Everything else is a block boundary.
const INLINE_TAGS = new Set([
  "a", "strong", "b", "em", "i", "code", "span", "sub", "sup", "mark", "small",
  "u", "s", "del", "ins", "abbr", "time", "cite", "q", "kbd", "var", "samp",
  "br", "img", "wbr", "bdi", "bdo",
]);

// Link schemes safe to emit into the clip body. A resolved URL with ANY other
// scheme (`javascript:` / `data:` / `vbscript:` / `file:` / `blob:` …) is
// dropped so the extension is never a willing markdown-injection vector into the
// note the desktop renders — defense-in-depth atop the desktop's DOMPurify
// allow-list and the desktop-side envelope validation. Relative / anchor links
// resolve against the page's http(s) base, so they pass.
const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

// Resolve a possibly-relative href against the page so the clip's links work
// from inside the vault (where there is no page base). Returns "" for a parse
// failure OR a disallowed scheme, so the caller degrades the link to plain text
// rather than emitting an unsafe / unusable target.
function absoluteUrl(href: string): string {
  let resolved: URL;
  try {
    resolved = new URL(href, document.baseURI);
  } catch {
    return "";
  }
  return SAFE_LINK_SCHEMES.has(resolved.protocol) ? resolved.href : "";
}

// The provenance source URL — but ONLY when the page is http(s). A `file://` /
// `data:` / `chrome://` location is NOT handed across TB10 as provenance (no
// local-path / inline-blob leak); an empty result means "no provenance" and the
// desktop omits the `source:` / `url:` frontmatter. The desktop re-validates
// this with the same allow-list (`validateClipEnvelope`), so this is the
// cooperating producer half: a benign non-http(s) page clips WITHOUT provenance
// instead of being rejected outright. `safeHttpUrl` is the shared pure gate the
// bookmark path (`background/bookmark`) uses too, so the two producers agree.
function safeSourceUrl(): string {
  return safeHttpUrl(document.location.href);
}

// Recursion ceiling for the DOM walker. The extension runs in the adversary-
// controlled page DOM, and a page can build arbitrarily deep nesting via scripted
// `appendChild` (past the HTML parser's own nesting cap). Without a bound the
// recursive walk would exhaust the JS call stack (`RangeError`) on such a hostile
// page. Past this depth a subtree degrades to its `textContent` (safe — text
// never executes markup). Real content nests far below this; 512 is generous.
const MAX_WALK_DEPTH = 512;

// Serialize ONE inline element to markdown, applying its own markup (link /
// emphasis / code / image-alt) around its recursively-serialized inner. Nested
// lists are deferred to the block walker; skip-tags vanish. `guard` is the
// structural recursion depth (NOT the list-indent depth) — the hostile-DOM
// stack-overflow ceiling.
function serializeInlineEl(el: Element, guard: number): string {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return "";
  if (tag === "br") return " ";
  if (tag === "ul" || tag === "ol") return ""; // a nested list is block-level
  // Depth ceiling: past the limit, degrade this subtree to plain text rather
  // than recursing further into a scripted-deep tree.
  if (guard > MAX_WALK_DEPTH) return el.textContent ?? "";
  const inner = serializeInline(el, guard + 1);
  // Collapse only inside the branches that wrap the text (link / emphasis /
  // code); the common transparent-wrapper + img cases return `inner` raw, so
  // normalizing eagerly here would re-scan the same run at every nesting level
  // (the block boundary collapses it once anyway).
  if (tag === "a") {
    const href = el.getAttribute("href");
    const abs = href ? absoluteUrl(href) : "";
    const text = normalizeInline(inner);
    return abs && text ? `[${text}](${abs})` : inner;
  }
  if (tag === "strong" || tag === "b") {
    const text = normalizeInline(inner);
    return text ? `**${text}**` : "";
  }
  if (tag === "em" || tag === "i") {
    const text = normalizeInline(inner);
    return text ? `*${text}*` : "";
  }
  if (tag === "code") {
    const text = normalizeInline(inner);
    return text ? "`" + text + "`" : "";
  }
  if (tag === "img") return el.getAttribute("alt") || "";
  // Any other inline wrapper (span / mark / sub / …, or a stray block reached in
  // an inline context) → its inner inline run, transparently.
  return inner;
}

// Serialize a node's CHILDREN as one inline markdown run (text + inline markup).
function serializeInline(node: Node, guard: number): string {
  let out = "";
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      out += serializeInlineEl(child as Element, guard);
    }
  });
  return out;
}

// The collapsed inline line for a block element (heading / paragraph / list item).
function inlineLine(el: Element, guard: number): string {
  return normalizeInline(serializeInline(el, guard));
}

// Emit one `<ul>`/`<ol>` as indented `- ` / `N.` lines, recursing into nested
// lists with one more indent level. Each `<li>`'s own inline text excludes its
// nested lists (those are emitted as their own deeper lines).
function emitList(listEl: Element, out: string[], depth: number, ordered: boolean, guard: number): void {
  // Depth ceiling: a scripted-deep nested list degrades to a single flattened
  // bullet rather than recursing further.
  if (guard > MAX_WALK_DEPTH) {
    const text = normalizeInline(listEl.textContent ?? "");
    if (text) out.push("  ".repeat(depth) + (ordered ? "1." : "-") + " " + text);
    return;
  }
  let index = 1;
  Array.from(listEl.children).forEach((child) => {
    if (child.tagName.toLowerCase() !== "li") return;
    const marker = ordered ? `${index++}.` : "-";
    const indent = "  ".repeat(depth);
    const text = inlineLine(child, guard + 1); // serializeInline skips nested ul/ol
    if (text) out.push(`${indent}${marker} ${text}`);
    Array.from(child.children).forEach((sub) => {
      const subTag = sub.tagName.toLowerCase();
      if (subTag === "ul" || subTag === "ol") {
        emitList(sub, out, depth + 1, subTag === "ol", guard + 1);
      }
    });
  });
}

// Emit a `<blockquote>` by walking its inner blocks into a sub-buffer and
// prefixing every produced line with `> `.
function emitBlockquote(el: Element, out: string[], depth: number, guard: number): void {
  const sub: string[] = [];
  walkBlocks(el, sub, depth, guard + 1);
  const quoted = sub
    .map((line) => line.split("\n").map((l) => "> " + l).join("\n"))
    .join("\n>\n");
  if (quoted) out.push(quoted);
}

// Dispatch ONE block element to its markdown shape. Containers (div/section/…)
// recurse so div-soup and semantic wrappers are walked rather than flattened.
function emitElement(el: Element, out: string[], depth: number, guard: number): void {
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    const text = inlineLine(el, guard);
    if (text) out.push("#".repeat(Number(tag[1])) + " " + text);
  } else if (tag === "p") {
    const text = inlineLine(el, guard);
    if (text) out.push(escapeLineStart(text));
  } else if (tag === "ul" || tag === "ol") {
    emitList(el, out, depth, tag === "ol", guard);
  } else if (tag === "blockquote") {
    emitBlockquote(el, out, depth, guard);
  } else if (tag === "pre") {
    const code = (el.textContent ?? "").replace(/^\n+|\n+$/g, "");
    if (code.trim()) out.push("```\n" + code + "\n```");
  } else if (tag === "hr") {
    out.push("---");
  } else if (tag === "li") {
    // A stray `<li>` outside a list → a single bullet (defensive).
    const text = inlineLine(el, guard);
    if (text) out.push("  ".repeat(depth) + "- " + text);
  } else {
    // div / section / article / main / figure / table / unknown → recurse so
    // nested blocks (and div-wrapped paragraphs) are walked, not dropped.
    walkBlocks(el, out, depth, guard + 1);
  }
}

// Walk an element's children into markdown lines. Consecutive inline content
// (text nodes + inline tags) is buffered into ONE paragraph and flushed when a
// block boundary is hit — so a `<div>text <a>link</a> more</div>` becomes one
// line with the link, instead of the innerText fragmenting it.
function walkBlocks(root: Element, out: string[], depth: number, guard: number): void {
  // Depth ceiling (hostile-DOM guard): a scripted-deep container tree would blow
  // the JS call stack; past the limit, flatten this subtree to its plain text.
  if (guard > MAX_WALK_DEPTH) {
    const text = normalizeInline(root.textContent ?? "");
    if (text) out.push(escapeLineStart(text));
    return;
  }
  let inline = "";
  const flush = (): void => {
    const text = normalizeInline(inline);
    if (text) out.push(escapeLineStart(text));
    inline = "";
  };
  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      inline += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (INLINE_TAGS.has(tag)) {
      inline += serializeInlineEl(el, guard + 1);
    } else {
      flush();
      emitElement(el, out, depth, guard);
    }
  });
  flush();
}

// Pick the best content container: prefer semantic `<article>` / `<main>`, then
// `<body>`. A heuristic — the faithful reader (Defuddle, sub-feature 2) replaces
// it; the SKIP_TAGS sanitizer keeps chrome out even when `<body>` is the root.
function pickContentRoot(): Element {
  // `textContent` (not `innerText`) for the non-empty probe: it needs no layout
  // reflow, and a no-real-text container that slips through here still falls back
  // to `<body>` via the empty-walk path in `captureArticle`.
  const article = document.querySelector("article");
  if (article && (article.textContent ?? "").trim().length > 0) return article;
  const main = document.querySelector("main");
  if (main && (main.textContent ?? "").trim().length > 0) return main;
  return document.body;
}

// Build the article markdown body from the content root via the recursive walker.
function captureArticle(): string {
  const root = pickContentRoot();
  const out: string[] = [];
  try {
    walkBlocks(root, out, 0, 0);
  } catch {
    // A scripted-deep DOM that still overran the depth guard (or any unexpected
    // walk error) must never fail the capture — discard the partial walk and
    // fall through to the innerText path below.
    out.length = 0;
  }
  if (out.length === 0) {
    // Fallback for an unusual DOM (or an overflowed walk): the root's innerText
    // split into paragraphs.
    const raw = ((root as HTMLElement).innerText ?? "").trim();
    for (const para of raw.split(/\n{2,}/)) {
      const p = normalizeInline(para);
      if (p) out.push(escapeLineStart(p));
    }
  }
  return out.join("\n\n");
}

// Build a FORMATTED selection markdown body: clone the range's DOM and run the
// same recursive walker, so a selected list / link / heading keeps its structure
// (the plain `toString()` is the fallback for a degenerate range).
function captureSelection(sel: Selection): string {
  if (sel.rangeCount === 0) return normalizeInline(sel.toString());
  const wrap = document.createElement("div");
  for (let i = 0; i < sel.rangeCount; i++) {
    wrap.appendChild(sel.getRangeAt(i).cloneContents());
  }
  const out: string[] = [];
  try {
    walkBlocks(wrap, out, 0, 0);
  } catch {
    // Overflowed walk / unexpected DOM → fall back to the plain selection string.
    out.length = 0;
  }
  return out.join("\n\n") || normalizeInline(sel.toString());
}

/**
 * Capture the current page (or selection) as a functional clip.
 *
 * Pure in-page read: no network, no storage, no vault-structure access. The
 * title becomes an H1; the body is the selection (if any) or a basic article
 * extraction. Returns the clip the background wraps into the handoff envelope.
 */
export function captureClip(): CapturedClip {
  const title = normalizeInline(document.title);
  const sel = window.getSelection();
  // The TRIGGER DECISION (task 9): selection when the user highlighted something,
  // the whole article otherwise. The scope drives both the extraction path and
  // the `captureKind` reported to the host.
  const scope = chooseCaptureScope(sel ? sel.toString() : null);

  const contentBody =
    scope === "selection" && sel ? captureSelection(sel) : captureArticle();
  // Escape the page-controlled title's leading block marker like body paragraphs
  // do (consistent markdown safety — the title is hostile page input too).
  const heading = title.length > 0 ? "# " + escapeLineStart(title) : "";
  const markdownBody = [heading, contentBody].filter((s) => s.length > 0).join("\n\n");

  return {
    captureKind: scope,
    markdownBody,
    sourceUrl: safeSourceUrl(),
    clipDate: new Date().toISOString(),
  };
}
