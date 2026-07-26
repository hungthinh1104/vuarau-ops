import { defineConfig, devices } from "@playwright/test";

/**
 * A skeleton, not a suite.
 *
 * There is no production workflow to walk through yet — no customer search, no
 * sale entry, no payment capture — so an end-to-end suite would be testing the
 * demonstration route, which exists to prove composition rather than behaviour.
 * What this milestone owes is the **configuration**: a next milestone that ships
 * a workflow should write a spec, not a harness.
 *
 * `pnpm --filter @vuarau/web e2e:check` lists the specs without running a browser,
 * so `pnpm verify` proves the config parses and the specs are discovered on a
 * machine that has never downloaded Chromium.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] === undefined ? 0 : 1,
  reporter: "list",

  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:3001",
    trace: "on-first-retry",
  },

  /*
   * Mobile first, and it is the same order the product is used in: a phone at a
   * loading bay, then a desk. A suite that only runs desktop Chromium would pass
   * while the 48px targets and the single-column reflow went unchecked.
   */
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "pnpm --filter @vuarau/web dev --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 120_000,
  },
});
