# AGENTS.md

Guidance for coding agents working in this repository. It is public: do not add
private hostnames, credentials, internal runbook names or links to repositories
that are not published.

## What this repository is

The Myne browser extension: a **keyless** web clipper for Chrome, Edge and
Firefox (Manifest V3, one codebase). It captures a page or selection and hands it
to the already-unlocked Myne desktop app over native messaging. The desktop is
the sole crypto site; the extension never receives `root_key`, an `item_key` or
any other key, and cannot decrypt, read, modify or delete vault content.

## Layout

- `src/background/` — clip handoff, pairing, status, bookmark, toolbar.
- `src/content/` — in-page DOM capture and the toast/prompt UI.
- `src/popup/` — pairing / locked / closed affordances.
- `src/lib/` — shared models, icon state, design tokens, copy.
- `src/icons/` — placeholder PNG marks and per-state SVGs.
- `src/manifest.json` — the single MV3 manifest; both background keys point at
  the same bundled IIFE.
- `tests/` — Vitest suites.
- `scripts/build.mjs` — esbuild; writes `dist/`.

## Dev

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Load `dist/` with **Load unpacked** in `chrome://extensions` / `edge://extensions`,
or **Load Temporary Add-on** from `about:debugging` in Firefox.

## Rules

- **Keyless invariant.** No vault key, no per-note key, no derived key, no
  plaintext queue in browser storage, no ability to decrypt.
- **No broad host access.** No `<all_urls>`, no auto-injected capture; capture
  is a user gesture through `activeTab`.
- **One MV3 codebase.** Keep the Chromium service worker and Firefox event page
  working from the same bundle.
- **No markdown/dialect/crypto library in the browser.** Capture is hand-rolled
  and zero-dependency.
- **Extension IDs and the dev key are load-bearing.** Changing either forces
  every installed clipper to re-pair; do not change them casually.
- **DCO.** Commits carry a `Signed-off-by:` trailer; the project does not use a
  CLA.
- Never commit credentials, tokens, private keys or internal hostnames.
- Security reports go through `SECURITY.md`; do not open a public issue.

## License

Code and documentation are AGPL-3.0-only. The banner and Myne Marks are not
licensed; see `LICENSING.md`, `LICENSE-ASSETS` and `TRADEMARK.md`.
