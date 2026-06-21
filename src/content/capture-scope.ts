// The capture-scope decision (clip-time-ux sub-feature 4, task 9).
//
// THE TRIGGER DECISION ONLY: given the current page selection, decide whether the
// toolbar click targets the SELECTION or the FULL ARTICLE, so the default gesture
// is always meaningful — selection when the user highlighted something, the whole
// article otherwise (stories 10/11). The actual selection-vs-article EXTRACTION
// (how each scope becomes markdown) is owned by sub-feature 2 (capture-extraction)
// — this module only chooses the scope and hands it to that extraction.
//
// Pure (no DOM): the in-page caller reads `window.getSelection().toString()` and
// passes the text here, so the decision (including the whitespace-only guard) is
// unit-tested without a real Selection.

/** Which scope a capture targets. Maps 1:1 onto the `CaptureKind`. */
export type CaptureScope = "selection" | "full-article";

/**
 * Decide the capture scope from the current selection text. A non-empty,
 * non-whitespace selection → `selection`; anything else (no selection, an empty
 * or whitespace-only selection) → `full-article`, so a plain click always clips
 * something meaningful.
 */
export function chooseCaptureScope(
  selectionText: string | null | undefined,
): CaptureScope {
  if (typeof selectionText === "string" && selectionText.trim().length > 0) {
    return "selection";
  }
  return "full-article";
}
