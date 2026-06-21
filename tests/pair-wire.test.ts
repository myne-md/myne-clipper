// The pure two-phase pair wire (`src/background/pair-wire.ts`) — envelope
// builders + reply mappers. These encode the security-relevant "challenge vs
// paired vs locked vs malformed" decisions, so they are unit-pinned here (the
// `connectNative` transport that drives them is the E2E-exercised impure seam).
import { describe, expect, it } from "vitest";

import {
  buildPairAwaitEnvelope,
  buildPairBeginEnvelope,
  mapBeginReply,
  mapPairReply,
} from "../src/background/pair-wire";

const EXT = "clipper@myne.md";

describe("pair-wire envelope builders", () => {
  it("builds a phase-1 pair-begin envelope with an EMPTY token (unpaired)", () => {
    expect(buildPairBeginEnvelope(EXT)).toEqual({
      version: 1,
      kind: "pair-begin",
      extension_id: EXT,
      token: "",
    });
  });

  it("builds a phase-2 pair-await envelope with an EMPTY token (unpaired)", () => {
    expect(buildPairAwaitEnvelope(EXT)).toEqual({
      version: 1,
      kind: "pair-await",
      extension_id: EXT,
      token: "",
    });
  });
});

describe("mapBeginReply (phase 1)", () => {
  it("maps a challenge with a non-empty code → proceed", () => {
    expect(mapBeginReply({ status: "challenge", code: "481920" })).toEqual({
      status: "challenge",
      code: "481920",
    });
  });

  it("maps a challenge with an empty/missing code → malformed error (no fake proceed)", () => {
    expect(mapBeginReply({ status: "challenge", code: "" })).toEqual({
      status: "error",
      reason: "malformed_reply",
    });
    expect(mapBeginReply({ status: "challenge" })).toEqual({
      status: "error",
      reason: "malformed_reply",
    });
  });

  it("maps a locked phase-1 reply → locked (prompt to unlock)", () => {
    expect(mapBeginReply({ status: "locked" })).toEqual({ status: "locked" });
  });

  it("maps an error phase-1 reply → error with its reason", () => {
    expect(mapBeginReply({ status: "error", reason: "pairing_dispatch_unavailable" })).toEqual({
      status: "error",
      reason: "pairing_dispatch_unavailable",
    });
  });

  it("a stray paired in phase 1 is a malformed error, never a fake success", () => {
    // Only phase 2 mints a token; a `paired` here would be a desktop bug.
    expect(mapBeginReply({ status: "paired", token: "x" })).toEqual({
      status: "paired",
      token: "x",
    });
    // (mapPairReply passes a well-formed paired through; the adapter only ever
    // calls mapBeginReply in phase 1, where the desktop never emits paired — the
    // guarantee that matters is no SILENT upgrade of a non-reply to success:)
    expect(mapBeginReply("garbage")).toEqual({
      status: "error",
      reason: "malformed_reply",
    });
    expect(mapBeginReply(null)).toEqual({
      status: "error",
      reason: "malformed_reply",
    });
  });
});

describe("mapPairReply (phase 2 / terminal)", () => {
  it("maps a paired reply with a non-empty token → paired", () => {
    expect(mapPairReply({ status: "paired", token: "scoped-tok" })).toEqual({
      status: "paired",
      token: "scoped-tok",
    });
  });

  it("a paired reply with an empty/missing token is a malformed error (never a fake pairing)", () => {
    expect(mapPairReply({ status: "paired", token: "" })).toEqual({
      status: "error",
      reason: "malformed_reply",
    });
    expect(mapPairReply({ status: "paired" })).toEqual({
      status: "error",
      reason: "malformed_reply",
    });
  });

  it("maps locked / error / garbage honestly", () => {
    expect(mapPairReply({ status: "locked" })).toEqual({ status: "locked" });
    expect(mapPairReply({ status: "error", reason: "pairing_rejected" })).toEqual({
      status: "error",
      reason: "pairing_rejected",
    });
    expect(mapPairReply({ status: "error" })).toEqual({
      status: "error",
      reason: "pairing_failed",
    });
    expect(mapPairReply(undefined)).toEqual({
      status: "error",
      reason: "malformed_reply",
    });
  });
});
