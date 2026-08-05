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
  // The acceptance suite deliberately serializes 100 browser journeys through
  // one local client identity. Keep production's 600-request window unchanged,
  // but prevent catalog keystrokes and cache probes from turning a valid later
  // journey into a transport-level 429.
  RATE_LIMIT_AUTHENTICATED: "10000",
  // Keep E2E on the real actor lookup path. Local development may use its
  // convenience principal fallback, but acceptance must prove workspace and
  // membership isolation through PostgreSQL.
  APP_ENV: "development",
  E2E_REAL_ACTOR_LOOKUP: "1",
  PORT: String(E2E_API_PORT),
  SUPABASE_JWT_ISSUER: E2E_JWT_ISSUER,
  SUPABASE_JWT_AUDIENCE: E2E_JWT_AUDIENCE,
  SUPABASE_JWT_SECRET: E2E_JWT_SECRET,
  // A developer's `.env` may use production-style JWKS verification. The E2E
  // harness deliberately mints HS256 tokens, so it must clear that inherited
  // setting rather than leave two mutually-exclusive verifier modes configured.
  SUPABASE_JWKS_URL: "",
};

const webEnvironment = {
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_API_ORIGIN: `http://127.0.0.1:${E2E_API_PORT}`,
  // E2E authenticates through the token bridge, never against a developer's
  // Supabase project. Clear inherited public keys so the unauthenticated-route
  // assertion is deterministic when `pnpm verify` is run from a populated .env.
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  /*
   * The one build that opens the token bridge.
   *
   * There is no Supabase project here — CI has none, and standing one up would
   * make questions about Postgres rows depend on a third party. So the harness
   * mints a token against the API's configured secret and injects it, and this
   * flag is what lets the app read it (TC-WEB-024). The ordinary production
   * build does not set this flag; only the explicitly separate E2E artifact does.
   *
   * The depot list is **not** configured here any more. It comes from
   * `session.workspaces`, against the seeded workspace, which means the picker
   * these specs click through is the real one (BR-AUTH-008).
   */
  NEXT_PUBLIC_E2E_AUTH_BRIDGE: "1",
};

export default defineConfig({
  testDir: "./e2e",
  /*
   * The browser projects share one API process and one PostgreSQL database.
   * Financial workflows are data-isolated, but high parallelism can exhaust the
   * real-stack request path while long backup and offline scenarios are running,
   * leaving otherwise-valid reads pending until their test timeout. Serialize
   * the acceptance gate: command concurrency is tested explicitly at the
   * application/outbox layers, while this suite proves complete user journeys.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] === undefined ? 0 : 1,
  reporter: "list",
  // Real HTTP and database writes against the same production artefact CI builds.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  ...(hasDatabase ? { globalSetup: "./e2e/harness/global-setup.ts" } : {}),

  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    trace:
      process.env["CI"] === "1" || process.env["CI"] === "true"
        ? "on-first-retry"
        : "retain-on-failure",
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
          command: "pnpm exec tsx ../api/src/server.ts",
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
          command: `next start --port ${E2E_WEB_PORT}`,
          url: `http://127.0.0.1:${E2E_WEB_PORT}`,
          env: webEnvironment,
          // A previously interrupted offline run can leave a dev server process
          // alive but unable to serve navigations. The acceptance gate must own
          // both processes so readiness reflects this exact run.
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : [],
});
