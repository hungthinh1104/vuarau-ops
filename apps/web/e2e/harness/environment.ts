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
export const E2E_SECOND_WORKSPACE_ID = "11111111-1111-4111-8111-111111111112";
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
  delivery: "22222222-2222-4222-8222-222222222205",
  /** A real, seeded account that belongs to no depot (`no_workspace_membership`). */
  unassigned: "22222222-2222-4222-8222-222222222206",
  /** Active accountant + sales membership in the primary depot. */
  multiRole: "22222222-2222-4222-8222-222222222207",
  /** Inactive membership; the actor row remains for audit/history. */
  revoked: "22222222-2222-4222-8222-222222222208",
  /** Owner of the second seeded depot, not a member of the primary depot. */
  foreignWorkspace: "22222222-2222-4222-8222-222222222209",
  /** Active warehouse in the primary depot and delivery in the second depot. */
  multiWorkspace: "22222222-2222-4222-8222-222222222210",
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
/** Long enough for the complete browser matrix; production tokens keep their provider lifetime. */
export const E2E_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;

/**
 * The root wrapper owns database creation and cleanup. Keeping this assertion
 * in the Playwright config prevents a direct package-level E2E invocation from
 * accidentally writing into `vuarau_test` or a development database.
 */
export function assertE2eDatabaseBoundary(owner: string | undefined, databaseUrl: string): void {
  if (owner !== "web-e2e-wrapper" && owner !== "pilot-dry-run") {
    throw new Error(
      "E2E_DATABASE_OWNER is missing or invalid. Run the root `pnpm web:e2e` wrapper.",
    );
  }

  let databaseName: string;
  let url: URL;
  try {
    url = new URL(databaseUrl);
    databaseName = url.pathname.replace(/^\//, "");
  } catch {
    throw new Error("E2E DATABASE_URL must identify a disposable local PostgreSQL database.");
  }

  if (
    !(url.protocol === "postgres:" || url.protocol === "postgresql:") ||
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    !/^vuarau_(e2e|pilot)_[a-z0-9]{12}_[a-z0-9]+_test$/.test(databaseName)
  ) {
    throw new Error("E2E DATABASE_URL must identify a disposable local PostgreSQL database.");
  }
}

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
    .setExpirationTime(`${E2E_TOKEN_LIFETIME_SECONDS}s`)
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

/**
 * Parse an optional isolated E2E port without allowing it to become a shell
 * fragment in the Playwright web-server command.
 */
export function parseE2EPort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(`E2E port must be an integer: received ${JSON.stringify(value)}`);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`E2E port must be between 1024 and 65535: received ${value}`);
  }
  return port;
}

/** Where the specs run. Both servers are started by `playwright.config.ts`. */
export const E2E_WEB_PORT = parseE2EPort(process.env["E2E_WEB_PORT"], 3101);
export const E2E_API_PORT = parseE2EPort(process.env["E2E_API_PORT"], 3102);

if (E2E_WEB_PORT === E2E_API_PORT) {
  throw new Error(`E2E web and API ports must differ: received ${E2E_WEB_PORT}`);
}

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
