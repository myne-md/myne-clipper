// esbuild bundler for the Myne MV3 extension.
//
// One bundle step per entry, no dev server / HMR — esbuild gives that with the
// smallest possible dependency tree, the right trade-off for a hostile-runtime
// codebase where every transitive dependency is attack surface (SYNC-5; "adding
// a dependency is a security decision"). Revisit only if a sub-feature genuinely
// needs Vite's plugin pipeline.
//
// Cross-browser strategy: a SINGLE `manifest.json` carries BOTH background keys
// — `background.service_worker` (Chromium MV3 reads it, Firefox ignores it) and
// `background.scripts` (Firefox MV3 event page reads it, Chromium ignores it),
// both pointing at the same bundled `background.js`. No per-target manifest emit
// is needed. The background bundle is emitted as a classic IIFE script (no ESM)
// so it loads identically as a Chromium service worker and a Firefox event-page
// script. `webextension-polyfill` reconciles `chrome.*` vs `browser.*` at the API
// level so one source compiles for all three targets (SYNC-4).
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

// Background: classic IIFE — works as both a Chromium SW and a Firefox event page.
await build({
  entryPoints: { background: "src/background/index.ts" },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "es2022",
  platform: "browser",
  logLevel: "info",
});

// Content script + popup script: also classic IIFE (content scripts and popup
// <script> tags are not ES modules across all three engines without extra opt-in,
// so IIFE is the portable choice).
await build({
  entryPoints: {
    content: "src/content/index.ts",
    popup: "src/popup/index.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "es2022",
  platform: "browser",
  // The content overlay (clip-time-ux toast/prompt) inlines its styles into a
  // Shadow DOM root — `.css` imports resolve to the file's string contents, so
  // the surfaces ship their CSS in-bundle (no `web_accessible_resources`, no
  // runtime fetch in the hostile page runtime).
  loader: { ".css": "text" },
  logLevel: "info",
});

// Static assets: the MV3 manifest (single file, both background keys), the popup
// HTML + CSS, and the placeholder icons.
cpSync("src/manifest.json", "dist/manifest.json");
cpSync("src/popup/index.html", "dist/popup.html");
cpSync("src/popup/popup.css", "dist/popup.css");
cpSync("src/icons", "dist/icons", { recursive: true });

// The injected-overlay design-token contract (clip-time-ux). It is host-page
// scoped to `.myne-overlay` (no `:root` leak; `all: initial` reset against the
// host cascade), and the toast/prompt surfaces (clip-time-ux task 6/7) load it
// into their shadow root. Shipped as a static asset so those surfaces can adopt
// it without re-declaring the token values.
cpSync("src/lib/tokens.css", "dist/tokens.css");

// Third-party notices. Two files, and the split is the point: `NOTICE` is the
// index a human reads, and the upstream licence text is COPIED from the
// installed package rather than transcribed into the index, so what ships is
// the licence of the version actually inlined by the bundle above. A
// hand-copied licence is the copy that goes stale on a dependency bump, and
// nothing here would notice.
cpSync("NOTICE", "dist/NOTICE");
cpSync("node_modules/webextension-polyfill/LICENSE", "dist/LICENSE.webextension-polyfill.txt");

console.log("build: dist/ ready (manifest + background + content + popup + icons + notices)");
