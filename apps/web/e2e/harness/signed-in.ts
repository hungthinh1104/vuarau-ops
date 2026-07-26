import { test as base, type Page } from "@playwright/test";
import { E2E_WORKSPACE_ID, mintAccessToken, type E2ERole } from "./environment.ts";

/**
 * A page that is already signed in, with a depot already chosen.
 *
 * The token is written into `sessionStorage`, which the app reads **only** when
 * the build set `NEXT_PUBLIC_E2E_AUTH_BRIDGE=1` — the Playwright web server, and
 * nothing else (TC-WEB-024). There is no Supabase project here: CI has none, and
 * standing one up would make questions about Postgres rows depend on a third
 * party. What is simulated is the identity provider; the token still goes through
 * the real verifier, and `sub` still has to resolve to a seeded actor.
 *
 * Choosing the workspace up front is the other half. Selection is explicit by
 * design (BR-CUSTOMER-002), and a spec that clicked through the picker on every
 * test would be re-asserting the picker rather than the workflow. `sign-in.spec.ts`
 * does click through it, against the real `session.workspaces`, so the picker
 * itself is still covered.
 */
export async function signIn(page: Page, role: E2ERole = "sales"): Promise<void> {
  await injectToken(page, role);
  await page.addInitScript((workspaceId) => {
    window.sessionStorage.setItem("vuarau.workspace_id", workspaceId);
  }, E2E_WORKSPACE_ID);
}

/**
 * A signed-in page with **no depot chosen**, for the specs that are about the
 * picker itself.
 */
export async function injectToken(page: Page, role: E2ERole = "sales"): Promise<void> {
  const token = await mintAccessToken(role);
  await page.addInitScript((accessToken) => {
    window.sessionStorage.setItem("vuarau.access_token", accessToken);
  }, token);
}

/**
 * Skips the whole file when there is no database, rather than failing.
 *
 * The same rule the `db` Vitest project follows: a laptop without Postgres still
 * gets a green `pnpm verify`, and the skip is reported as a skip.
 */
export const test = base.extend({});

test.beforeEach(() => {
  test.skip(
    (process.env["DATABASE_URL"] ?? "").length === 0,
    "DATABASE_URL is not set — the end-to-end suite runs against a real database.",
  );
});

export { expect } from "@playwright/test";
