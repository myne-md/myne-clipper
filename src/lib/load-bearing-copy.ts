// Load-bearing copy — the capture-surface status strings whose EXACT wording is
// a product-honesty + privacy property, not a style choice.
//
// WHY THIS MODULE EXISTS (clip-time-ux, sub-feature 4 — the single source of
// truth for the feature's capture copy):
//   These literals are the strings a user actually reads when a clip succeeds,
//   a bookmark is sent, or the vault is locked. They are SECURITY/HONESTY
//   load-bearing, not cosmetic:
//     - The success strings are a HANDOFF acknowledgement, never a write claim.
//       The desktop is the sole authority on whether the note was written
//       (SYNC-13). So the word "Encrypted" (or "Written" / "Saved to vault") is
//       deliberately ABSENT — the extension is keyless and structurally cannot
//       know a vault write happened.
//     - Voice is Myne's: sentence case, an em-dash (not a hyphen) in the locked
//       string, no emoji, no hype words (PRODUCT.md / docs/design/README.md).
//   The E2E (clip-time-ux task 13) asserts each string by FULL-LITERAL EQUALITY
//   against this module — a substring match would silently pass a future copy
//   drift, so importers must render the constant verbatim and NEVER inline a
//   copy. Changing any literal here is a product-voice decision, not a copy edit.
//
// CONTRACT COPY, NOT AN IMPORT. This is the `myne-clipper` projection of the
// main repo's `src/lib/load-bearing-copy.ts`. The extension is keyless and does
// not link `protocol/` or import the desktop `src/` tree (SYNC-5) — these
// literals are re-declared here, never reached across repos.

/**
 * Handoff-accepted confirm for a page CLIP (full-article / selection).
 *
 * SYNC-13: this means "the desktop accepted the handoff", NOT "encrypted and
 * written to the vault". Never use "Encrypted" / "Written" here. Asserted by
 * full-literal E2E equality.
 */
export const SAVED_TO_MYNE = "Saved to Myne";

/**
 * Handoff-accepted confirm for a BOOKMARK (url-only capture; sub-feature 5).
 *
 * Same honesty contract as `SAVED_TO_MYNE` — a handoff acknowledgement, never a
 * write claim (SYNC-13). Asserted by full-literal E2E equality.
 */
export const SENT_TO_MYNE = "Sent to Myne";

/**
 * Locked-vault STATUS / prompt copy: the desktop replied `locked` (or is
 * closed / unreachable). The whole prompt surface is the click target that
 * opens/foregrounds Myne (clip-time-ux task 7).
 *
 * Note the EM-DASH (U+2014 "—"), not a hyphen-minus, and sentence case. This is
 * the SCREEN/status string; the locked-state ACTION BUTTON label is the
 * separate `UNLOCK_MYNE` constant below. Asserted by full-literal E2E equality.
 */
export const MYNE_LOCKED = "Myne is locked — click to unlock";

/**
 * Locked-state ACTION-BUTTON label (the affordance the user clicks to unlock).
 *
 * Distinct from `MYNE_LOCKED` (the status/screen copy) on purpose: the prompt
 * SAYS "Myne is locked — click to unlock" and its button READS "Unlock Myne".
 * (Foundation sub-feature 1 introduced this as its button label.)
 */
export const UNLOCK_MYNE = "Unlock Myne";

/**
 * Closed-desktop prompt: the native host is unreachable (app not running). The
 * locked and closed cases share the honest "Myne isn't ready" framing
 * (`MYNE_LOCKED`); this is the closed-state action-button label.
 */
export const OPEN_MYNE_TO_CLIP = "Open Myne to clip";

// Toolbar-icon passive-read titles (clip-time-ux sub-feature 4, task 2) --------
// `browser.action.setTitle` hover text — the platform's passive, color-free read
// of the toolbar-icon state (idle / clipping / saved). These distinguish the icon
// states by TEXT, alongside the distinct glyph SHAPE, so no state is told apart by
// color alone (PRODUCT.md accessibility, story 18). They live here (not inlined in
// the controller) so the icon and any future surface render ONE set of strings.
// Sentence case, no emoji, no "Encrypted"/write claim (SYNC-13) — same voice as
// the capture literals above. The SAVED title reuses `SAVED_TO_MYNE`; LOCKED reuses
// `MYNE_LOCKED`; only idle and clipping need their own title here.

/** Idle toolbar-icon hover title: the resting "ready to clip" status read. */
export const ICON_TITLE_IDLE = "Clip this page to Myne";

/** Clipping toolbar-icon hover title: the in-flight "capture underway" status. */
export const ICON_TITLE_CLIPPING = "Clipping to Myne…";

// Capture-surface AFFORDANCE labels (clip-time-ux tasks 4–7) -------------------
// Ordinary UI action labels for the injected toast + locked prompt. Unlike the
// three honesty literals above, these are NOT the full-literal-E2E-asserted
// strings — they are conventional affordance copy, kept here only so every
// capture surface renders ONE set of words. Sentence case, no emoji (Myne voice).

/** The toast's inline "view the saved note" action (clip success only). */
export const VIEW_NOTE = "View";

/** The toast's manual-dismiss control accessible label. */
export const DISMISS_NOTICE = "Dismiss";

/**
 * Unpaired first-run prompt status copy (story 26): the extension is not yet
 * paired with a desktop vault. Distinct from `MYNE_LOCKED` (paired-but-locked)
 * — pairing is an action the user takes once, in the desktop app.
 */
export const MYNE_UNPAIRED = "Pair with Myne to start clipping";

/** Unpaired-state action-button label (opens/foregrounds Myne to pair). */
export const PAIR_WITH_MYNE = "Open Myne to pair";

// Honest FAILURE copy (clip-time-ux task 11) ----------------------------------
// Shown when a handoff is rejected / flaky. The honesty rule (story 20): a
// failure must NEVER read as a success — these are deliberately distinct from
// `SAVED_TO_MYNE` / `SENT_TO_MYNE` and never claim a write. Sentence case, no
// emoji, no hype (story 25).

/** Generic handoff-failure copy (rejected / malformed / host vanished mid-clip). */
export const CLIP_FAILED = "Couldn’t clip — try again";

/** Rate-limited handoff copy: the host's flood guard tripped (be specific). */
export const CLIP_RATE_LIMITED = "Myne is busy — wait a moment and try again";

// PROGRESS / PAIRING in-page notices (the "what's happening" banner) -----------
// Shown WHILE a handoff is in flight, replaced by the outcome (saved / error /
// prompt). Sentence case, no emoji, no hype.

/** In-flight capture banner — replaced by "Saved/Sent to Myne" or an error. */
export const SAVING_NOTICE = "Saving to Myne…";

/** In-flight pairing banner — tells the user to approve on the desktop. Shown
 *  first (before the challenge arrives), then replaced by {@link pairingCodeNotice}. */
export const PAIRING_NOTICE = "Pairing — approve in Myne";

/**
 * In-flight pairing banner carrying the numeric COMPARISON CODE the desktop
 * relayed (SYNC-6 phase 1). The user confirms this code matches the one in the
 * Myne Accept dialog BEFORE approving — that binds the approval to this exact
 * extension. A human-comparison nonce, safe to display; gates nothing.
 */
export function pairingCodeNotice(code: string): string {
  return `Pairing code ${code} — approve in Myne`;
}

/** Pairing-succeeded confirmation (the extension is now paired). */
export const PAIRED_NOTICE = "Paired with Myne";

/** Shown when the user triggers pairing but a live pairing already exists. */
export const ALREADY_PAIRED_NOTICE = "Already paired with Myne";
