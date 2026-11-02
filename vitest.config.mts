import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 120000,
    pool: "forks",
    execArgv: ["--import", "tsx"],
    // Starts a single in-memory MongoDB replica set shared by all test files
    globalSetup: ["./tests/helpers/globalSetup.ts"],
    setupFiles: ["./tests/helpers/setupEnv.ts", "./tests/helpers/setupHooks.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/scripts/**", "src/types/**", "src/server.ts"],
      reporter: ["text-summary", "html"],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 55,
      },
    },
  },
});
