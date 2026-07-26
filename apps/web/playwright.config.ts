import { defineConfig, devices } from "@playwright/test";
import {
  E2E_API_PORT,
  E2E_JWT_AUDIENCE,
  E2E_JWT_ISSUER,
  E2E_JWT_SECRET,
  E2E_WEB_PORT,
  endToEndDisabled,
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
/*
 * Throws rather than returning `true` when CI is set and the database is not.
 * A skipped end-to-end suite in CI is a green build that exercised no browser,
 * no API process and no database — see `endToEndDisabled`.
 */
const hasDatabase = !endToEndDisabled();

const apiEnvironment = {
  DATABASE_URL: databaseUrl,
  PORT: String(E2E_API_PORT),
  SUPABASE_JWT_ISSUER: E2E_JWT_ISSUER,
  SUPABASE_JWT_AUDIENCE: E2E_JWT_AUDIENCE,
  SUPABASE_JWT_SECRET: E2E_JWT_SECRET,
};

const webEnvironment = {
  NEXT_PUBLIC_API_ORIGIN: `http://127.0.0.1:${E2E_API_PORT}`,
  /*
   * The one build that opens the token bridge.
   *
   * There is no Supabase project here — CI has none, and standing one up would
   * make questions about Postgres rows depend on a third party. So the harness
   * mints a token against the API's configured secret and injects it, and this
   * flag is what lets the app read it (TC-WEB-024). A production build cannot
   * open the same door: the bridge is also guarded on `NODE_ENV`, which Next
   * resolves at build time and removes the branch behind.
   *
   * The depot list is **not** configured here any more. It comes from
   * `session.workspaces`, against the seeded workspace, which means the picker
   * these specs click through is the real one (BR-AUTH-008).
   */
  NEXT_PUBLIC_E2E_AUTH_BRIDGE: "1",
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
           * The readiness probe, which is exactly the question Playwright is
           * asking: configuration accepted **and** the database answering. It
           * used to probe `session.me` and accept its 401 — true but indirect,
           * and it went green against a server whose database was unreachable,
           * so the first spec discovered that instead.
           */
          url: `http://127.0.0.1:${E2E_API_PORT}/health/ready`,
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
