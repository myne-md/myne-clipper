// The PURE durable-token holder (pairing task 6).
//
// Split out from `./pairing-token` so the holder logic loads under Node/Vitest
// WITHOUT `webextension-polyfill` (which throws outside a browser). This mirrors
// the repo's pure-logic-vs-platform-adapter discipline (the icon state machine,
// the bookmark handler, the envelope + status-wire builders are all pure): the
// `browser.storage.local` backend is the thin adapter (`./pairing-token`), while
// this module owns ONLY the storage-backed cache logic, which is unit-testable
// against a fake `TokenStorage`.
//
// What this holds is a CREDENTIAL, not a clip: a scoped, revocable pairing token
// bound to the exact extension ID, scoped to `create-clip` + `is-unlocked-status`
// only. SYNC-1a forbids a plaintext CLIP buffer in browser storage — this is not
// one. It is NOT a vault key and decrypts nothing (A14).

/**
 * The persistence seam: load / save / clear the scoped token value. The default
 * backend (`./pairing-token`) is `browser.storage.local`; tests inject a fake.
 * `load` resolves `null` when no token has ever been persisted.
 */
export interface TokenStorage {
  load(): Promise<string | null>;
  save(value: string): Promise<void>;
  clear(): Promise<void>;
}

/** The warm-cache-backed token holder the background reads/writes through. */
export interface DurableToken {
  /** The current scoped pairing token, or `null` when not paired. */
  get(): Promise<string | null>;
  /** Persist the token (`null` clears the pairing) + update the warm cache. */
  set(value: string | null): Promise<void>;
}

/**
 * Build a durable token holder over a `TokenStorage` backend, with an in-memory
 * cache so a warm service worker answers `get()` WITHOUT a storage round-trip.
 *
 * The cache is tri-state:
 *   - `undefined` — UNLOADED: no `load` has happened yet → the first `get`
 *     reads the backend once and memoizes the result;
 *   - `null`      — LOADED-ABSENT: the backend was read and held no token;
 *   - `string`    — PRESENT: the scoped token, served straight from the cache.
 *
 * `set(value)` writes through (`save` for a string, `clear` for `null`) and then
 * updates the cache, so a subsequent `get` never re-reads the backend. A warm
 * worker that has already loaded (or set) the token issues no further `load`.
 */
export function createDurableToken(storage: TokenStorage): DurableToken {
  // `undefined` = unloaded, `null` = loaded-absent, string = present.
  let cache: string | null | undefined = undefined;

  return {
    async get(): Promise<string | null> {
      // A warm cache (loaded-absent or present) answers without touching storage.
      if (cache !== undefined) return cache;
      // Cold: read the backend exactly once, then memoize (absent → null).
      cache = await storage.load();
      return cache;
    },
    async set(value: string | null): Promise<void> {
      // Write through FIRST so a crash between write + cache-update cannot leave
      // the cache claiming a token the backend never persisted.
      if (value === null) await storage.clear();
      else await storage.save(value);
      cache = value;
    },
  };
}
