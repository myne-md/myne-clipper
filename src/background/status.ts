// The `is-unlocked-status` bridge TRANSPORT (clip-time-ux sub-feature 4, task 8).
//
// The toolbar handler reads the desktop's vault state BEFORE capturing, so a
// locked / closed / unpaired desktop shows the prompt and the page is never even
// read (no wasted capture, no DOM touch on a not-ready vault). This is the TS
// side of the foundation's `IsUnlockedStatus` handoff kind
// (`src-tauri/src/clipper/envelope.rs`): a pure status query that exposes ONLY
// the unlocked/locked boolean — never folders, tags, or note ids (AS3/AS5 never
// cross TB10).
//
// Wire shape (mirrors the Rust `HandoffEnvelope` + `HostReply`):
//   request  = { version:1, kind:"is-unlocked-status", extension_id, token }
//   reply    = { status:"accepted" }  → vault UNLOCKED (a clip would be written)
//            | { status:"locked" }    → vault LOCKED / not usable
//            | { status:"error", … }  → treated as not-ready (closed)
//   no reply / disconnect / throw     → CLOSED (desktop not running)
//
// The PURE envelope builder + reply mapping live in `./status-wire` (so they load
// under Vitest without the polyfill); this file owns only the `connectNative`
// transport. Keyless: carries only the scoped pairing token (NOT a key).
import browser from "webextension-polyfill";

import { HOST_NAME } from "./host-name";
import { getPairingToken } from "./pairing-token";
import {
  buildStatusEnvelope,
  mapStatusReply,
  type StatusEnvelope,
  type VaultStatus,
} from "./status-wire";

// Re-export the wire pieces so existing importers can reach them via `./status`.
export {
  buildStatusEnvelope,
  mapStatusReply,
  type StatusEnvelope,
  type VaultStatus,
} from "./status-wire";

function isReplyObject(v: unknown): v is { status?: unknown } {
  return typeof v === "object" && v !== null;
}

/**
 * How long to wait for a status reply before treating the desktop as not-ready.
 *
 * A REVOKED / invalid token is SILENTLY IGNORED by the desktop — no reply AND no
 * disconnect (silent-to-unpaired, the no-oracle contract; `relay.rs`'s
 * `serve_connection` keeps the connection open). Without a bound the query hangs
 * forever, which freezes every caller (the clip pre-check, the pairing
 * already-paired probe). A valid token replies in well under this budget (a cold
 * host-spawn round-trip is a few hundred ms); a silent desktop resolves to
 * `closed` — the honest best-effort, since a keyless extension cannot tell a
 * revoked token from a closed desktop.
 */
const STATUS_QUERY_TIMEOUT_MS = 2000;

/** Send one status-query envelope and resolve with the mapped vault status. */
export function sendStatusQuery(envelope: StatusEnvelope): Promise<VaultStatus> {
  return new Promise<VaultStatus>((resolve) => {
    let port: ReturnType<typeof browser.runtime.connectNative>;
    try {
      port = browser.runtime.connectNative(HOST_NAME);
    } catch {
      resolve("closed");
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (status: VaultStatus): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      try {
        port.disconnect();
      } catch {
        // already gone
      }
      resolve(status);
    };
    port.onMessage.addListener((msg: unknown) => {
      settle(mapStatusReply(isReplyObject(msg) ? msg : null));
    });
    // Disconnect before any reply → the desktop is closed / the host crashed.
    port.onDisconnect.addListener(() => settle("closed"));
    // A silently-ignored (revoked / invalid) frame yields neither a reply nor a
    // disconnect — bound the wait so the query can never hang.
    timer = setTimeout(() => settle("closed"), STATUS_QUERY_TIMEOUT_MS);
    port.postMessage(envelope);
  });
}

/**
 * Read the desktop vault status over the bridge. Returns `unpaired` WITHOUT
 * touching the host when there is no scoped token (an unpaired extension cannot
 * — and must not — query). Otherwise sends the status envelope and maps the
 * reply.
 */
export async function queryVaultStatus(): Promise<VaultStatus> {
  const token = await getPairingToken();
  if (token === null) return "unpaired";
  return await sendStatusQuery(
    buildStatusEnvelope({ extensionId: browser.runtime.id, token }),
  );
}
