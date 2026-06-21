// The shared injected-overlay host (clip-time-ux task 4; reused by task 7's
// prompt). One fixed, click-through Shadow DOM host per page into which the
// capture surfaces (toast / locked prompt) mount, isolated from the hostile page.
//
// Why a Shadow DOM host:
//   - `all: initial` + the scoped `.myne-overlay` tokens (`../lib/tokens.css`)
//     already sever the host page's cascade both ways; a closed-over shadow root
//     is the strongest wall on top — the page's CSS and scripts cannot restyle or
//     read our surface, and ours cannot leak onto the page.
//   - Styles are INLINED into the shadow root (no `web_accessible_resources`, no
//     runtime fetch) — every byte ships in the content bundle. The token CSS is
//     imported as text via esbuild's `text` loader (see `scripts/build.mjs`).
//
// The host is `pointer-events: none` and covers the viewport; each surface panel
// re-enables `pointer-events: auto` on itself, so the overlay never blocks the
// page. Surfaces stack bottom-right in the anchor (the Toast pattern placement).
import tokensCss from "../lib/tokens.css";

/** The light-DOM host element id (one per page; idempotent). */
const HOST_ID = "myne-clip-overlay";

/** Structural layout for the overlay wrapper + the bottom-right surface anchor.
 *  Loaded AFTER the token CSS so its explicit `position` overrides the
 *  `.myne-overlay { all: initial }` reset for the wrapper's own box. */
const OVERLAY_BASE_CSS = `
.myne-overlay { position: absolute; inset: 0; pointer-events: none; }
.myne-overlay__anchor {
  position: absolute; bottom: 16px; right: 16px;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
  max-width: min(360px, calc(100vw - 32px));
}
`;

/** The handle surfaces use to mount themselves into the shared overlay. */
export interface OverlayHandle {
  /** The bottom-right anchor element surfaces append their panel to. */
  readonly anchor: HTMLElement;
  /** The shadow root (for surfaces that need to inject their own component CSS). */
  readonly root: ShadowRoot;
  /** Inject a component stylesheet once (keyed by `id`; repeat calls are no-ops). */
  injectStyle(id: string, css: string): void;
}

function injectStyleInto(root: ShadowRoot, id: string, css: string): void {
  const attr = "data-myne-style";
  for (const existing of root.querySelectorAll(`style[${attr}]`)) {
    if (existing.getAttribute(attr) === id) return; // already mounted
  }
  const style = root.ownerDocument.createElement("style");
  style.setAttribute(attr, id);
  style.textContent = css;
  root.appendChild(style);
}

/**
 * Get (or lazily create) the page's overlay host and return a handle to mount
 * into. Idempotent: a second call returns the same host + anchor, so the toast
 * and the prompt share one shadow root and the token CSS is injected once.
 */
export function ensureOverlay(doc: Document = document): OverlayHandle {
  const existing = doc.getElementById(HOST_ID);
  if (existing && existing.shadowRoot) {
    const root = existing.shadowRoot;
    const anchor = root.querySelector<HTMLElement>(".myne-overlay__anchor");
    if (anchor) {
      return {
        anchor,
        root,
        injectStyle: (id, css) => injectStyleInto(root, id, css),
      };
    }
  }

  const host = doc.createElement("div");
  host.id = HOST_ID;
  // Light-DOM host box: fixed, top-layer, click-through. Inline so it survives
  // even if the page has aggressive `div` rules (it is outside the shadow root).
  host.style.cssText =
    "position:fixed;inset:0;margin:0;padding:0;border:0;z-index:2147483647;pointer-events:none;";

  const root = host.attachShadow({ mode: "open" });
  injectStyleInto(root, "tokens", tokensCss);
  injectStyleInto(root, "overlay-base", OVERLAY_BASE_CSS);

  const overlay = doc.createElement("div");
  overlay.className = "myne-overlay";
  const anchor = doc.createElement("div");
  anchor.className = "myne-overlay__anchor";
  overlay.appendChild(anchor);
  root.appendChild(overlay);

  (doc.body ?? doc.documentElement).appendChild(host);

  return {
    anchor,
    root,
    injectStyle: (id, css) => injectStyleInto(root, id, css),
  };
}
