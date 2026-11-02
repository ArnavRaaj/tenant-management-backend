import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "scripts/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-undef": "off", // Handled by TypeScript
      "no-console": "error", // Use the pino logger (src/core/logger.ts)
      // All environment variables are read and validated in src/config/env.ts.
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Import `config` from src/config/env.ts instead of reading process.env directly.",
        },
      ],
    },
  },
  {
    // The config module itself, and test bootstrapping that must prepare the
    // environment BEFORE the config module loads.
    files: ["src/config/env.ts", "tests/helpers/**/*.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    // Tests may use loose typing for fixtures and mocks.
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
);
