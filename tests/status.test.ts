// Task 8 — the `is-unlocked-status` envelope + reply mapping (the pure pieces of
// the bridge status client; the `connectNative` transport itself is the thin,
// browser-bound part exercised by the E2E).
import { describe, expect, it } from "vitest";

import { buildStatusEnvelope, mapStatusReply } from "../src/background/status-wire";

describe("buildStatusEnvelope", () => {
  it("builds the minimal is-unlocked-status envelope (no clip fields)", () => {
    const env = buildStatusEnvelope({ extensionId: "ext-1", token: "tok-9" });
    expect(env).toEqual({
      version: 1,
      kind: "is-unlocked-status",
      extension_id: "ext-1",
      token: "tok-9",
    });
    // No clip payload crosses the wire on a status query (no body/folder/tags).
    expect("markdown_body" in env).toBe(false);
    expect("destination_folder" in env).toBe(false);
    expect("tags" in env).toBe(false);
  });
});

describe("mapStatusReply", () => {
  it("accepted → unlocked", () => {
    expect(mapStatusReply({ status: "accepted" })).toBe("unlocked");
  });
  it("locked → locked", () => {
    expect(mapStatusReply({ status: "locked" })).toBe("locked");
  });
  it("error → closed (host can't answer → treat as not ready)", () => {
    expect(mapStatusReply({ status: "error" })).toBe("closed");
  });
  it("null / unparseable / unknown → closed", () => {
    expect(mapStatusReply(null)).toBe("closed");
    expect(mapStatusReply({})).toBe("closed");
    expect(mapStatusReply({ status: "weird" })).toBe("closed");
  });
});
