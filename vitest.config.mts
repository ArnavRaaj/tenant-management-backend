import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 20000,
    pool: "forks",
    execArgv: ["--import", "tsx"],
  },
});
