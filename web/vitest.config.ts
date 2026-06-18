import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["{lib,app,components,test}/**/*.test.{ts,tsx}"],
    // Never discover the sibling git worktrees under .claude/worktrees (each carries a full copy of the
    // test tree) — they pollute the run and fail against this checkout's app/api + ROUTE_TO_TEST.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
    alias: {
      // "server-only" throws outside a React Server Components bundle; tests import server
      // modules directly, so alias it to an empty stub.
      "server-only": resolve(root, "test/stubs/server-only.ts"),
      "@": root,
    },
  },
});
