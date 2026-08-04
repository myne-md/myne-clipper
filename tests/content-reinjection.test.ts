// @vitest-environment jsdom
//
// Re-injecting the content bundle must not stack listeners (myne-clipper#2).
//
// The background injects `content.js` on EVERY clip gesture — three injecting
// steps per toolbar click, two per bookmark — and injection re-executes the
// module in the same isolated world; only a navigation clears it. So a listener
// registered at module scope with no guard accumulated one copy per click and
// stayed for the tab's lifetime.
//
// Nothing looked wrong: every copy answers, the first responder's clip wins, so
// the clip was always correct. What grew was the work. The 10th clip on one page
// ran 29 full-page DOM walks on the page's own main thread instead of one, which
// on a long article is a stall the user feels in THEIR page, not in ours.
//
// `setupNotices` in the same bundle was already guarded, and its header states
// the re-injection premise outright — so this asserts the property for both
// listeners rather than only the one that was missed, because the next listener
// added here will be missed the same way.

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Registered listeners, across every simulated injection. */
const listeners: unknown[] = [];

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: (fn: unknown) => {
          listeners.push(fn);
        },
      },
      sendMessage: () => Promise.resolve(undefined),
    },
  },
}));

/**
 * Re-execute the content entry the way `scripting.executeScript` does: a fresh
 * module evaluation against the SAME global. Vitest caches modules, so the
 * registry is reset per injection — which is exactly the isolated world's
 * behaviour, since the world's `globalThis` is what persists, not the registry.
 */
async function inject(): Promise<void> {
  vi.resetModules();
  await import("../src/content/index");
}

describe("re-injection of the content bundle", () => {
  beforeEach(() => {
    listeners.length = 0;
    // A fresh isolated world: drop both guards.
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.__myneClipCapture;
    delete g.__myneClipNotices;
  });

  it("registers the capture listener exactly once, however many times it is injected", async () => {
    await inject();
    const afterFirst = listeners.length;
    expect(afterFirst).toBeGreaterThan(0);

    // Three injections is one toolbar click's worth.
    await inject();
    await inject();

    expect(listeners.length).toBe(afterFirst);
  });

  it("still registers on the FIRST injection into a fresh world", async () => {
    // The guard must not be so eager that a navigated-to page gets no listener
    // — that would be a clip that silently never answers.
    await inject();
    expect(listeners.length).toBeGreaterThan(0);
  });

  it("sets both world guards, so neither listener is the unguarded one", async () => {
    await inject();
    const g = globalThis as unknown as Record<string, unknown>;
    expect(g.__myneClipCapture).toBe(true);
    expect(g.__myneClipNotices).toBe(true);
  });
});
