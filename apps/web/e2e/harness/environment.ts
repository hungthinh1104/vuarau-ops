import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";

/**
 * The one place the end-to-end environment is described, so a spec never has to
 * know how the token was minted or which workspace it is writing into.
 *
 * These tests run against a **real API process and a real PostgreSQL database**.
 * That is the point: the questions M5A exists to answer — does a duplicate tap
 * produce one entry, does a resend after a timeout produce one entry — are
 * questions about the server's idempotency table, and a mocked API cannot answer
 * them. A green suite over a mock would prove the mock matches the component,
 * which nobody doubted.
 */
export const E2E_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
/**
 * What the seeded depot calls itself. The picker shows this, and it comes from
 * `session.workspaces` — not from anything configured in the browser
 * (BR-AUTH-008), which is why a spec can assert on it at all.
 */
export const E2E_WORKSPACE_NAME = "Vựa rau Bình Điền";
export const E2E_QUALITY_GRADE_ID = "55555555-5555-4555-8555-555555555501";

/** From the development seed: one actor per role, fixed uuids. */
export const E2E_ACTORS = {
  owner: "22222222-2222-4222-8222-222222222201",
  accountant: "22222222-2222-4222-8222-222222222202",
  sales: "22222222-2222-4222-8222-222222222203",
  warehouse: "22222222-2222-4222-8222-222222222204",
  /** A real, seeded account that belongs to no depot (`no_workspace_membership`). */
  unassigned: "22222222-2222-4222-8222-222222222206",
} as const;

export type E2ERole = keyof typeof E2E_ACTORS;

/**
 * Signing material and issuer, matched to what the API process is started with.
 *
 * HS256 rather than JWKS because the pilot and CI have no Supabase project to
 * fetch keys from. The token still goes through the **real** verifier — real
 * signature, real issuer and audience checks, real expiry — and `sub` still has
 * to resolve to a seeded actor. What is simulated is the identity provider, not
 * the verification.
 */
export const E2E_JWT_SECRET = "e2e-only-secret-not-a-credential-0123456789";
export const E2E_JWT_ISSUER = "https://e2e.local/auth/v1";
export const E2E_JWT_AUDIENCE = "authenticated";

export async function mintAccessToken(role: E2ERole): Promise<string> {
  return mintAccessTokenForActor(E2E_ACTORS[role]);
}

export async function mintAccessTokenForActor(actorId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(actorId)
    .setIssuer(E2E_JWT_ISSUER)
    .setAudience(E2E_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(E2E_JWT_SECRET));
}

/**
 * Whether the end-to-end suite may skip, and the place it refuses to.
 *
 * On a laptop without Postgres, skipping is a convenience: `pnpm verify` stays
 * green and the skip is reported as a skip. In CI it is a **lie** — the suite goes
 * green having exercised no browser, no API process and no database, and the way
 * that is discovered is a production incident whose test "passed" every day.
 *
 * `DATABASE_URL` is one renamed workflow line away from vanishing, and nothing
 * else would notice. So under CI this throws while Playwright is loading its
 * config, before a single spec is collected.
 */
const inCi = (process.env["CI"] ?? "").length > 0 && process.env["CI"] !== "false";

export function endToEndDisabled(): boolean {
  if ((process.env["DATABASE_URL"] ?? "").length > 0) return false;
  if (inCi) {
    throw new Error(
      "DATABASE_URL is not set, and CI is. The end-to-end suite must run here, " +
        "not skip: it is the only thing in this repository that exercises a real " +
        "browser against a real API and a real database.",
    );
  }
  return true;
}

/** Where the specs run. Both servers are started by `playwright.config.ts`. */
export const E2E_WEB_PORT = 3101;
export const E2E_API_PORT = 3102;

/**
 * A fresh customer per spec, created through the API rather than inserted.
 *
 * Specs must not share a customer: they run in parallel across two viewport
 * projects, and a balance asserted by one would be moved by another. Creating
 * through `customer.create` rather than SQL also means the seed data path and the
 * command path stay the same one.
 */
export function uniqueCustomerName(label: string): string {
  return `E2E ${label} ${randomUUID().slice(0, 8)}`;
}
