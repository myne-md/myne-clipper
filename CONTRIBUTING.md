# Contributing

Thanks for improving the Myne Clipper. This is a keyless browser extension: the
desktop app holds the keys, and the extension's job is to hand it a capture over
native messaging without ever holding or deriving one.

## Before you start

- For a bug, open an issue with the browser and version, the page shape if it is
  shareable, and what you expected to happen.
- For a security issue, do **not** open a public issue; follow `SECURITY.md`.
- For a behavioural change, open a short proposal first. The clipper deliberately
  has a small surface: capture, bookmark, pairing and status.

## Dev setup

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Load `dist/` unpacked in Chrome/Edge (`chrome://extensions` → Developer mode →
Load unpacked) or Firefox (`about:debugging` → Load Temporary Add-on). There is
no store listing and no published binary; build from source.

## What a change must preserve

- **Keyless.** No `root_key`, `item_key`, derived key, or decrypt path. The
  extension cannot read, modify or delete notes.
- **No plaintext queue.** Nothing captured is stored for later; a locked or
  closed desktop means no capture.
- **No `<all_urls>` or auto-injected content scripts.** Capture is a user
  gesture through `activeTab`; permissions stay minimal.
- **One MV3 codebase** for Chromium and Firefox; both background keys and the
  IIFE bundle stay intact.
- **No markdown/dialect/crypto libraries** shipped to the browser.
- **Extension IDs and dev key unchanged** unless the change is explicitly a
  re-pairing event.

## Tests and PRs

- Add or update a Vitest suite for behaviour changes; `pnpm test` must pass.
- `pnpm typecheck` and `pnpm build` must pass.
- List the browsers you tested in the PR.
- One coherent change per PR; conventional-commit subject.
- Every commit carries a `Signed-off-by:` trailer (DCO 1.1):

```bash
git commit -s
```

There is no CLA. The code and documentation are AGPL-3.0-only; the banner and
Myne Marks are not licensed (see `LICENSING.md`).
