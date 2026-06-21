# myne-clipper/ — Myne browser extension (keyless web clipper)

> Companion repository to [`myne`](https://github.com/myne-md/myne), cloned next to it via `workspace/setup.sh` (listed in the main repo's `workspace/manifest.txt`). A **separate repo with its own supply chain** — see "Supply chain" below. License: **AGPL-3.0**. Loaded when Claude reads files here.

The Manifest V3 browser extension that clips the page you are reading into your encrypted Myne vault. Chrome + Edge + Firefox from one codebase (MV3, `webextension-polyfill`); **Safari is out of v1 scope** (localhost-bridge fallback deferred, SYNC-6 / SYNC-28).

## Keyless by design — the central commitment

This is the load-bearing security property of the whole extension, and it constrains every line of code here:

- The extension **never receives `root_key` or any `item_key`**, holds no derived key, and is **structurally incapable of decrypting anything** in the vault. The browser is a proven-hostile runtime (silent web-store auto-update supply chain + adversary-controlled page DOM); putting a vault key or the decrypted vault graph into it would silently invalidate Myne's zero-knowledge claim.
- It does **NOT link the `protocol/` Rust crate.** There is **zero crypto in this repo.** The desktop core is the sole crypto site: the extension captures a clip and hands it over a native-messaging channel (trust boundary **TB10**) to the *already-unlocked* desktop, which does all AEAD via its existing `note_create` / `attachment_import` pipeline. (This feature is ZERO new crypto.)
- **No plaintext queue.** Nothing is ever written to browser storage waiting to be ingested. When the desktop is locked or closed, the extension captures nothing and prompts the user to unlock/open Myne (SYNC-1a — zero plaintext-at-rest in the browser).
- **No vault structure (folder / tag names) ever crosses into the browser.** Clips save to the vault root; there is no folder/tag picker (SYNC-15). Assets AS3 (folder hierarchy) and AS5 (tag list) never transit the hostile runtime.
- The pairing handshake mints a **scoped, revocable token — not a key** — bound to the exact extension ID. Its scope ceiling is append-only: `create-clip` + `is-unlocked-status` only. Never CRUD, never delete, not even list-destinations/tags (post-SYNC-15). Even fully compromised (adversary **A14**), this token cannot read, modify, or delete notes.

If you ever find yourself reaching for a vault key, a crypto primitive, the `protocol/` crate, or a `chrome.storage` clip buffer in this repo — **stop.** That is a boundary violation, not a feature.

## Supply chain — separate from the main repo's TB9 anchor

This repo has its **own** dependency supply chain and its **own** TB9 review surface, deliberately isolated from the desktop's:

- It carries **its own pinned `pnpm-lock.yaml`**. It must **never** contaminate the main repo's single shared `Cargo.lock` (the TB9 audit anchor) — the extension is not a Cargo workspace member and nothing here is a Rust crate.
- The extension's supply chain is the **browser web-store auto-update chain** (adversary A14), which Myne does not control and which is *distinct* from the desktop's transitive-dependency supply chain (adversary A8). Keeping the repos separate keeps these two supply chains from cross-contaminating (SYNC-5).
- **"Adding a dependency is a security decision"** applies here exactly as it does in the main repo — and harder, because this code runs in a hostile runtime next to adversary-controlled page script. Every dependency:
  - must be **pinned to an exact version** (no `^`, no `~`) in `package.json`, with the lockfile committed;
  - must earn its place — prefer the platform (`webextension-polyfill`, the WebExtensions API, plain DOM) over a library;
  - is reviewed for transitive surface, maintenance health, and whether it could ever observe or exfiltrate page content.
- **No markdown/dialect/crypto stack in the browser.** No `unified` / `rehype` / `remark` / `@lezer` here (SYNC-11). The canonical D1 serializer and all wikilink resolution live desktop-side. In-page HTML→markdown is a **hand-rolled, zero-dependency recursive DOM walker** (`src/content/capture.ts`) — the original plan named **Defuddle** as the one markdown dependency, but the shipped capture takes no markdown dependency at all (strictly better for this hostile-runtime supply chain). The **only** runtime dependency bundled into the extension is **`webextension-polyfill`** (declared under `dependencies`; it reconciles `chrome.*`/`browser.*`); everything else is dev-only (esbuild / typescript / vitest / jsdom, never shipped). Keep the runtime surface at that single library unless another genuinely earns its place under the rules above. (The main repo's `design notes.md` 2026-06-20 MYND-444 entry still describes Defuddle — see the 2026-06-21 follow-up entry recording the switch to the hand-rolled walker.)

## Shared surfaces are published contracts, never a monorepo

The only things shared with the main repo are consumed as **published contracts**, never by linking source across repos:

- **Design tokens** (the visual system) — consumed as a published token artifact, not by importing the main repo's `docs/design/` tree.
- **The D1 dialect test-vectors** (`myne-test-vectors`) — consumed as published JSON vectors to verify the extension's emit against, not by reaching into the desktop's dialect layer.

When you need either, treat it as an external versioned dependency. Do not add a path dependency on a sibling repo.

## Layout

```
myne-clipper/
├── src/
│   ├── manifest.json ← MV3 manifest TEMPLATE (copied to dist/ by the build)
│   ├── background/   ← MV3 background (service worker on Chromium / event page on Firefox)
│   ├── content/      ← content script (runs in the adversary-controlled page DOM)
│   ├── popup/        ← pairing / locked / closed affordances (index.ts + index.html + popup.css)
│   └── icons/        ← placeholder PNG icons (real branded marks land with the design pass)
├── types/            ← local ambient .d.ts (e.g. webextension-polyfill → global browser; no new dep)
├── scripts/build.mjs ← esbuild bundler (one bundle step per entry; no dev server) → dist/
├── package.json      ← pinned, minimal devDependencies (pnpm)
├── pnpm-lock.yaml    ← this repo's OWN lockfile (separate TB9 surface)
└── tsconfig.json
```

The extension is **functionally complete** across the v1 sub-features. `pnpm build` emits a loadable unpacked extension into `dist/`, and the background implements the real flows: the native-messaging handoff envelope + transport (`src/background/{clip,envelope,host-name}.ts`), the two-phase pairing handshake (`pair*.ts`), the `is-unlocked-status` pre-check + throttled poller (`status*.ts`), durable scoped-token storage (`{pairing-token,durable-token}.ts`), the in-page DOM→markdown capture (`src/content/capture.ts`), the bookmark path, the toolbar/context-menu/command triggers, and the toast / prompt content UI. (Earlier revisions of this doc described a "stub scaffold" — that is no longer accurate; the clip / pair / bookmark / status paths all do real work.)

### Cross-browser background + manifest strategy

A **single `manifest.json`** carries **both** background keys — `background.service_worker` (Chromium reads it, Firefox ignores it) and `background.scripts` (Firefox event page reads it, Chromium ignores it) — both pointing at the same bundled `background.js`, which esbuild emits as a **classic IIFE script** (not ESM) so it loads under both runtimes. `webextension-polyfill` reconciles `chrome.*` vs `browser.*`, so ONE source compiles for all three targets (SYNC-4). Permissions are `nativeMessaging` + `activeTab` + `scripting` + `contextMenus` + `storage` — **never `<all_urls>`** and **no `host_permissions`** (a broad host match triggers the "read all your data" warning + a slow review; user-gesture capture via `activeTab` doesn't need it). The two beyond the original three each earn their place: **`storage`** persists ONLY the scoped pairing token (`src/background/pairing-token.ts` / `durable-token.ts`) — **never a captured-clip buffer** (SYNC-1a, zero plaintext-at-rest); **`contextMenus`** backs the right-click clip / bookmark / pair entries. Both are verified token-/UI-only — no page content ever touches `chrome.storage`.

## Bundler choice

**esbuild**, not Vite. The extension needs one bundle step per entry point and no dev server / HMR — esbuild gives that with the smallest possible dependency tree, which is the right trade-off for a hostile-runtime codebase where every transitive dependency is attack surface (SYNC-5). Revisit only if a future sub-feature genuinely needs Vite's plugin pipeline.

## Pointers

- **Epic + design canon:** main repo `agent tooling/epics/browser-extension/` (the v1 design recap + the `sync-ledger.md` SYNC-* decisions).
- **PRDs / tasks:** main repo `agent tooling/features/ext-foundation-handoff/` (this foundation) and its sibling features (capture-extraction, desktop-ingest, clip-time-ux, url-bookmark).
- **Threat model:** main repo `docs/threat-model.md` — **TB10** (browser↔desktop clip channel) and **A14** (compromised/malicious extension build, 🔒 Mitigated) are the boundaries this repo implements *against* (already landed 2026-06-20; do not re-author them here).
- **Glossary:** main repo `docs/glossary.md` — `browser clipper`, `clip`, `native-messaging host`, `extension pairing token`, etc.
