# clip-time-ux E2E scenarios (authored; harness-gated)

> **Status:** AUTHORED, not yet runnable. The cross-process extension↔native-host
> round-trip needs the tauri-driver harness + the native-messaging E2E mechanics
> from **ext-foundation-handoff task 10** (not present in this repo yet). When that
> harness lands, implement the scenarios below against it — they reuse its
> transport, they do not invent one. The surface CONTRACT they depend on (the
> `data-testid` selectors + the load-bearing copy) is pinned by the runnable
> `tests/notice-contract.test.ts`; the surface BEHAVIORS are covered by the
> task 6/7/8/11/12 controller + handler unit tests.

The six scenarios (root AGENTS.md: a new user-facing flow ships WITH its E2E):

## 1. Paired + unlocked toolbar click → clip success
- **Pre:** desktop unlocked, extension paired.
- **Act:** click the toolbar action on an article page.
- **Assert:**
  - icon sequence: `idle → clipping → saved → idle` (title/badge reads
    "Clip this page to Myne" → "Clipping to Myne…" → "Saved to Myne"/`✓`).
  - a toast `[data-testid="clip-toast"]` appears with the FULL-LITERAL text
    **"Saved to Myne"** and a `[data-testid="clip-toast.view"]` action.
  - clicking `clip-toast.view` fires the open/foreground bridge call
    (`myne-open-note` → `openMyneForeground`).

## 2. Bookmark context-menu → "Sent to Myne"
- **Act:** right-click → "Bookmark this page to Myne" (or the user-assigned, no-
  default-chord command).
- **Assert:** a `clip-toast` with the FULL-LITERAL text **"Sent to Myne"** and NO
  view action; a content-light bookmark note lands at the vault root.

## 3. Locked desktop click → prompt, nothing captured
- **Pre:** desktop locked.
- **Act:** click the toolbar action.
- **Assert:**
  - a prompt `[data-testid="clip-prompt"]` with the FULL-LITERAL text
    **"Myne is locked — click to unlock"**.
  - clicking it (`[data-testid="clip-prompt.action"]`) fires the open/foreground
    call.
  - **nothing is written to browser/extension storage** (no clip buffer — SYNC-1a)
    and **nothing is captured** (the page DOM is never read).

## 4. Handoff `error` → non-alarming error, never "Saved", icon reset
- **Act:** force a host `error` reply mid-handoff.
- **Assert:** a `clip-toast` whose text is NEVER "Saved to Myne"/"Sent to Myne"
  (it reads "Couldn't clip — try again", or the rate-limit line); the toolbar icon
  returns to `idle` (never stuck in `clipping`).

## 5. Two rapid clips → single toast (no stacking), and ONE note
- **Act:** click twice in quick succession, the second click landing while the
  first handoff is still open.
- **Assert:**
  - only ONE `clip-toast` is present at any time (the second replaces the first);
  - the vault gains exactly ONE note. The single-toast rule above is precisely
    what would HIDE a duplicate, so the note count is the load-bearing half of
    this scenario: the second gesture is dropped by the in-flight gate
    (`background/toolbar.ts`) rather than deduped downstream — the handoff
    envelope carries no request id and desktop ingest does not dedupe (SYNC-16
    covers a deliberate re-clip, not one gesture counted twice).
  - a LATER, deliberate second clip of the same page still writes its note
    (the gate closes for the flight only, it never latches).

## 6. Reduced motion respected
- **Pre:** `prefers-reduced-motion: reduce`.
- **Assert:** the toast/prompt enter + exit are instant cuts (no slide/crossfade);
  the toast still auto-dismisses and is manually dismissable.

## Passive icon status (task 12)
- **Assert:** with the desktop locked the toolbar icon passively reads `locked`;
  unlocked → `idle`. The status read is event-cadenced (focus / tab-activate /
  startup), never tight periodic polling, and returns only the unlocked/locked
  boolean (no folders/tags/note ids).
