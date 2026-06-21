// The durable-token holder — the warm-cache logic over a `TokenStorage` backend
// (pairing task 6). The pure half loads under Node/Vitest with NO `browser`
// global; the `browser.storage.local` adapter is the thin part exercised by the
// E2E. We assert the cache discipline: load-once-then-memoize, write-through, and
// a warm worker answering WITHOUT a second backend read.
import { describe, expect, it, vi } from "vitest";

import {
  createDurableToken,
  type TokenStorage,
} from "../src/background/durable-token";

/**
 * A fake `TokenStorage` backed by a single in-memory slot, with call-count spies
 * so a test can prove the warm cache avoids a second `load`.
 */
function fakeStorage(initial: string | null = null): TokenStorage & {
  loads: ReturnType<typeof vi.fn>;
  saves: ReturnType<typeof vi.fn>;
  clears: ReturnType<typeof vi.fn>;
  slot: string | null;
} {
  const state = { slot: initial };
  const loads = vi.fn();
  const saves = vi.fn();
  const clears = vi.fn();
  return {
    get slot() {
      return state.slot;
    },
    loads,
    saves,
    clears,
    async load() {
      loads();
      return state.slot;
    },
    async save(value: string) {
      saves(value);
      state.slot = value;
    },
    async clear() {
      clears();
      state.slot = null;
    },
  };
}

describe("createDurableToken", () => {
  it("get() reads a present token from the backend, then caches it", async () => {
    const storage = fakeStorage("scoped-token-9");
    const token = createDurableToken(storage);

    expect(await token.get()).toBe("scoped-token-9");
    // A second get() is served from the warm cache — no second backend read.
    expect(await token.get()).toBe("scoped-token-9");
    expect(storage.loads).toHaveBeenCalledTimes(1);
  });

  it("get() returns null when the backend holds no token, and caches the absence", async () => {
    const storage = fakeStorage(null);
    const token = createDurableToken(storage);

    expect(await token.get()).toBeNull();
    // Loaded-absent is cached too: a second get() does NOT re-read the backend.
    expect(await token.get()).toBeNull();
    expect(storage.loads).toHaveBeenCalledTimes(1);
  });

  it("set(value) writes through to the backend and updates the cache", async () => {
    const storage = fakeStorage(null);
    const token = createDurableToken(storage);

    await token.set("freshly-minted");
    expect(storage.saves).toHaveBeenCalledWith("freshly-minted");
    expect(storage.slot).toBe("freshly-minted");

    // get() after a set() is served from the cache — never re-reads the backend.
    expect(await token.get()).toBe("freshly-minted");
    expect(storage.loads).not.toHaveBeenCalled();
  });

  it("set(null) clears the backend and the cache (revocation / un-pair)", async () => {
    const storage = fakeStorage("to-be-revoked");
    const token = createDurableToken(storage);

    await token.set(null);
    expect(storage.clears).toHaveBeenCalledTimes(1);
    expect(storage.saves).not.toHaveBeenCalled();
    expect(storage.slot).toBeNull();

    // The cache now reports absent without touching the backend.
    expect(await token.get()).toBeNull();
    expect(storage.loads).not.toHaveBeenCalled();
  });

  it("a warm cache (after a set) avoids a load entirely", async () => {
    const storage = fakeStorage("anything");
    const token = createDurableToken(storage);

    // Setting before any get() warms the cache — the first get() never loads.
    await token.set("warmed");
    expect(await token.get()).toBe("warmed");
    expect(storage.loads).not.toHaveBeenCalled();
  });

  it("get() reads the backend exactly once even across many concurrent-ish calls", async () => {
    const storage = fakeStorage("once-only");
    const token = createDurableToken(storage);

    await token.get();
    await token.get();
    await token.get();
    expect(storage.loads).toHaveBeenCalledTimes(1);
  });
});
