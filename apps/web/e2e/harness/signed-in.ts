import { test as base, type Page } from "@playwright/test";
import { E2E_WORKSPACE_ID, mintAccessToken, type E2ERole } from "./environment.ts";

/**
 * A page that is already signed in, with a depot already chosen.
 *
 * The token is written into `sessionStorage` before the first navigation, exactly
 * where the app reads it. There is no sign-in screen yet — Supabase owns the
 * session and this app deliberately reimplements none of it — so this is the same
 * hand-off a Supabase callback would perform, with a token the real verifier
 * accepts.
 *
 * Choosing the workspace up front is the other half. Selection is explicit by
 * design (BR-CUSTOMER-002), and a spec that clicked through the picker on every
 * test would be re-asserting the picker rather than the workflow. One spec does
 * click through it, so the picker itself is still covered.
 */
export async function signIn(page: Page, role: E2ERole = "sales"): Promise<void> {
  const token = await mintAccessToken(role);
  await page.addInitScript(
    ([accessToken, workspaceId]) => {
      window.sessionStorage.setItem("vuarau.access_token", accessToken!);
      window.sessionStorage.setItem("vuarau.workspace_id", workspaceId!);
    },
    [token, E2E_WORKSPACE_ID],
  );
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
