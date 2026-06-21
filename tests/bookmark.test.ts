// Unit tests for the BOOKMARK handler (url-bookmark task 1).
//
// The bookmark is the SECONDARY capture action — bound to the context-menu entry
// and the keyboard command, NEVER the toolbar primary (which stays the
// full-article clip, SYNC-3). This handler reads the active tab's `url` + `title`,
// builds a CONTENT-LIGHT handoff payload (url + title only — no folder, no tags,
// no metadata popup, SYNC-15/SYNC-16), and dispatches it across the foundation's
// native-messaging bridge.
//
// The handler is kept PURE + injectable: the tab accessor and the bridge client
// are both injected here, so the handler is tested with NO `browser` global and
// NO real native-messaging port. The `browser.contextMenus` /
// `browser.commands` registration is the thin adapter (wired in the background
// entry), not under test here.
//
// Behaviour under test:
//   - given a fake tab, the handler builds a payload carrying the page url+title
//     and dispatches it via the (mocked) bridge client;
//   - the payload is content-light: capture_kind = "bookmark", no folder, no tags,
//     no markdown article body;
//   - the handler opens NO popup / picker (it never reaches for one);
//   - a tab with no url is a no-op (nothing dispatched);
//   - the handler returns the bridge outcome verbatim (honest pass-through).
import { describe, expect, it, vi } from "vitest";

import {
  bookmarkActiveTab,
  type BookmarkBridge,
  type BookmarkPayload,
  type BookmarkTab,
  type BookmarkTabAccessor,
} from "../src/background/bookmark";
import type { ClipOutcome } from "../src/background/clip";

/** A fake tab accessor returning a fixed tab. */
function fakeTabAccessor(tab: BookmarkTab | null): BookmarkTabAccessor {
  return () => Promise.resolve(tab);
}

/** A fake bridge client that records every dispatched payload. */
function fakeBridge(
  outcome: ClipOutcome = { status: "accepted", confirm: "Sent to Myne", captureKind: "bookmark" },
): BookmarkBridge & { dispatched: BookmarkPayload[] } {
  const dispatched: BookmarkPayload[] = [];
  return {
    dispatched,
    dispatch(payload: BookmarkPayload): Promise<ClipOutcome> {
      dispatched.push(payload);
      return Promise.resolve(outcome);
    },
  };
}

describe("bookmarkActiveTab — content-light payload", () => {
  it("reads tab.url + tab.title and dispatches a payload carrying them", async () => {
    const bridge = fakeBridge();
    const tab: BookmarkTab = {
      url: "https://example.com/article",
      title: "An Example Article",
    };

    const outcome = await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor(tab),
      bridge,
    });

    expect(bridge.dispatched).toHaveLength(1);
    const payload = bridge.dispatched[0];
    expect(payload.sourceUrl).toBe("https://example.com/article");
    expect(payload.title).toBe("An Example Article");
    expect(outcome.status).toBe("accepted");
  });

  it("tags the payload as a bookmark capture (content-light, secondary action)", async () => {
    const bridge = fakeBridge();
    await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor({
        url: "https://example.com/x",
        title: "X",
      }),
      bridge,
    });
    expect(bridge.dispatched[0].captureKind).toBe("bookmark");
  });

  it("carries no folder, no tags, no article body (content-light)", async () => {
    const bridge = fakeBridge();
    await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor({
        url: "https://example.com/y",
        title: "Y",
      }),
      bridge,
    });
    const payload = bridge.dispatched[0];
    // No vault structure ever crosses the bridge (SYNC-15): no folder, no tags.
    expect("destinationFolder" in payload).toBe(false);
    expect("tags" in payload).toBe(false);
    expect("folder" in payload).toBe(false);
    // No extracted article markdown — the bookmark is url+title only.
    expect("markdownBody" in payload).toBe(false);
    expect("articleBody" in payload).toBe(false);
  });

  it("stamps an ISO-8601 capture date on the payload", async () => {
    const bridge = fakeBridge();
    await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor({
        url: "https://example.com/z",
        title: "Z",
      }),
      bridge,
    });
    const payload = bridge.dispatched[0];
    expect(typeof payload.clipDate).toBe("string");
    // Round-trips as a real date (ISO-8601 / RFC-3339-shaped).
    expect(Number.isNaN(Date.parse(payload.clipDate))).toBe(false);
  });

  it("returns the bridge outcome verbatim (honest pass-through)", async () => {
    const locked = fakeBridge({ status: "locked" });
    const outcome = await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor({ url: "https://example.com", title: "T" }),
      bridge: locked,
    });
    expect(outcome).toEqual({ status: "locked" });
  });
});

describe("bookmarkActiveTab — no popup / picker, no spurious dispatch", () => {
  it("opens no popup or picker (the handler only touches the bridge + tab accessor)", async () => {
    // The handler is invoked with ONLY a tab accessor and a bridge — there is no
    // popup/picker seam to call. We assert the contract by construction: a window
    // accessor that throws if any popup-opening API is touched is never invoked.
    const popupTrap = vi.fn(() => {
      throw new Error("the bookmark handler must not open a popup/picker");
    });
    const bridge = fakeBridge();
    await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor({ url: "https://example.com", title: "T" }),
      bridge,
      // An optional escape hatch the handler must never call for a bookmark.
      openPicker: popupTrap,
    });
    expect(popupTrap).not.toHaveBeenCalled();
  });

  it("a tab with no url is a no-op — nothing is dispatched", async () => {
    const bridge = fakeBridge();
    const outcome = await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor({ url: undefined, title: "T" }),
      bridge,
    });
    expect(bridge.dispatched).toHaveLength(0);
    expect(outcome.status).toBe("error");
  });

  it("a null tab (no active tab) is a no-op — nothing is dispatched", async () => {
    const bridge = fakeBridge();
    const outcome = await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor(null),
      bridge,
    });
    expect(bridge.dispatched).toHaveLength(0);
    expect(outcome.status).toBe("error");
  });

  it("a tab with no title still dispatches (title defaults to empty, url is the load-bearing field)", async () => {
    const bridge = fakeBridge();
    await bookmarkActiveTab({
      getActiveTab: fakeTabAccessor({ url: "https://example.com/no-title", title: undefined }),
      bridge,
    });
    expect(bridge.dispatched).toHaveLength(1);
    expect(bridge.dispatched[0].sourceUrl).toBe("https://example.com/no-title");
    expect(bridge.dispatched[0].title).toBe("");
  });
});
