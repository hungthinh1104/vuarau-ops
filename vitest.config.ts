import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { sharedTestConfig } from "./packages/config/vitest.shared.ts";

/**
 * Five test projects, matching the five layers that can fail independently.
 * See docs/08-qa/test-strategy.md for what belongs in each.
 *
 *   domain      — pure decision functions, no I/O           (packages/domain-*)
 *   application — command handlers over in-memory ports     (apps/api, *.app.test.ts)
 *   contract    — tRPC caller round-trips, DTO shape        (apps/api, *.contract.test.ts)
 *   db          — real Postgres; skipped without DATABASE_URL (packages/db)
 *   web         — components over fixed DTOs, in jsdom      (apps/web)
 *
 * `web` is the only project with a browser environment and the only one that
 * needs a plugin. It runs against fixtures, never a server: a component test that
 * needed the API running would be a slow integration test wearing a component
 * test's name.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...sharedTestConfig,
          name: "domain",
          include: [
            "packages/domain-kernel/src/**/*.test.ts",
            "packages/domain-contracts/src/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          ...sharedTestConfig,
          name: "application",
          include: ["apps/api/src/**/*.app.test.ts"],
          setupFiles: ["./apps/api/src/testing/setup.ts"],
        },
      },
      {
        test: {
          ...sharedTestConfig,
          name: "contract",
          include: ["apps/api/src/**/*.contract.test.ts"],
          setupFiles: ["./apps/api/src/testing/setup.ts"],
        },
      },
      {
        test: {
          ...sharedTestConfig,
          name: "db",
          include: ["packages/db/src/**/*.db.test.ts", "apps/api/src/**/*.db.test.ts"],
          setupFiles: ["./apps/api/src/testing/setup.ts"],
          // Every test still gets its own workspace, so its business rows do not
          // collide. Migration bootstrap, however, writes PostgreSQL's global
          // schema catalogue before that isolation exists; concurrent first runs
          // can race while creating enum types. Keep this project sequential on
          // the one shared PostgreSQL database used by local verification and CI.
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
          },
        },
        test: {
          ...sharedTestConfig,
          name: "web",
          environment: "jsdom",
          include: ["apps/web/src/**/*.test.ts", "apps/web/src/**/*.test.tsx"],
          setupFiles: ["./apps/web/src/testing/setup.ts"],
        },
      },
    ],
  },
});
