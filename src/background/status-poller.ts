// The passive status poller with a cadence guard (clip-time-ux sub-feature 4,
// task 12 — resolves PRD open question 2).
//
// Reflecting the desktop's locked/unlocked state on the toolbar icon must be
// CHEAP: NEVER tight periodic polling (a battery/nuisance cost). The wiring
// triggers `poll()` only on conservative, event-driven moments (browser focus,
// active-tab change, startup); this guard makes those triggers idempotent and
// rate-limited so a burst of events causes at most one bridge query per
// `minIntervalMs`, and a query already in flight is never double-issued.
//
// Pure + injectable (`query` / `apply` / `now`), so the throttle + in-flight
// guard are unit-tested with no browser and a fake clock. The status read itself
// exposes ONLY unlocked/locked — never folders/tags/note ids (AS3/AS5).
import type { VaultStatus } from "./status-wire";

export interface StatusPollerOptions {
  /** Read the vault status (the `is-unlocked-status` bridge). */
  readonly query: () => Promise<VaultStatus>;
  /** Apply a freshly-read status (e.g. reflect it on the toolbar icon). */
  readonly apply: (status: VaultStatus) => void;
  /** Minimum gap between bridge queries (ms). Defaults to a conservative 10s. */
  readonly minIntervalMs?: number;
  /** Monotonic-ish clock. Defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface StatusPoller {
  /** Read + apply the status, unless throttled or a read is already in flight. */
  poll(): Promise<void>;
}

/** Default conservative cadence — at most one status query per 10 seconds. */
const DEFAULT_MIN_INTERVAL_MS = 10_000;

/**
 * Build a cadence-guarded status poller. `poll()` is safe to call on every
 * focus/tab event: it skips if a query is in flight or if the last query was
 * within `minIntervalMs`, so it never polls tightly.
 */
export function createStatusPoller(options: StatusPollerOptions): StatusPoller {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const now = options.now ?? (() => Date.now());

  let lastPollAt = Number.NEGATIVE_INFINITY;
  let inFlight = false;

  return {
    async poll(): Promise<void> {
      if (inFlight) return; // a read is already underway — don't double-issue
      const t = now();
      if (t - lastPollAt < minIntervalMs) return; // throttled — too soon
      inFlight = true;
      lastPollAt = t;
      try {
        const status = await options.query();
        options.apply(status);
      } finally {
        inFlight = false;
      }
    },
  };
}
