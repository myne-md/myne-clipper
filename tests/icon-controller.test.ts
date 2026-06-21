// Unit tests for the toolbar-icon CONTROLLER (clip-time-ux task 2).
//
// The controller drives the pure four-state machine (`../src/lib/icon-state`)
// through an INJECTABLE adapter (the thin `browser.action` wrapper) and an
// INJECTABLE clock (the saved->idle auto-return timer). Both are injected here so
// the controller is tested with NO `browser` global and NO real wall-clock —
// every render is captured, every timer is advanced deterministically.
//
// Behaviour under test:
//   - the success path idle -> clipping -> saved -> idle, rendering each state;
//   - the saved state is SHORT-LIVED and auto-returns to idle after its window;
//   - a failed clip resets clipping -> idle (never stuck "in flight", story 21);
//   - `lock()` from any state shows locked; illegal transitions are no-ops.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { iconView } from "../src/lib/icon-state";
import type { IconState } from "../src/lib/icon-state";
import {
  createIconController,
  type IconAdapter,
  type IconRender,
} from "../src/background/icon-controller";

/** A fake `browser.action` adapter that records every render. */
function fakeAdapter(): IconAdapter & { renders: IconRender[] } {
  const renders: IconRender[] = [];
  return {
    renders,
    render(r: IconRender): void {
      renders.push(r);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createIconController — initial render", () => {
  it("renders the idle state on construction", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    expect(c.state).toBe("idle");
    expect(adapter.renders.at(-1)?.state).toBe("idle");
    expect(adapter.renders.at(-1)?.glyph).toBe("scissors");
  });
});

describe("the success path idle -> clipping -> saved -> idle", () => {
  it("renders clipping when a clip starts", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    c.clipStarted();
    expect(c.state).toBe("clipping");
    expect(adapter.renders.at(-1)?.glyph).toBe("loader-circle");
  });

  it("renders saved on success, then auto-returns to idle after the window", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter, savedDurationMs: 1500 });
    c.clipStarted();
    c.clipSucceeded();
    expect(c.state).toBe("saved");
    expect(adapter.renders.at(-1)?.glyph).toBe("circle-check");

    // Still saved just before the window elapses.
    vi.advanceTimersByTime(1499);
    expect(c.state).toBe("saved");

    // Auto-returns to idle at the window boundary — no manual call.
    vi.advanceTimersByTime(1);
    expect(c.state).toBe("idle");
    expect(adapter.renders.at(-1)?.glyph).toBe("scissors");
  });

  it("uses a controllable injected clock (no real wall-clock dependency)", () => {
    const adapter = fakeAdapter();
    let scheduled: (() => void) | null = null;
    const c = createIconController({
      adapter,
      savedDurationMs: 999,
      clock: {
        setTimeout: (fn) => {
          scheduled = fn;
          return 1;
        },
        clearTimeout: () => {
          scheduled = null;
        },
      },
    });
    c.clipStarted();
    c.clipSucceeded();
    expect(c.state).toBe("saved");
    // Fire the injected timer manually — the controller returns to idle.
    expect(scheduled).not.toBeNull();
    scheduled?.();
    expect(c.state).toBe("idle");
  });
});

describe("the failure reset clipping -> idle (story 21)", () => {
  it("a failed clip leaves the icon back at idle, not stuck in clipping", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    c.clipStarted();
    expect(c.state).toBe("clipping");
    c.clipFailed();
    expect(c.state).toBe("idle");
    expect(adapter.renders.at(-1)?.glyph).toBe("scissors");
  });

  it("never lands in saved on failure", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    c.clipStarted();
    c.clipFailed();
    expect(c.state).not.toBe("saved");
  });
});

describe("the locked branch (* -> locked)", () => {
  it("locks from idle", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    c.lock();
    expect(c.state).toBe("locked");
    expect(adapter.renders.at(-1)?.glyph).toBe("lock");
  });

  it("locks from clipping (the desktop reported locked mid-flight)", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    c.clipStarted();
    c.lock();
    expect(c.state).toBe("locked");
  });

  it("cancels a pending saved->idle timer when it locks", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter, savedDurationMs: 1500 });
    c.clipStarted();
    c.clipSucceeded();
    expect(c.state).toBe("saved");
    c.lock();
    expect(c.state).toBe("locked");
    // The stale saved->idle timer must NOT fire and silently flip locked->idle.
    vi.advanceTimersByTime(5000);
    expect(c.state).toBe("locked");
  });

  it("recovers from locked to idle via unlock()", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    c.lock();
    c.unlock();
    expect(c.state).toBe("idle");
  });
});

describe("illegal transitions are no-ops", () => {
  it("clipSucceeded() from idle does nothing (no clip in flight)", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    const before = adapter.renders.length;
    c.clipSucceeded(); // idle -> saved is illegal
    expect(c.state).toBe("idle");
    // No spurious render for a rejected transition.
    expect(adapter.renders.length).toBe(before);
  });

  it("clipStarted() twice does not re-render the same clipping state", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    c.clipStarted();
    const after = adapter.renders.length;
    c.clipStarted(); // clipping -> clipping is illegal (no-op)
    expect(c.state).toBe("clipping");
    expect(adapter.renders.length).toBe(after);
  });
});

describe("the render carries the full view, never color alone", () => {
  it("each render includes glyph + title + badge (text + shape)", () => {
    const adapter = fakeAdapter();
    const c = createIconController({ adapter });
    const seen: IconState[] = ["idle"];
    c.clipStarted();
    seen.push("clipping");
    c.clipSucceeded();
    seen.push("saved");
    for (const r of adapter.renders) {
      const view = iconView(r.state);
      expect(r.glyph).toBe(view.glyph);
      expect(r.title).toBe(view.title);
      expect(r.badge).toBe(view.badge);
      expect(r.title.length).toBeGreaterThan(0);
    }
  });
});
