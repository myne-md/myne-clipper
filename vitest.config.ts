// Minimal Vitest config for the extension's pure-logic unit tests.
//
// Vitest is the project's canonical TypeScript test runner (the main `myne` repo
// pins the same 4.x line). It is a DEV-ONLY dependency: it never enters the
// shipped extension bundle — `pnpm build` is still pure esbuild, and the dist/
// output is unchanged by adding a test runner. We add it because task 8's honest
// outcome -> state/view mapping is a pure function whose honesty is exactly the
// kind of load-bearing logic that wants a real, runnable assertion (TDD), and
// the task-10 E2E + sub-feature 4 will lean on these same exported literals.
//
// Scope is deliberately tiny: node environment (the functions under test touch
// no DOM and no `browser` global — they are pure), tests under `tests/` only.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
