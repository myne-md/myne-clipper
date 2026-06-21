// Background entry point — ONE source for all three targets.
//
// Cross-browser background: this same bundle is loaded as a Chromium MV3
// service worker (`background.service_worker` in the manifest) AND as a Firefox
// MV3 event-page script (`background.scripts`). `webextension-polyfill` papers
// over the `chrome.*` (callback) vs `browser.*` (promise) API split so we write
// `browser.*` once and it runs on Chrome, Edge, and Firefox (SYNC-4).
//
// Keyless by design: this background never holds a vault key and is structurally
// incapable of decrypting anything (A14). It orchestrates the tracer-bullet clip
// (capture -> handoff envelope -> native-messaging host) but holds only the
// scoped pairing token (NOT a key) and writes nothing to storage (SYNC-1a).
import browser from "webextension-polyfill";

import {
  ALREADY_PAIRED_NOTICE,
  pairingCodeNotice,
  PAIRED_NOTICE,
  PAIRING_NOTICE,
} from "../lib/load-bearing-copy";
import type { PromptKind } from "../lib/prompt-model";

import { bookmarkActiveTab } from "./bookmark";
import {
  defaultBookmarkBridge,
  defaultBookmarkTabAccessor,
} from "./bookmark-adapter";
import { createBrowserActionAdapter } from "./browser-action-adapter";
import { clipActiveTab, type ClipOutcome } from "./clip";
import { createIconController } from "./icon-controller";
import { openMyneForeground } from "./open-foreground";
import { requestPairing } from "./pair";
import { defaultSendPairRequest } from "./pair-adapter";
import { getPairingToken, setPairingToken } from "./pairing-token";
import { queryVaultStatus } from "./status";
import { iconStateForStatus, type VaultStatus } from "./status-wire";
import { createStatusPoller } from "./status-poller";
import { handleClipClick, type ToastVariant } from "./toolbar";

// The single toolbar-icon controller, driven by real clip outcomes. The pure
// four-state machine lives in `../lib/icon-state`; the real `browser.action`
// rendering is the injected adapter (the only `browser.action.*` call site).
const iconController = createIconController({
  adapter: createBrowserActionAdapter(),
});

// Drive the icon from one honest clip outcome (the `accepted | error | locked |
// unreachable` mapping from foundation task 8): `accepted` -> saved (auto-returns
// to idle); `locked` -> locked; `error`/`unreachable` -> idle (the failure reset,
// story 21 — a failed/closed clip never sticks in "clipping").
function reflectOutcome(outcome: ClipOutcome): void {
  switch (outcome.status) {
    case "accepted":
      iconController.clipSucceeded();
      return;
    case "locked":
      iconController.lock();
      return;
    case "error":
    case "unreachable":
      iconController.clipFailed();
      return;
  }
}

// Run a clip and reflect both its start (idle -> clipping) and its outcome on the
// toolbar icon, then return the outcome to the caller (the popup).
async function clipAndReflect(): Promise<ClipOutcome> {
  iconController.clipStarted();
  const outcome = await clipActiveTab();
  reflectOutcome(outcome);
  return outcome;
}

/** The message the popup sends to trigger a clip of the active tab. */
interface ClipRequest {
  readonly type: "myne-clip";
}

function isClipRequest(msg: unknown): msg is ClipRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "myne-clip"
  );
}

// The popup-initiated clip path: capture the active tab, hand off to the
// desktop, and return the host's reply (or the honest `unreachable` state) so
// the popup can render the right surface. Returning a Promise sends the
// response (under `webextension-polyfill`).
browser.runtime.onMessage.addListener(
  (message: unknown): Promise<ClipOutcome> | undefined => {
    if (!isClipRequest(message)) return undefined;
    return clipAndReflect();
  },
);

// Content → background: the toast "view" and the locked-prompt activate both ask
// the background to open/foreground the desktop (clip-time-ux task 7). The
// extension is keyless and learns no note id from the tiny host reply, so both
// route to the same launch-poke; the desktop owns bringing its window forward
// (and showing the just-saved note). No storage, no clip — a launch poke only.
function isOpenMyneRequest(msg: unknown): boolean {
  if (typeof msg !== "object" || msg === null) return false;
  const type = (msg as { type?: unknown }).type;
  return type === "myne-open-foreground" || type === "myne-open-note";
}

browser.runtime.onMessage.addListener((message: unknown): undefined => {
  if (isOpenMyneRequest(message)) openMyneForeground();
  return undefined;
});

