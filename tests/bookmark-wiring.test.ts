// Wiring guard for the bookmark TRIGGERS (url-bookmark task 1).
//
// The background entry (`src/background/index.ts`) imports `webextension-polyfill`
// at module load, which throws outside a real extension — so we cannot import it
// under Node/Vitest. Instead this guard reads the entry SOURCE and pins the three
// load-bearing routing invariants the acceptance criteria require:
//
//   1. The bookmark is reachable from BOTH the context-menu AND the keyboard
//      command, and both call the SAME one handler.
//   2. The toolbar primary action (`action.onClicked`) still routes to the CLIP
//      path, NEVER to the bookmark handler (SYNC-3 — clip is the headline action).
//
// A source-shape guard is the right tool here: the actual click/command dispatch
// is browser-runtime behaviour (covered E2E later), but the routing CONTRACT —
// which trigger calls which handler — is a wiring decision this test locks so a
// later edit cannot silently cross the wires (e.g. bind the toolbar to bookmark).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ENTRY = fileURLToPath(
  new URL("../src/background/index.ts", import.meta.url),
);
const source = readFileSync(ENTRY, "utf8");

describe("the bookmark context-menu + hotkey both invoke the one handler", () => {
  it("registers a context-menu item and routes its click to a bookmark run", () => {
    expect(source).toMatch(/contextMenus\.create\(/);
    expect(source).toMatch(/contextMenus\.onClicked\.addListener/);
    // The context-menu click adapter dispatches a bookmark run.
    const onClickedBlock = source.slice(
      source.indexOf("contextMenus.onClicked.addListener"),
    );
    expect(onClickedBlock).toMatch(/handleToolbarBookmark\(\)/);
  });

  it("registers a keyboard command and routes it to the SAME bookmark run", () => {
    expect(source).toMatch(/commands\.onCommand\.addListener/);
    const onCommandBlock = source.slice(
      source.indexOf("commands.onCommand.addListener"),
    );
    expect(onCommandBlock).toMatch(/handleToolbarBookmark\(\)/);
  });

  it("the single bookmark run delegates to the pure `bookmarkActiveTab` handler", () => {
    expect(source).toMatch(/bookmarkActiveTab\(/);
    // It is wired with the real injected seams (the default tab accessor + the
    // foundation-reusing bridge), not a re-defined transport.
    expect(source).toMatch(/getActiveTab:\s*defaultBookmarkTabAccessor/);
    expect(source).toMatch(/bridge:\s*defaultBookmarkBridge\(\)/);
  });
});

describe("the toolbar primary action stays the CLIP path (SYNC-3), untouched", () => {
  it("action.onClicked routes to the clip, NOT the bookmark handler", () => {
    const start = source.indexOf("action.onClicked.addListener");
    // Scope to the listener BODY only (up to its closing `});`), so the assertion
    // does not bleed into the bookmark section that follows.
    const onClickedBody = source.slice(start, source.indexOf("});", start) + 3);
    // clip-time-ux task 8: the toolbar click is now the one-click vault-state
    // handler (`handleToolbarClipClick`), which runs the CLIP path — never the
    // bookmark handler.
    expect(onClickedBody).toMatch(/handleToolbarClipClick\(\)/);
    expect(onClickedBody).not.toMatch(/bookmark/i);
  });

  it("the toolbar action click never calls the bookmark run", () => {
    // The only callers of `bookmarkAndReflect` are the context-menu + command
    // adapters — never the toolbar `action` listener.
    const actionListenerIndex = source.indexOf("action.onClicked.addListener");
    const actionListenerBody = source.slice(
      actionListenerIndex,
      source.indexOf("});", actionListenerIndex) + 3,
    );
    expect(actionListenerBody).not.toMatch(/bookmarkAndReflect/);
  });
});
