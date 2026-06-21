// The PURE wire pieces of the two-phase pair handshake (envelope builders +
// reply mappers). Split out of `./pair-adapter` — which imports
// `webextension-polyfill` and would throw under Vitest — so the mapping logic
// (the security-relevant "challenge vs paired vs locked" decisions) is a
// Node/Vitest-loadable unit. Mirrors the `./status-wire` split.
//
// Pairing is the FIRST contact before any token exists, so `token` is EMPTY in
// both phases. Mirrors the desktop's `HandoffKind::PairBegin` / `PairAwait`
// (serde `"pair-begin"` / `"pair-await"`) and `HostReply` (`status`-tagged).
import type { PairResult } from "./pair";

/** Phase-1 (`pair-begin`) request: open the dialog + relay the challenge back. */
export interface PairBeginEnvelope {
  readonly version: 1;
  readonly kind: "pair-begin";
  readonly extension_id: string;
  readonly token: "";
}

/** Phase-2 (`pair-await`) request: block for the Accept + relay the token back. */
export interface PairAwaitEnvelope {
  readonly version: 1;
  readonly kind: "pair-await";
  readonly extension_id: string;
  readonly token: "";
}

/** Build the phase-1 (`pair-begin`) request for THIS extension id. */
export function buildPairBeginEnvelope(extensionId: string): PairBeginEnvelope {
  return { version: 1, kind: "pair-begin", extension_id: extensionId, token: "" };
}

/** Build the phase-2 (`pair-await`) request for THIS extension id. */
export function buildPairAwaitEnvelope(extensionId: string): PairAwaitEnvelope {
  return { version: 1, kind: "pair-await", extension_id: extensionId, token: "" };
}

/**
 * Map one raw host reply to a `PairResult`:
 *   - `{ status:"paired", token }` (token a non-empty string) → paired;
 *   - `{ status:"error", reason }`                            → error (reason);
 *   - `{ status:"locked" }`                                   → locked;
 *   - anything else (incl. a `paired` with no/empty token)    → a malformed
 *     error, surfaced honestly so the user can retry (never a fake paired).
 */
export function mapPairReply(msg: unknown): PairResult {
  if (typeof msg !== "object" || msg === null) {
    return { status: "error", reason: "malformed_reply" };
  }
  const reply = msg as { status?: unknown; token?: unknown; reason?: unknown };
  if (reply.status === "paired") {
    return typeof reply.token === "string" && reply.token.length > 0
      ? { status: "paired", token: reply.token }
      : { status: "error", reason: "malformed_reply" };
  }
  if (reply.status === "locked") return { status: "locked" };
  if (reply.status === "error") {
    return {
      status: "error",
      reason: typeof reply.reason === "string" ? reply.reason : "pairing_failed",
    };
  }
  return { status: "error", reason: "malformed_reply" };
}

/**
 * The phase-1 reply, mapped to either the CHALLENGE to display (proceed to
 * phase 2) or a terminal {@link PairResult} (locked / error / malformed). A
 * `paired` cannot appear in phase 1 — only phase 2 mints a token.
 */
export type BeginReply = { status: "challenge"; code: string } | PairResult;

/** Map the raw phase-1 host reply: `challenge` (non-empty code) → proceed; else
 *  delegate to {@link mapPairReply} (locked / error / malformed). A `paired` in
 *  phase 1 would be a desktop bug → a malformed error, never a fake success. */
export function mapBeginReply(msg: unknown): BeginReply {
  if (typeof msg === "object" && msg !== null) {
    const reply = msg as { status?: unknown; code?: unknown };
    if (reply.status === "challenge") {
      return typeof reply.code === "string" && reply.code.length > 0
        ? { status: "challenge", code: reply.code }
        : { status: "error", reason: "malformed_reply" };
    }
  }
  return mapPairReply(msg);
}
