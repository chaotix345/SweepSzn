import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["{lib,app,components,test}/**/*.test.{ts,tsx}"],
    alias: {
      // "server-only" throws outside a React Server Components bundle; tests import server
      // modules directly, so alias it to an empty stub.
      "server-only": resolve(root, "test/stubs/server-only.ts"),
      "@": root,
    },
  },
});
