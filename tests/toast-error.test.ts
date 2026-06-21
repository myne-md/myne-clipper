// Task 11 — the honest error toast (model + controller). A failure must NEVER
// read as a success: distinct tone, distinct copy, no "view", never the "Saved"
// literal (story 20).
import { describe, expect, it } from "vitest";

import {
  CLIP_FAILED,
  CLIP_RATE_LIMITED,
  SAVED_TO_MYNE,
  SENT_TO_MYNE,
} from "../src/lib/load-bearing-copy";
import {
  buildErrorToastModel,
  errorCopyFor,
  type ToastModel,
} from "../src/lib/toast-model";
import {
  createToastController,
  type ToastClock,
  type ToastHandle,
  type ToastSurface,
} from "../src/content/toast-controller";
import type { ToastHandlers } from "../src/content/toast-view";

describe("errorCopyFor", () => {
  it("rate_limited → the specific busy copy; everything else → generic", () => {
    expect(errorCopyFor("rate_limited")).toBe(CLIP_RATE_LIMITED);
    expect(errorCopyFor("nothing_to_clip")).toBe(CLIP_FAILED);
    expect(errorCopyFor("note_body_oversized")).toBe(CLIP_FAILED);
  });
});

describe("buildErrorToastModel", () => {
  it("is an alert-tone, view-less toast that never claims success", () => {
    const m = buildErrorToastModel("nothing_to_clip");
    expect(m.variant).toBe("error");
    expect(m.tone).toBe("error");
    expect(m.chipGlyph).toBe("circle-alert");
    expect(m.viewAction).toBeNull();
    expect(m.message).toBe(CLIP_FAILED);
    // The honesty guarantee: never the success literals.
    expect(m.message).not.toBe(SAVED_TO_MYNE);
    expect(m.message).not.toBe(SENT_TO_MYNE);
  });

  it("rate-limited error gets its specific copy", () => {
    expect(buildErrorToastModel("rate_limited").message).toBe(CLIP_RATE_LIMITED);
  });
});

// Minimal fakes (shared shape with toast-controller.test.ts).
function fakeSurface() {
  const mounts: { model: ToastModel; handlers: ToastHandlers; handle: { removed: boolean } & ToastHandle }[] = [];
  const surface: ToastSurface = {
    mount(model, handlers) {
      const handle = {
        removed: false,
        markLeaving() {},
        remove() {
          this.removed = true;
        },
      };
      mounts.push({ model, handlers, handle });
      return handle;
    },
  };
  return { surface, mounts, last: () => mounts[mounts.length - 1] };
}

const immediateClock: ToastClock = {
  setTimeout: () => 0,
  clearTimeout: () => {},
};

describe("controller.showError", () => {
  it("mounts an error toast (never a success literal)", () => {
    const s = fakeSurface();
    const c = createToastController({ surface: s.surface, clock: immediateClock });
    c.showError("nothing_to_clip");
    expect(c.isShowing).toBe(true);
    expect(s.last().model.tone).toBe("error");
    expect(s.last().model.message).toBe(CLIP_FAILED);
    expect(s.last().model.message).not.toBe(SAVED_TO_MYNE);
  });

  it("replaces a success toast (single-toast) when an error follows", () => {
    const s = fakeSurface();
    const c = createToastController({ surface: s.surface, clock: immediateClock });
    c.showClip();
    c.showError("boom");
    expect(s.mounts).toHaveLength(2);
    expect(s.mounts[0].handle.removed).toBe(true); // success toast torn out
    expect(s.last().model.tone).toBe("error");
  });
});
