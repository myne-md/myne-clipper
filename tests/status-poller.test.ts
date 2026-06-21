// Task 12 — the passive status poller's cadence guard (TDD). Pure logic with a
// fake clock + a counting query; no browser. Proves the "no redundant rapid
// polls" guarantee (PRD open question 2) and the in-flight guard.
import { describe, expect, it } from "vitest";

import { iconStateForStatus, type VaultStatus } from "../src/background/status-wire";
import { createStatusPoller } from "../src/background/status-poller";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createStatusPoller — cadence guard", () => {
  it("reads + applies the status once per poll", async () => {
    let queries = 0;
    const applied: VaultStatus[] = [];
    const poller = createStatusPoller({
      query: async () => {
        queries += 1;
        return "unlocked";
      },
      apply: (s) => applied.push(s),
      now: () => 1000,
    });
    await poller.poll();
    expect(queries).toBe(1);
    expect(applied).toEqual(["unlocked"]);
  });

  it("throttles bursts: a second poll within the interval is skipped", async () => {
    let queries = 0;
    let clock = 1000;
    const poller = createStatusPoller({
      query: async () => {
        queries += 1;
        return "locked";
      },
      apply: () => {},
      minIntervalMs: 10_000,
      now: () => clock,
    });
    await poller.poll();
    clock = 1000 + 5_000; // only 5s later — within the 10s guard
    await poller.poll();
    expect(queries).toBe(1); // the second poll was throttled
  });

  it("polls again once the interval has elapsed", async () => {
    let queries = 0;
    let clock = 1000;
    const poller = createStatusPoller({
      query: async () => {
        queries += 1;
        return "unlocked";
      },
      apply: () => {},
      minIntervalMs: 10_000,
      now: () => clock,
    });
    await poller.poll();
    clock = 1000 + 10_001; // past the guard
    await poller.poll();
    expect(queries).toBe(2);
  });

  it("never double-issues a query while one is in flight", async () => {
    let queries = 0;
    const gate = deferred<VaultStatus>();
    let clock = 1000;
    const poller = createStatusPoller({
      query: () => {
        queries += 1;
        return gate.promise;
      },
      apply: () => {},
      minIntervalMs: 10_000,
      now: () => clock,
    });
    const first = poller.poll(); // starts; query in flight (unresolved)
    clock = 1000 + 50_000; // even though the interval elapsed...
    await poller.poll(); // ...this is skipped because a read is in flight
    expect(queries).toBe(1);
    gate.resolve("unlocked");
    await first;
  });
});

describe("iconStateForStatus", () => {
  it("unlocked → idle; everything else → locked", () => {
    expect(iconStateForStatus("unlocked")).toBe("idle");
    expect(iconStateForStatus("locked")).toBe("locked");
    expect(iconStateForStatus("closed")).toBe("locked");
    expect(iconStateForStatus("unpaired")).toBe("locked");
  });
});
