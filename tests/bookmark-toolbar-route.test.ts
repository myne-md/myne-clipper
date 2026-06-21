// Task 10 — the bookmark trigger surface routes through the SAME vault-state
// branch as the toolbar clip and ships a no-default-chord command.
//
// The accepted→"Sent to Myne" (bookmark variant) toast is already proven by the
// `handleClipClick` branch table (`toolbar.test.ts` — "accepted bookmark capture
// → 'bookmark' toast variant"), since the bookmark reuses that handler. Here we
// pin the two task-10-specific contracts: the manifest's command has NO default
// chord (PRD open question 1), and the background routes both bookmark triggers
// through the shared `handleClipClick` (vault-state branch), not a bespoke path.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../src/manifest.json", import.meta.url)),
    "utf8",
  ),
) as {
  permissions: string[];
  commands: Record<string, { description?: string; suggested_key?: unknown }>;
};

const entry = readFileSync(
  fileURLToPath(new URL("../src/background/index.ts", import.meta.url)),
  "utf8",
);

describe("bookmark command — no default chord (PRD open question 1)", () => {
  it("registers the bookmark command with a description but NO suggested_key", () => {
    const command = manifest.commands["bookmark-page"];
    expect(command).toBeDefined();
    expect(command.description).toBe("Bookmark this page to Myne");
    // User-assignable only — no default chord that could collide.
    expect("suggested_key" in command).toBe(false);
  });

  it("keeps the contextMenus permission for the right-click trigger", () => {
    expect(manifest.permissions).toContain("contextMenus");
  });
});

describe("bookmark routes through the shared vault-state branch", () => {
  it("handleToolbarBookmark delegates to handleClipClick with the status read", () => {
    const start = entry.indexOf("async function handleToolbarBookmark");
    expect(start).toBeGreaterThan(-1);
    const body = entry.slice(start, entry.indexOf("\n}", start) + 2);
    expect(body).toMatch(/handleClipClick\(/);
    expect(body).toMatch(/queryStatus:\s*queryVaultStatus/);
    // The bookmark capture is the `clip` function (its accepted outcome carries
    // captureKind="bookmark" → the "Sent to Myne" toast).
    expect(body).toMatch(/bookmarkActiveTab\(/);
    // It surfaces both the toast and the not-ready prompt via the same seam.
    expect(body).toMatch(/showToast:/);
    expect(body).toMatch(/showPrompt:/);
  });
});
