// Task 5 — the pure prompt view-model. (Task 5 is `[design]`/TDD:no, but the
// model is pure data so these cheap assertions pin the load-bearing copy + the
// locked/closed/unpaired presentation split the task-7 controller depends on.)
import { describe, expect, it } from "vitest";

import {
  MYNE_LOCKED,
  MYNE_UNPAIRED,
  OPEN_MYNE_TO_CLIP,
  PAIR_WITH_MYNE,
  UNLOCK_MYNE,
} from "../src/lib/load-bearing-copy";
import { buildPromptModel, type PromptKind } from "../src/lib/prompt-model";

describe("buildPromptModel", () => {
  it("locked → 'Myne is locked — click to unlock' + Unlock action", () => {
    const m = buildPromptModel("locked");
    expect(m.message).toBe(MYNE_LOCKED);
    expect(m.action).toBe(UNLOCK_MYNE);
    expect(m.glyph).toBe("circle-alert");
  });

  it("closed SHARES the locked framing, only the action verb differs", () => {
    const locked = buildPromptModel("locked");
    const closed = buildPromptModel("closed");
    expect(closed.message).toBe(locked.message); // shared honest framing (stories 12/14)
    expect(closed.message).toBe(MYNE_LOCKED);
    expect(closed.action).toBe(OPEN_MYNE_TO_CLIP); // distinct verb
    expect(closed.action).not.toBe(locked.action);
  });

  it("unpaired is a DISTINCT first-run presentation (story 26)", () => {
    const m = buildPromptModel("unpaired");
    expect(m.message).toBe(MYNE_UNPAIRED);
    expect(m.message).not.toBe(MYNE_LOCKED);
    expect(m.action).toBe(PAIR_WITH_MYNE);
    expect(m.glyph).toBe("circle-alert");
  });

  it("every kind carries the polite status a11y contract", () => {
    for (const kind of ["locked", "closed", "unpaired"] as const) {
      const m = buildPromptModel(kind);
      expect(m.role).toBe("status");
      expect(m.ariaLive).toBe("polite");
    }
  });

  it("carries no structure and no saved/queued affordance (only message+action)", () => {
    for (const kind of ["locked", "closed", "unpaired"] as PromptKind[]) {
      const m = buildPromptModel(kind);
      // The model is honest by construction: it has no folder/tag/note fields and
      // its copy never implies a queue or a save.
      expect(JSON.stringify(m)).not.toMatch(/folder|tag|queue|saved|pending/i);
    }
  });
});
