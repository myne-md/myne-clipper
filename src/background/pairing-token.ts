// The extension's scoped pairing token holder (NOT a key).
//
// The desktop mints a scoped, revocable pairing token on Accept and tells the
// extension its value; the extension presents it on every handoff. The token is
// bound to the exact extension ID and scoped to `create-clip` +
// `is-unlocked-status` only — even a fully compromised extension (A14) cannot
// read / modify / delete with it. It is NOT a vault key and decrypts nothing.
//
// ## Why durable here (the credential, not a clip)
//
// This is the THIN `browser.storage.local` adapter half of the holder: the pure
// cache logic lives in `./durable-token` (so it loads under Vitest), and this
// file supplies the only `browser.storage.local` backend + the singleton. The
// token is persisted under one key so pairing SURVIVES a service-worker restart
// (a cold MV3 worker would otherwise lose an in-memory token and silently
// un-pair). What we persist is a CREDENTIAL — a scoped, revocable token — not a
// CLIP: SYNC-1a forbids a plaintext clip buffer in browser storage, which this
// is not. It decrypts nothing (A14).
//
// Until the pairing handshake wires `setPairingToken` (the Accept reply path,
// `./pair`), `getPairingToken` resolves `null` ⇒ `clipActiveTab` reports the
// honest not-paired / unreachable state rather than sending an unauthorized
// handoff the host would silently ignore.
import browser from "webextension-polyfill";

import { createDurableToken, type TokenStorage } from "./durable-token";

// The single `browser.storage.local` key the scoped token lives under. A bare
// string constant, not a schema — the token is the only thing the extension ever
// persists (no clip, no vault structure; SYNC-1a / SYNC-15).
const TOKEN_KEY = "myne.pairing.token";

/** The `browser.storage.local` backend for the durable token holder. */
const localStorageBackend: TokenStorage = {
  async load(): Promise<string | null> {
    const stored = await browser.storage.local.get(TOKEN_KEY);
    const value = (stored as Record<string, unknown>)[TOKEN_KEY];
    return typeof value === "string" ? value : null;
  },
  async save(value: string): Promise<void> {
    await browser.storage.local.set({ [TOKEN_KEY]: value });
  },
  async clear(): Promise<void> {
    await browser.storage.local.remove(TOKEN_KEY);
  },
};

// The process-wide durable holder. Its in-memory cache lets a warm worker answer
// without a storage round-trip; a cold worker reads the backend once on the
// first `getPairingToken`.
const durableToken = createDurableToken(localStorageBackend);

/** The current scoped pairing token, or `null` when not paired. */
export function getPairingToken(): Promise<string | null> {
  return durableToken.get();
}

/**
 * Record (or clear, with `null`) the scoped pairing token the desktop minted on
 * Accept, persisting it durably so pairing survives a service-worker restart.
 */
export function setPairingToken(value: string | null): Promise<void> {
  return durableToken.set(value);
}