// --- The PRIMARY toolbar action: one-click CLIP (clip-time-ux task 8) --------
//
// The manifest no longer declares a `default_popup`, so a toolbar click fires
// `action.onClicked` and runs the no-popup quick-clip flow directly: read the
// vault state, then clip (unlocked) or show the in-page prompt (not ready). The
// in-page toast/prompt are hosted by the content overlay (`content/notices.ts`),
// which the background reaches by injecting the bundle + messaging the tab. The
// toolbar primary action is the full-article CLIP (SYNC-3), never the bookmark.

/** Messages the background sends the content overlay to surface a notice. */
type ShowNoticeMessage =
  | { readonly type: "myne-show-toast"; readonly variant: ToastVariant }
  | { readonly type: "myne-show-prompt"; readonly kind: PromptKind }
  | { readonly type: "myne-show-error"; readonly reason: string }
  | { readonly type: "myne-show-progress"; readonly message: string }
  | { readonly type: "myne-show-info"; readonly message: string };

/** Resolve the active tab id, or `null` when there is no usable active tab. */
async function activeTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id !== undefined ? tab.id : null;
}

// Inject the content overlay bundle (idempotent — `setupNotices` is guarded) so
// the tab can host the toast/prompt, then message it. Best-effort: injection
// fails on privileged pages (settings, the web store) → nothing to show.
async function showInTab(
  tabId: number | null,
  message: ShowNoticeMessage,
): Promise<void> {
  if (tabId === null) return;
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch {
    return; // privileged page — no overlay possible
  }
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    // content unreachable — best effort; the icon state already reflects the result
  }
}

// Initiate the pairing handshake (the desktop Accept dialog) + store the minted
// token durably. The ONE pair-trigger seam: the toolbar/bookmark handlers call it
// when the vault is `unpaired` (so the click itself starts pairing), and the
// `pair-myne` command calls it too. Pure branch logic is `requestPairing`; this
// supplies the real `connectNative` pair request + the durable token store.
function requestPair(onChallenge: (code: string) => void) {
  return requestPairing({
    sendPairRequest: defaultSendPairRequest,
    storeToken: setPairingToken,
    showChallenge: onChallenge,
  });
}

/** A tab-scoped pairing trigger: shows the relayed challenge code in the page's
 *  in-flight banner so the user can compare it with the Myne Accept dialog. The
 *  clip/bookmark handlers receive this as their no-arg `requestPair` dep. */
function requestPairShowingCode(tabId: number | null) {
  return requestPair((code) =>
    showInTab(tabId, {
      type: "myne-show-progress",
      message: pairingCodeNotice(code),
    }),
  );
}

// The one-click toolbar handler: vault-state branch + clip handoff + in-page
// feedback. The branch logic is the pure `handleClipClick` (unit-tested); this
// supplies the live bridge, icon controller, tab messaging, and the pair trigger
// (an unpaired click starts pairing, then clips).
async function handleToolbarClipClick(): Promise<void> {
  const tabId = await activeTabId();
  await handleClipClick({
    queryStatus: queryVaultStatus,
    clip: clipActiveTab,
    icon: iconController,
    showToast: (variant) => showInTab(tabId, { type: "myne-show-toast", variant }),
    showPrompt: (kind) => showInTab(tabId, { type: "myne-show-prompt", kind }),
    showError: (reason) => showInTab(tabId, { type: "myne-show-error", reason }),
    showProgress: (message) =>
      showInTab(tabId, { type: "myne-show-progress", message }),
    requestPair: () => requestPairShowingCode(tabId),
  });
}

browser.action.onClicked.addListener(() => {
  void handleToolbarClipClick();
});

// --- The SECONDARY capture action: BOOKMARK (context-menu + hotkey) ---------
//
// SYNC-3: the bookmark is the secondary one-gesture action, bound ONLY to the
// context-menu entry and the keyboard command — never the toolbar primary. Both
// triggers below call the ONE pure handler (`bookmarkActiveTab`) with the real
// platform seams (`./bookmark-adapter`), which reuses the foundation's
// native-messaging transport. The icon reflects the bookmark outcome just like a
// clip (a bookmark is a degenerate clip).

/** The single id for the bookmark context-menu item + the command. */
const BOOKMARK_MENU_ID = "myne-bookmark-page";
const BOOKMARK_COMMAND = "bookmark-page";

/** The keyboard command that initiates pairing with the desktop. */
const PAIR_COMMAND = "pair-myne";

/** The context-menu id for the always-available "Pair with Myne" entry (so the
 *  user can (re-)pair after a revoke without a hidden shortcut). */
