// Task 6 — the toast controller behavior (TDD). Pure logic exercised with a fake
// surface + fake clock + an injectable reduced-motion flag; no DOM, no browser.
import { describe, expect, it } from "vitest";

import { SAVED_TO_MYNE, SENT_TO_MYNE } from "../src/lib/load-bearing-copy";
import type { ToastModel } from "../src/lib/toast-model";
import {
  createToastController,
  type ToastClock,
  type ToastHandle,
  type ToastSurface,
} from "../src/content/toast-controller";
import type { ToastHandlers } from "../src/content/toast-view";

interface RecordedMount {
  readonly model: ToastModel;
  readonly handlers: ToastHandlers;
  readonly handle: RecordingHandle;
}

interface RecordingHandle extends ToastHandle {
  leaving: boolean;
  removed: boolean;
}

function fakeSurface() {
  const mounts: RecordedMount[] = [];
  const surface: ToastSurface = {
    mount(model, handlers) {
      const handle: RecordingHandle = {
        leaving: false,
        removed: false,
        markLeaving() {
          this.leaving = true;
        },
        remove() {
          this.removed = true;
        },
      };
      mounts.push({ model, handlers, handle });
      return handle;
    },
  };
  return {
    surface,
    mounts,
    live: () => mounts.filter((m) => !m.handle.removed),
    last: () => mounts[mounts.length - 1],
  };
}

function fakeClock() {
  let seq = 1;
  const tasks = new Map<number, () => void>();
  const clock: ToastClock = {
    setTimeout(handler) {
      const id = seq++;
      tasks.set(id, handler);
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
  };
  return {
    clock,
    pending: () => tasks.size,
    // Fire every currently-scheduled task (in insertion order), draining first
    // so a callback that schedules a new timer doesn't run within this flush.
    flush() {
      const snapshot = [...tasks.entries()];
      tasks.clear();
      for (const [, fn] of snapshot) fn();
    },
  };
}

describe("createToastController", () => {
  it("showClip mounts the 'Saved to Myne' toast with a view action", () => {
    const s = fakeSurface();
    const c = createToastController({ surface: s.surface, clock: fakeClock().clock });
    c.showClip();
    expect(c.isShowing).toBe(true);
    expect(s.last().model.message).toBe(SAVED_TO_MYNE);
    expect(s.last().model.viewAction).not.toBeNull();
    expect(s.live()).toHaveLength(1);
  });

  it("showBookmark mounts the 'Sent to Myne' toast with no view action", () => {
    const s = fakeSurface();
    const c = createToastController({ surface: s.surface, clock: fakeClock().clock });
    c.showBookmark();
    expect(s.last().model.message).toBe(SENT_TO_MYNE);
    expect(s.last().model.viewAction).toBeNull();
  });

  it("is single-toast: a new toast replaces the prior immediately (no stack)", () => {
    const s = fakeSurface();
    const c = createToastController({ surface: s.surface, clock: fakeClock().clock });
    c.showClip();
    c.showClip();
    expect(s.mounts).toHaveLength(2);
    expect(s.mounts[0].handle.removed).toBe(true); // first torn out at once
    expect(s.live()).toHaveLength(1); // only one ever on screen
  });

  it("auto-dismisses after the configured delay (animate-out, then remove)", () => {
    const s = fakeSurface();
    const clk = fakeClock();
    const c = createToastController({
      surface: s.surface,
      clock: clk.clock,
      autoDismissMs: 2500,
      exitMs: 180,
    });
    c.showClip();
    expect(s.last().handle.removed).toBe(false);
    clk.flush(); // fire the auto-dismiss timer → markLeaving + schedule exit
    expect(s.last().handle.leaving).toBe(true);
    expect(s.last().handle.removed).toBe(false);
    clk.flush(); // fire the exit timer → remove
    expect(s.last().handle.removed).toBe(true);
    expect(c.isShowing).toBe(false);
  });

  it("manual dismiss (the dismiss control) removes the toast", () => {
    const s = fakeSurface();
    const clk = fakeClock();
    const c = createToastController({ surface: s.surface, clock: clk.clock });
    c.showClip();
    s.last().handlers.onDismiss();
    expect(s.last().handle.leaving).toBe(true);
    clk.flush();
    expect(s.last().handle.removed).toBe(true);
  });

  it("reduced motion removes immediately (no leave animation)", () => {
    const s = fakeSurface();
    const c = createToastController({
      surface: s.surface,
      clock: fakeClock().clock,
      reducedMotion: () => true,
    });
    c.showClip();
    c.dismiss();
    expect(s.last().handle.leaving).toBe(false); // skipped the animation
    expect(s.last().handle.removed).toBe(true); // removed at once
    expect(c.isShowing).toBe(false);
  });

  it("the view action invokes the open-note call, then dismisses", () => {
    const s = fakeSurface();
    let opened = 0;
    const c = createToastController({
      surface: s.surface,
      clock: fakeClock().clock,
      reducedMotion: () => true, // remove immediately so we can assert dismissal
      onView: () => {
        opened += 1;
      },
    });
    c.showClip();
    s.last().handlers.onView?.();
    expect(opened).toBe(1);
    expect(s.last().handle.removed).toBe(true);
  });

  it("never inlines copy — only the load-bearing literals reach the surface", () => {
    const s = fakeSurface();
    const c = createToastController({ surface: s.surface, clock: fakeClock().clock });
    c.showClip();
    expect(s.last().model.message).not.toMatch(/encrypted|written/i);
    expect([SAVED_TO_MYNE, SENT_TO_MYNE]).toContain(s.last().model.message);
  });
});
