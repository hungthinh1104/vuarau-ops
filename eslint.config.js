import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Lint rules that catch what the compiler cannot.
 *
 * Architectural import boundaries (§ ADR-0003) are NOT enforced here — they are
 * enforced by `scripts/boundary-check.ts`, which understands package ownership
 * and needs no plugin to do it.
 */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "packages/db/migrations/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Scripts and seeds are operator tools; printing to stdout is their job.
    files: ["scripts/**/*.ts", "packages/db/src/seeds/**/*.ts"],
    rules: { "no-console": "off" },
  },
);