const PAIR_MENU_ID = "myne-pair";

/** The context-menu id for "Clip to Myne", shown ONLY on a text selection
 *  (`contexts: ["selection"]`). It runs the same clip flow as the toolbar — the
 *  in-page capture detects the active selection and sends a `selection` clip. */
const CLIP_SELECTION_MENU_ID = "myne-clip-selection";

/** The context-menu id for "Clip this page to Myne" — the FULL-PAGE clip on the
 *  page right-click menu (`contexts: ["page"]`), so clipping never relies on the
 *  toolbar button. Same flow as the toolbar; with no selection the capture emits
 *  a full-article clip. */
const CLIP_PAGE_MENU_ID = "myne-clip-page";

// Run a bookmark through the SAME vault-state branch as the toolbar clip
// (clip-time-ux task 10): read the vault state, then (unlocked) run the
// content-light bookmark handoff and show the "Sent to Myne" toast, or (not
// ready) the same locked/closed/unpaired prompt — capturing nothing. It reuses
// `handleClipClick`: the bookmark is just a different `clip` function whose
// accepted outcome carries `captureKind="bookmark"`, so the toast renders the
// "Sent to Myne" variant. (`activeTabId`/`showInTab`/`handleClipClick` are
// defined in the clip section above.)
async function handleToolbarBookmark(): Promise<void> {
  const tabId = await activeTabId();
  await handleClipClick({
    queryStatus: queryVaultStatus,
    clip: () =>
      bookmarkActiveTab({
        getActiveTab: defaultBookmarkTabAccessor,
        bridge: defaultBookmarkBridge(),
      }),
    icon: iconController,
    showToast: (variant) => showInTab(tabId, { type: "myne-show-toast", variant }),
    showPrompt: (kind) => showInTab(tabId, { type: "myne-show-prompt", kind }),
    showError: (reason) => showInTab(tabId, { type: "myne-show-error", reason }),
    showProgress: (message) =>
      showInTab(tabId, { type: "myne-show-progress", message }),
    requestPair: () => requestPairShowingCode(tabId),
  });
}

// Register the context-menu item. Menu items must be (re)created on install /
// startup — they are not declared in the manifest. No persisted state, no clip
// buffer (SYNC-1a); the menu entry is a stateless trigger.
function registerBookmarkMenu(): void {
  // `contexts: ["page"]` puts the entries on the page right-click menu. We do NOT
  // restrict by `documentUrlPatterns` (no `<all_urls>`); `activeTab` grants the
  // tab read on the click gesture. Order = display order.
  //
  // PRIMARY: clip the WHOLE PAGE from the right-click menu — clipping must never
  // depend on the toolbar button. Same flow as the toolbar; with no selection the
  // capture emits a full-article clip.
  browser.contextMenus.create({
    id: CLIP_PAGE_MENU_ID,
    title: "Clip this page to Myne",
    contexts: ["page"],
  });
  // "Clip to Myne" — shown ONLY when text is selected (`contexts: ["selection"]`,
  // which is NOT shown for a plain page click, so it never collides with the
  // full-page entry above). The capture sees the live selection and emits a
  // `selection` clip (formatted via the recursive walker).
  browser.contextMenus.create({
    id: CLIP_SELECTION_MENU_ID,
    title: "Clip to Myne",
    contexts: ["selection"],
  });
  browser.contextMenus.create({
    id: BOOKMARK_MENU_ID,
    title: "Bookmark this page to Myne",
    contexts: ["page"],
  });
  // The always-available pair entry — re-pairing after a desktop-side Revoke
  // (the extension still holds a now-dead token, so the toolbar never offers
  // pairing on its own). "Pair with Myne" sends a fresh bootstrap pair request,
  // overwriting any stale token.
  browser.contextMenus.create({
    id: PAIR_MENU_ID,
    title: "Pair with Myne",
    contexts: ["page", "action"],
  });
}

// The context-menu click adapter -> the clip / bookmark / pair handler.
browser.contextMenus.onClicked.addListener((info) => {
  if (
    info.menuItemId === CLIP_PAGE_MENU_ID ||
    info.menuItemId === CLIP_SELECTION_MENU_ID
  )
    void handleToolbarClipClick();
  else if (info.menuItemId === BOOKMARK_MENU_ID) void handleToolbarBookmark();
  else if (info.menuItemId === PAIR_MENU_ID) void handlePairing();
});

