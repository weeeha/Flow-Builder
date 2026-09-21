import { defineConfig } from "vitest/config";

// The existing lib tests are pure-function tests with no DOM dependency, so
// they run unaffected under jsdom. jsdom is required for the component tests
// copied alongside the Flow Kit (components/**/*.test.tsx), which render with
// Testing Library.
// The include is anchored at the repo root so copies of this repo under
// .claude/worktrees/ are never picked up when running from the main checkout.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["lib/__tests__/**/*.test.ts", "components/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
});
