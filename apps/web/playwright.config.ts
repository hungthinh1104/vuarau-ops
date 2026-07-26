import { defineConfig, devices } from "@playwright/test";
import {
  E2E_API_PORT,
  E2E_JWT_AUDIENCE,
  E2E_JWT_ISSUER,
  E2E_JWT_SECRET,
  E2E_WEB_PORT,
  E2E_WORKSPACE_ID,
} from "./e2e/harness/environment.ts";

/**
 * End-to-end against the **real** stack: a real API process, a real PostgreSQL
 * database, a real bearer token through the real verifier.
 *
 * That is not thoroughness for its own sake. The questions this milestone exists
 * to answer — does a duplicate tap create one receivable, does a resend after a
 * timeout create one — are questions about Postgres rows and the idempotency
 * table. A mocked API would answer them by construction and prove nothing.
 *
 * Both servers are started here rather than assumed, so `pnpm verify` on a clean
 * checkout either runs the whole thing or skips it loudly.
 */
const databaseUrl = process.env["DATABASE_URL"] ?? "";
const hasDatabase = databaseUrl.length > 0;

const apiEnvironment = {
  DATABASE_URL: databaseUrl,
  PORT: String(E2E_API_PORT),
  SUPABASE_JWT_ISSUER: E2E_JWT_ISSUER,
  SUPABASE_JWT_AUDIENCE: E2E_JWT_AUDIENCE,
  SUPABASE_JWT_SECRET: E2E_JWT_SECRET,
};

const webEnvironment = {
  NEXT_PUBLIC_API_ORIGIN: `http://127.0.0.1:${E2E_API_PORT}`,
  NEXT_PUBLIC_WORKSPACES: `${E2E_WORKSPACE_ID}:Vựa kiểm thử`,
};

export default defineConfig({
  testDir: "./e2e",
  // Specs share one seeded workspace and create their own customers, so they are
  // independent. Parallel across files; serial within one, because a workflow is
  // a sequence.
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] === undefined ? 0 : 1,
  reporter: "list",
  // Real HTTP, a real database write and a Next dev compile on first hit.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  ...(hasDatabase ? { globalSetup: "./e2e/harness/global-setup.ts" } : {}),

  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    trace: "on-first-retry",
  },

  /*
   * Mobile first, and that is the order the product is used in: a phone at a
   * loading bay, then a desk. A desktop-only suite would pass while the 48px
   * targets and the single-column reflow went unchecked.
   */
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: hasDatabase
    ? [
        {
          command: "node ../api/src/server.ts",
          /*
           * A real procedure, not `/`. The router answers 404 at the root, which
           * Playwright does not accept as "ready", and probing a procedure proves
           * more anyway: the server is up *and* the router is mounted. Without a
           * token it answers 401, which is both an accepted status and the
           * correct answer (BR-AUTH-001).
           */
          url: `http://127.0.0.1:${E2E_API_PORT}/session.me?input=%7B%7D`,
          env: apiEnvironment,
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          command: `next dev --port ${E2E_WEB_PORT}`,
          url: `http://127.0.0.1:${E2E_WEB_PORT}`,
          env: webEnvironment,
          reuseExistingServer: !process.env["CI"],
          timeout: 120_000,
        },
      ]
    : [],
});
