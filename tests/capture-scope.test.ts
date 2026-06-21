// Task 9 — the selection-aware capture-scope decision (TDD). Pure: no DOM, no
// browser. The in-page extraction itself is sub-feature 2's; this only pins the
// "selection present vs absent → which scope" branch.
import { describe, expect, it } from "vitest";

import { chooseCaptureScope } from "../src/content/capture-scope";

describe("chooseCaptureScope", () => {
  it("a non-empty selection routes to the selection scope", () => {
    expect(chooseCaptureScope("a highlighted passage")).toBe("selection");
  });

  it("no selection (null/undefined) routes to the full-article scope", () => {
    expect(chooseCaptureScope(null)).toBe("full-article");
    expect(chooseCaptureScope(undefined)).toBe("full-article");
  });

  it("an empty or whitespace-only selection routes to full-article", () => {
    expect(chooseCaptureScope("")).toBe("full-article");
    expect(chooseCaptureScope("   ")).toBe("full-article");
    expect(chooseCaptureScope("\n\t  \n")).toBe("full-article");
  });

  it("a selection with surrounding whitespace but real content is a selection", () => {
    expect(chooseCaptureScope("  real text  ")).toBe("selection");
  });
});
