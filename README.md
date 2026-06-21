# myne-clipper

> Companion repository to [`myne`](https://github.com/myne-md/myne). The Myne browser extension — a **keyless** web clipper that captures the page you are reading and hands it to the running Myne desktop app, which is the sole crypto site.

The extension targets **Chrome, Edge, and Firefox** as a single Manifest V3 codebase, reconciling the Chromium service-worker background and the Firefox event-page background through [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill) (SYNC-4). **Safari is out of v1 scope** — the localhost-bridge fallback Safari would need is deferred (SYNC-6 / SYNC-28).

It is **keyless by design**: the extension never receives the vault master key (`root_key`) or any per-note key (`item_key`), holds no plaintext queue, and is structurally incapable of decrypting anything in the vault. A captured clip is handed to the unlocked desktop core over a native-messaging channel (trust boundary **TB10**), which does all encryption via its existing pipeline. Even a fully compromised extension build (adversary **A14**) cannot read the vault. See [`CLAUDE.md`](CLAUDE.md) for the supply-chain and dependency-discipline rules, and the epic + PRDs under the main repo's `agent tooling/` (`epics/browser-extension/`, `features/ext-foundation-handoff/`) for the design canon.

## Build

```bash
pnpm install      # this repo's OWN lockfile — never the main repo's
pnpm build        # esbuild → dist/ (manifest + background + content + popup + icons)
pnpm typecheck    # tsc --noEmit
```

`pnpm build` emits an unpacked extension into `dist/`. Load it:

- **Chrome / Edge** — `chrome://extensions` (or `edge://extensions`) → enable Developer mode → **Load unpacked** → select `dist/`.
- **Firefox** — `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `dist/manifest.json`.

### Cross-browser MV3 strategy

A **single `manifest.json`** carries **both** background keys: `background.service_worker` (Chromium MV3 reads it, Firefox ignores it) and `background.scripts` (Firefox MV3 event page reads it, Chromium ignores it), both pointing at the same bundled `background.js`. No per-target manifest is generated. The background is bundled as a **classic IIFE script** (not an ES module) so the one bundle loads identically as a Chromium service worker and a Firefox event-page script. [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill) reconciles `chrome.*` (callback) vs `browser.*` (promise) at the API level, so a **single source** compiles for all three targets (SYNC-4).

Permissions are deliberately minimal: `nativeMessaging` (the desktop clip channel, TB10), plus `activeTab` + `scripting` for the eventual **user-gesture** in-page capture. There is **no `<all_urls>` host permission and no auto-injected `content_scripts`** — a broad host match would trigger the "read all your data on every site" install warning and a slow store review, and it is not needed when capture runs on a click via `activeTab`.

### Safari is out of v1 scope

Safari is **not** a v1 target. Safari Web Extensions cannot use the `nativeMessaging` host channel this extension relies on (TB10); the only path would be a deferred **localhost-bridge fallback**, which is not built in v1 (SYNC-6 / SYNC-28). Chrome, Edge, and Firefox are the v1 browsers.

## Status

The current state is the **MV3 foundation scaffold** (sub-feature 1 + 2): the loadable manifest, the single cross-browser background entry, the toolbar action, and a **stub** popup with placeholder pairing / locked / closed states. The toolbar click and popup do **no real work yet** — they load cleanly under all three runtimes. The native-messaging host wiring, pairing handshake, real clip behaviour, and final popup UX land in subsequent sub-features.
