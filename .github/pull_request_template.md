<!--
PR title = conventional-commit subject carrying the Plane ID, e.g.
  fix(capture): preserve fenced-code language on clip (MYND-###)
Do NOT mention AI/assistant tooling anywhere — the commit-msg hook rejects attribution trailers.
-->

## Summary

<!-- What does this change, and why? -->

## Linked work

- Plane task: MYND-
- Closes #

## Type of change

- [ ] Bug fix
- [ ] Feature / enhancement
- [ ] Documentation
- [ ] Refactor / chore

## Browsers tested

- [ ] Chrome
- [ ] Edge
- [ ] Firefox

## How was this tested?

## Keyless-invariant checklist

- [ ] Conventional-commit subject carrying the Plane ID.
- [ ] The extension remains **keyless**: no vault key, no per-note key, no ability to decrypt.
- [ ] No plaintext queue in browser storage, no `<all_urls>` host permission, no auto-injected capture.
- [ ] Single MV3 codebase still builds for both Chromium (service worker) and Firefox (event page).
- [ ] No crypto/dialect/markdown library shipped to the browser.
- [ ] `pnpm test` (Vitest) passes.

## Developer Certificate of Origin

- [ ] I certify the [DCO](https://developercertificate.org/): this contribution is mine to give under the repository's license (AGPL-3.0).
