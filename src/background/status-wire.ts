// The PURE `is-unlocked-status` wire pieces (clip-time-ux sub-feature 4, task 8).
//
// Split out from `./status` so the envelope builder + reply mapping load under
// Node/Vitest without `webextension-polyfill` (which throws outside a browser).
// The impure transport (`connectNative`) lives in `./status`, which imports these.
// This mirrors the repo's pure-logic-vs-platform-adapter discipline (the icon
// state machine, the bookmark handler, the envelope builders are all pure).

/**
 * The vault state the toolbar branch acts on. The three non-`unlocked` values
 * map 1:1 onto the in-page prompt kinds (locked / closed / unpaired).
 */
export type VaultStatus = "unlocked" | "locked" | "closed" | "unpaired";

/** The minimal status-query envelope (the clip fields default-omit on the wire). */
export interface StatusEnvelope {
  readonly version: 1;
  readonly kind: "is-unlocked-status";
  readonly extension_id: string;
  readonly token: string;
}

/** Build the status-query envelope for the paired extension + scoped token. */
export function buildStatusEnvelope(args: {
  readonly extensionId: string;
  readonly token: string;
}): StatusEnvelope {
  return {
    version: 1,
    kind: "is-unlocked-status",
    extension_id: args.extensionId,
    token: args.token,
  };
}

/**
 * Map a host reply (or `null` for an unparseable/absent reply) to the vault
 * status. `accepted` → unlocked; `locked` → locked; an `error` reply or anything
 * unrecognized → `closed` (the host can't answer → treat the desktop as not
 * ready, which routes to the honest "open Myne" prompt). Pure — unit-tested.
 */
export function mapStatusReply(reply: { status?: unknown } | null): VaultStatus {
  if (reply === null || typeof reply !== "object") return "closed";
  switch (reply.status) {
    case "accepted":
      return "unlocked";
    case "locked":
      return "locked";
    default:
      return "closed";
  }
}

/** The passive toolbar-icon read a status maps to (clip-time-ux task 12). */
export type PassiveIconState = "idle" | "locked";

/**
 * The toolbar-icon state to reflect for a passive status read (story 19): an
 * `unlocked` vault → `idle` (a click will save); any not-ready state
 * (locked/closed/unpaired) → `locked` (a click will prompt). Pure — unit-tested.
 */
export function iconStateForStatus(status: VaultStatus): PassiveIconState {
  return status === "unlocked" ? "idle" : "locked";
}
