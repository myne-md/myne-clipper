// The PAIR-INITIATION handler — the FIRST contact with the desktop (pairing
// task 6).
//
// Pairing is the one handoff that runs BEFORE any token exists: the extension
// sends a `pair` request with an EMPTY token, the user Accepts on the desktop
// (SYNC-6: Accept/Reject + a short numeric challenge), and the desktop MINTS a
// scoped, revocable token (NOT a key) bound to the exact extension ID and relays
// it back. This handler stores that minted token durably — it is the FIRST
// caller of `setPairingToken` (the Accept reply path the foundation's
// `pairing-token` docstring anticipated).
//
// Keyless by design (A14): what comes back is a CREDENTIAL, scoped to
// `create-clip` + `is-unlocked-status` only — never a vault key. The handler
// decrypts nothing and writes no clip (SYNC-1a).
//
// ## Reuse + testability
//
// This module imports NO `webextension-polyfill` / `browser.*` — the impure
// platform seam (the real `connectNative` pair request) lives in `./pair-adapter`
// and the durable token store in `./pairing-token`; the background wiring injects
// both. That keeps this handler a PURE, Node/Vitest-loadable unit, tested with NO
// `browser` global and NO real native-messaging port (the same discipline the
// bookmark handler + status-wire use).

/**
 * The host's pair reply, mapped to a closed set (mirrors the `connectNative`
 * adapter's settle cases):
 *   - `paired`      — the desktop Accepted + minted + relayed the scoped token;
 *   - `error`       — the desktop refused (e.g. `pairing_rejected` /
 *                     `pairing_timeout`) or replied with a host error reason;
 *   - `locked`      — the desktop is locked (cannot pair until unlocked);
 *   - `unreachable` — `connectNative` threw or the port disconnected with NO
 *                     reply (the closed-desktop / crashed-host case).
 */
export type PairResult =
  | { status: "paired"; token: string }
  | { status: "error"; reason: string }
  | { status: "locked" }
  | { status: "unreachable" };

/**
 * The honest local outcome the pair action reports back to its trigger:
 *   - `paired`      — the scoped token was minted + STORED durably;
 *   - `rejected`    — the desktop declined / errored / was locked (NO token
 *                     stored), carrying the host's `reason` for an honest prompt;
 *   - `unreachable` — the desktop was closed / the host crashed (NO token stored).
 */
export type PairOutcome =
  | { kind: "paired" }
  | { kind: "rejected"; reason: string }
  | { kind: "unreachable" };

/** The seams the pure pair handler is injected with (real ones in the adapters). */
export interface PairDeps {
  /** Run the two-phase pair handshake over the bridge and resolve the mapped
   *  result. `onChallenge` fires (once) with the numeric comparison code the
   *  desktop relayed in phase 1, so the trigger can display it. */
  sendPairRequest(onChallenge: (code: string) => void): Promise<PairResult>;
  /** Persist the minted scoped token durably (the FIRST `setPairingToken` call). */
  storeToken(token: string): Promise<void>;
  /** Surface the numeric pairing comparison code to the user (phase 1). */
  showChallenge(code: string): void;
}

/**
 * Run the pairing handshake: send the `pair` request, and on a `paired` reply
 * STORE the minted scoped token durably (so it survives a worker restart), then
 * report the honest outcome.
 *
 * A `locked` or `error` reply → `rejected` (NO token stored — there is nothing to
 * store; `locked` carries a synthetic `locked` reason so the trigger can prompt
 * to unlock). An `unreachable` reply → `unreachable` (NO token stored). Only the
 * `paired` path ever touches the durable store.
 */
export async function requestPairing(deps: PairDeps): Promise<PairOutcome> {
  const result = await deps.sendPairRequest(deps.showChallenge);
  switch (result.status) {
    case "paired":
      // The desktop minted the scoped token — persist it durably BEFORE
      // reporting success, so a `paired` outcome always implies a stored token.
      await deps.storeToken(result.token);
      return { kind: "paired" };
    case "error":
      return { kind: "rejected", reason: result.reason };
    case "locked":
      // A locked desktop cannot pair; surface it as a rejection the trigger can
      // turn into an "unlock Myne first" prompt. No token was minted, so none is
      // stored.
      return { kind: "rejected", reason: "locked" };
    case "unreachable":
      return { kind: "unreachable" };
  }
}
