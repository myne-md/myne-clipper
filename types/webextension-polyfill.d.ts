// Ambient types for the `webextension-polyfill` default import.
//
// webextension-polyfill@0.12.0 ships no bundled `.d.ts`. Rather than add a new
// dependency (`@types/webextension-polyfill`) — every dependency in this repo is
// attack surface and "adding a dependency is a security decision" (AGENTS.md) —
// we map the module's default export onto the WebExtensions `browser` global that
// `@types/firefox-webext-browser` (already pinned in task 1) types for us. The
// polyfill's runtime object IS that promise-based `browser` API, so this is an
// accurate, zero-new-dependency type binding.
declare module "webextension-polyfill" {
  const browser: typeof globalThis.browser;
  export default browser;
}
