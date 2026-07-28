import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests that hit real providers are opt-in via RUN_INTEGRATION=1
    // so the default suite runs fully offline with no API keys.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/**/index.ts"],
    },
  },
});