// --- The PAIRING trigger (pairing task 6) ------------------------------------
//
// Pairing is the FIRST contact: it sends a `pair` request with an EMPTY token,
// the user Accepts on the desktop (SYNC-6), and the desktop mints + relays a
// scoped token (NOT a key) which `requestPairing` stores durably (the FIRST
// `setPairingToken` caller). The branch logic is the pure `requestPairing`
// (unit-tested); this supplies the real `connectNative` pair request + the
// durable token store. The outcome only flips the toolbar icon to reflect
// paired/locked vs idle — pairing writes a credential, never a clip (SYNC-1a).
async function handlePairing(): Promise<void> {
  const tabId = await activeTabId();
  // Anti-spam: if a live pairing already exists, surface that instead of opening
  // another desktop dialog. Each Accept mints a FRESH scoped token, so repeated
  // "Pair with Myne" clicks would pile up credentials on the desktop. A held
  // token PLUS a status reply (unlocked/locked) proves the desktop still honours
  // it → already paired. A revoked token (silent → "closed"/"unpaired") or a
  // closed desktop yields no usable reply, so we fall through and let the user
  // (re-)pair — which is the correct recovery after a revoke.
  if ((await getPairingToken()) !== null) {
    const status = await queryVaultStatus();
    if (status === "unlocked" || status === "locked") {
      await showInTab(tabId, {
        type: "myne-show-info",
        message: ALREADY_PAIRED_NOTICE,
      });
      return;
    }
  }
  // Show an in-flight banner so the user knows to approve on the desktop; the
  // relayed challenge code replaces it (via `requestPair`'s `onChallenge`) the
  // moment phase 1 returns, so the user can compare it with the Accept dialog.
  await showInTab(tabId, { type: "myne-show-progress", message: PAIRING_NOTICE });
  const outcome = await requestPairShowingCode(tabId);
  if (outcome.kind === "paired") {
    await showInTab(tabId, { type: "myne-show-info", message: PAIRED_NOTICE });
    return;
  }
  if (outcome.kind === "unreachable") {
    await showInTab(tabId, { type: "myne-show-prompt", kind: "closed" });
    return;
  }
  // rejected: a locked desktop → reflect locked + the unlock prompt; a
  // decline/timeout → the pair prompt (try again).
  if (outcome.reason === "locked") {
    iconController.lock();
    await showInTab(tabId, { type: "myne-show-prompt", kind: "locked" });
  } else {
    await showInTab(tabId, { type: "myne-show-prompt", kind: "unpaired" });
  }
}

// The keyboard-command adapter -> the SAME one bookmark handler, plus the pairing
// trigger. The commands have NO default chord (clip-time-ux task 10 / PRD open
// question 1) — they are user-assignable in the browser's shortcuts settings so
// they never collide with a site or another extension. The manifest declares the
// commands without a `suggested_key`.
browser.commands.onCommand.addListener((command) => {
  if (command === BOOKMARK_COMMAND) void handleToolbarBookmark();
  else if (command === PAIR_COMMAND) void handlePairing();
});

// --- Passive locked/unlocked icon-status read (clip-time-ux task 12) ---------
//
// Reflect the desktop's locked/unlocked state on the toolbar icon so the user can
// tell at a glance whether a click will save or prompt-to-unlock (story 19). The
// read is CHEAP: a cadence-guarded poller (`./status-poller`) throttles bridge
// queries, and it is triggered only on conservative, event-driven moments (focus
// / active-tab change / startup) — never tight periodic polling.

// Apply a passively-read status to the icon, but NEVER disturb an in-flight or
// just-finished clip (only reflect when the icon is at rest: idle or locked).
function applyStatusToIcon(status: VaultStatus): void {
  const state = iconController.state;
  if (state === "clipping" || state === "saved") return;
  if (iconStateForStatus(status) === "idle") iconController.unlock();
  else iconController.lock();
}

const statusPoller = createStatusPoller({
  query: queryVaultStatus,
  apply: applyStatusToIcon,
});

// Conservative triggers: the browser regaining focus, the active tab changing,
// and startup. The poller's guard collapses bursts to one query per interval, so
// these never become a tight poll loop.
browser.windows.onFocusChanged.addListener(() => void statusPoller.poll());
browser.tabs.onActivated.addListener(() => void statusPoller.poll());
browser.runtime.onStartup.addListener(() => void statusPoller.poll());

// Lifecycle hook — no persisted state, no clip buffer (SYNC-1a). Set up the
// stateless bookmark context-menu entry and do one passive status read.
browser.runtime.onInstalled.addListener(() => {
  registerBookmarkMenu();
  void statusPoller.poll();
});

export {};
