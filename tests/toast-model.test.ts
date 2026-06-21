// Task 4 — the pure toast view-model. (Task 4 is `[design]`/TDD:no, but the model
// is pure data so these cheap assertions pin the copy + a11y contract the DOM
// builder and the task-6 controller both depend on.)
import { describe, expect, it } from "vitest";

import { SAVED_TO_MYNE, SENT_TO_MYNE, VIEW_NOTE } from "../src/lib/load-bearing-copy";
import {
  buildToastModel,
  TOAST_DISMISS_TESTID,
  TOAST_TESTID,
  TOAST_VIEW_TESTID,
} from "../src/lib/toast-model";

describe("buildToastModel", () => {
  it("clip variant: 'Saved to Myne' + a view action + success chip", () => {
    const m = buildToastModel("clip");
    expect(m.message).toBe(SAVED_TO_MYNE);
    expect(m.chipGlyph).toBe("circle-check");
    expect(m.viewAction).not.toBeNull();
    expect(m.viewAction?.label).toBe(VIEW_NOTE);
    expect(m.viewAction?.testid).toBe(TOAST_VIEW_TESTID);
  });

  it("bookmark variant: 'Sent to Myne' + NO view action, same shell", () => {
    const m = buildToastModel("bookmark");
    expect(m.message).toBe(SENT_TO_MYNE);
    expect(m.chipGlyph).toBe("circle-check");
    expect(m.viewAction).toBeNull();
  });

  it("both variants carry the polite status a11y contract + testids", () => {
    for (const v of ["clip", "bookmark"] as const) {
      const m = buildToastModel(v);
      expect(m.role).toBe("status");
      expect(m.ariaLive).toBe("polite");
      expect(m.testid).toBe(TOAST_TESTID);
      expect(m.dismissTestid).toBe(TOAST_DISMISS_TESTID);
    }
  });

  it("renders only the load-bearing literals (never 'Encrypted'/write claims)", () => {
    for (const v of ["clip", "bookmark"] as const) {
      const m = buildToastModel(v);
      expect(m.message).not.toMatch(/encrypted|written|vault/i);
    }
  });
});
