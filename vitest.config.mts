import { defineConfig } from "vitest/config";

// Pure-function tests only: no components, no routes, no DOM.
// The include is anchored at the repo root so copies of this repo under
// .claude/worktrees/ are never picked up when running from the main checkout.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts"],
  },
});
