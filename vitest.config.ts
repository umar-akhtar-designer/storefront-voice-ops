import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/e2e/**", "node_modules/**"],
    environment: "node",
    setupFiles: ["test/setup.ts"],
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
