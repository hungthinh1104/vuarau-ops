import type { ViteUserConfig } from "vitest/config";

/**
 * Settings shared by every Vitest project in the workspace.
 *
 * Determinism is the point: no watch mode in CI, no random test order, and a
 * timeout short enough that a hung database connection fails loudly instead of
 * stalling the pipeline.
 */
export const sharedTestConfig = {
  globals: false,
  environment: "node",
  restoreMocks: true,
  sequence: { shuffle: false },
  testTimeout: 10_000,
  hookTimeout: 20_000,
} satisfies NonNullable<ViteUserConfig["test"]>;
