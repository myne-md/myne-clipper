// The third-party notice covers what the extension bundle redistributes.
//
// `scripts/build.mjs` runs esbuild with `bundle: true`, so a runtime dependency
// is INLINED into `dist/*.js`: adding one to `package.json` puts third-party
// code in a file the browser loads, and nothing about that fails a build, a
// typecheck or a test. The dependency set and the notice are two lists that
// have to move together, and this is the only place that says so.
//
// Same shape as the guard class the main repo records: a claim that lives in
// prose and is checked nowhere is a claim that is already drifting.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NOTICE = readFileSync("NOTICE", "utf8");
const MANIFEST = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const BUILD = readFileSync("scripts/build.mjs", "utf8");

describe("the shipped third-party notice", () => {
  it("names every runtime dependency, and there is at least one to name", () => {
    // The floor matters as much as the loop: a notice that names nothing passes
    // a loop over an empty set, and `bundle: true` means the set is never empty
    // while the extension has a runtime dependency at all.
    const deps = Object.keys(MANIFEST.dependencies ?? {});
    expect(deps.length).toBeGreaterThan(0);
    for (const dep of deps) expect(NOTICE).toContain(dep);
  });

  it("copies each runtime dependency's own licence into dist/", () => {
    // Copied, not transcribed. A transcription of a licence is a second copy
    // that nobody reads and that goes stale on a bump; a `cpSync` from the
    // installed package cannot disagree with the version that was bundled.
    for (const dep of Object.keys(MANIFEST.dependencies ?? {})) {
      expect(BUILD).toContain(`node_modules/${dep}/LICENSE`);
    }
    expect(BUILD).toContain('cpSync("NOTICE", "dist/NOTICE")');
  });

  it("places every development tool under the not-redistributed heading", () => {
    // Mentioning `esbuild` is fine and necessary; presenting it as bundled is
    // not. The split is positional on purpose: the notice has one heading that
    // claims redistribution and one that disclaims it, so a dev tool that drifts
    // into the first section fails here rather than being argued about.
    const bundled = NOTICE.slice(0, NOTICE.indexOf("Build-time only"));
    const buildTime = NOTICE.slice(NOTICE.indexOf("Build-time only"));
    expect(bundled.length).toBeGreaterThan(0);
    expect(buildTime.length).toBeGreaterThan(0);
    for (const dev of Object.keys(MANIFEST.devDependencies ?? {})) {
      expect(buildTime).toContain(dev);
      expect(bundled).not.toContain(dev);
    }
  });
});
