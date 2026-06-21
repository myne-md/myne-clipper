// Task 7 — the locked/closed/unpaired prompt controller behavior (TDD). Pure
// logic with a fake surface + fake clock; no DOM, no browser.
import { describe, expect, it } from "vitest";

import {
  MYNE_LOCKED,
  MYNE_UNPAIRED,
  OPEN_MYNE_TO_CLIP,
  UNLOCK_MYNE,
} from "../src/lib/load-bearing-copy";
import type { PromptModel } from "../src/lib/prompt-model";
import {
  createPromptController,
  type PromptClock,
  type PromptHandle,
  type PromptSurface,
} from "../src/content/prompt-controller";
import type { PromptHandlers } from "../src/content/prompt-view";

interface RecordingHandle extends PromptHandle {
  leaving: boolean;
  removed: boolean;
}

interface RecordedMount {
  readonly model: PromptModel;
  readonly handlers: PromptHandlers;
  readonly handle: RecordingHandle;
}

function fakeSurface() {
  const mounts: RecordedMount[] = [];
  const surface: PromptSurface = {
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
  const clock: PromptClock = {
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
    flush() {
      const snapshot = [...tasks.values()];
      tasks.clear();
      for (const fn of snapshot) fn();
    },
  };
}

const noopActivate = (): void => {};

describe("createPromptController", () => {
  it("show('locked') mounts the 'Myne is locked' prompt", () => {
    const s = fakeSurface();
    const c = createPromptController({
      surface: s.surface,
      clock: fakeClock().clock,
      onActivate: noopActivate,
    });
    c.show("locked");
    expect(c.isShowing).toBe(true);
    expect(c.currentKind).toBe("locked");
    expect(s.last().model.message).toBe(MYNE_LOCKED);
    expect(s.last().model.action).toBe(UNLOCK_MYNE);
  });

  it("closed shares the locked message; unpaired is distinct", () => {
    const s = fakeSurface();
    const c = createPromptController({
      surface: s.surface,
      clock: fakeClock().clock,
      onActivate: noopActivate,
    });
    c.show("closed");
    expect(s.last().model.message).toBe(MYNE_LOCKED);
    expect(s.last().model.action).toBe(OPEN_MYNE_TO_CLIP);
    c.show("unpaired");
    expect(s.last().model.message).toBe(MYNE_UNPAIRED);
  });

  it("is single-prompt: a new prompt replaces the prior immediately", () => {
    const s = fakeSurface();
    const c = createPromptController({
      surface: s.surface,
      clock: fakeClock().clock,
      onActivate: noopActivate,
    });
    c.show("locked");
    c.show("closed");
    expect(s.mounts).toHaveLength(2);
    expect(s.mounts[0].handle.removed).toBe(true);
    expect(s.live()).toHaveLength(1);
  });

  it("does NOT auto-dismiss (persists until activate/dismiss)", () => {
    const s = fakeSurface();
    const clk = fakeClock();
    const c = createPromptController({
      surface: s.surface,
      clock: clk.clock,
      onActivate: noopActivate,
    });
    c.show("locked");
    expect(clk.pending()).toBe(0); // no timer scheduled — it just waits
    expect(s.last().handle.removed).toBe(false);
  });

  it("activate invokes the open/foreground call, then dismisses", () => {
    const s = fakeSurface();
    let opened = 0;
    const c = createPromptController({
      surface: s.surface,
      clock: fakeClock().clock,
      reducedMotion: () => true, // remove immediately so we can assert dismissal
      onActivate: () => {
        opened += 1;
      },
    });
    c.show("locked");
    s.last().handlers.onActivate();
    expect(opened).toBe(1);
    expect(s.last().handle.removed).toBe(true);
    expect(c.isShowing).toBe(false);
  });

  it("dismiss retains no state and never auto-replays (story 17)", () => {
    const s = fakeSurface();
    const c = createPromptController({
      surface: s.surface,
      clock: fakeClock().clock,
      reducedMotion: () => true,
      onActivate: noopActivate,
    });
    c.show("locked");
    s.last().handlers.onDismiss();
    expect(c.isShowing).toBe(false);
    expect(c.currentKind).toBeNull();
    // No re-show happens on its own: only an explicit show() mounts again.
    expect(s.mounts).toHaveLength(1);
  });

  it("reduced motion removes immediately; otherwise animates out", () => {
    const reduced = fakeSurface();
    const cR = createPromptController({
      surface: reduced.surface,
      clock: fakeClock().clock,
      reducedMotion: () => true,
      onActivate: noopActivate,
    });
    cR.show("locked");
    cR.dismiss();
    expect(reduced.last().handle.leaving).toBe(false);
    expect(reduced.last().handle.removed).toBe(true);

    const animated = fakeSurface();
    const clk = fakeClock();
    const cA = createPromptController({
      surface: animated.surface,
      clock: clk.clock,
      reducedMotion: () => false,
      onActivate: noopActivate,
    });
    cA.show("locked");
    cA.dismiss();
    expect(animated.last().handle.leaving).toBe(true);
    expect(animated.last().handle.removed).toBe(false);
    clk.flush();
    expect(animated.last().handle.removed).toBe(true);
  });
});
