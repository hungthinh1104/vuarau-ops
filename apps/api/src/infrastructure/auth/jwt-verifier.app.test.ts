import { beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { ACTOR_ID, subjectFor } from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { bearerTokenFrom, createSupabaseJwtVerifier } from "./jwt-verifier.ts";
import { resolvePrincipal } from "./principal.ts";

/**
 * Real signing, real verification. These mint tokens with `jose` and hand them to
 * the same verifier the server uses — a stubbed verifier would test nothing,
 * since the whole point is that the cryptography and the claim checks happen.
 */
const ISSUER = "https://test-project.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const SECRET = new TextEncoder().encode("test-secret-at-least-32-bytes-long!!");

/** Fixed instants: a token that expires in 2099 keeps these deterministic. */
const IAT = Math.floor(Date.parse("2026-07-20T00:00:00Z") / 1000);
const FAR_FUTURE = Math.floor(Date.parse("2099-01-01T00:00:00Z") / 1000);
const PAST = Math.floor(Date.parse("2020-01-01T00:00:00Z") / 1000);

async function mintToken(
  overrides: {
    subject?: string;
    issuer?: string;
    audience?: string;
    expiresAt?: number;
    secret?: Uint8Array;
  } = {},
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(overrides.subject ?? subjectFor(ACTOR_ID))
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUDIENCE)
    .setIssuedAt(IAT)
    .setExpirationTime(overrides.expiresAt ?? FAR_FUTURE)
    .sign(overrides.secret ?? SECRET);
}

const verifier = createSupabaseJwtVerifier({
  issuer: ISSUER,
  audience: AUDIENCE,
  jwtSecret: "test-secret-at-least-32-bytes-long!!",
});

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

describe("BR-AUTH-001 / TC-AUTH-001", () => {
  it("accepts a correctly signed token and returns its subject", async () => {
    const result = await verifier.verify(await mintToken());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subject).toBe(subjectFor(ACTOR_ID));
  });

  it("refuses a token signed with the wrong key", async () => {
    const forged = await mintToken({
      secret: new TextEncoder().encode("a-different-secret-32-bytes-long!!!!"),
    });

    const result = await verifier.verify(forged);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHENTICATION_INVALID");
  });

  it("refuses an expired token", async () => {
    const result = await verifier.verify(await mintToken({ expiresAt: PAST }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHENTICATION_INVALID");
  });

  it("refuses a token from another issuer", async () => {
    const result = await verifier.verify(
      await mintToken({ issuer: "https://attacker.example/auth/v1" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHENTICATION_INVALID");
  });

  it("refuses a token minted for another audience", async () => {
    const result = await verifier.verify(await mintToken({ audience: "some-other-service" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHENTICATION_INVALID");
  });

  it("refuses an unsigned `alg: none` token", async () => {
    // The classic failure-open bug. Algorithms are pinned to what the configured
    // key can produce, so the header cannot talk the verifier out of checking.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: subjectFor(ACTOR_ID), iss: ISSUER, aud: AUDIENCE, exp: FAR_FUTURE }),
    ).toString("base64url");

    const result = await verifier.verify(`${header}.${payload}.`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHENTICATION_INVALID");
  });

  it("refuses garbage", async () => {
    const result = await verifier.verify("not-a-token");
    expect(result.ok).toBe(false);
  });

  it("does not tell the caller why verification failed", async () => {
    // The code is identical whichever way it failed; the reason goes to our logs.
    const expired = await verifier.verify(await mintToken({ expiresAt: PAST }));
    const forged = await verifier.verify(
      await mintToken({ secret: new TextEncoder().encode("a-different-secret-32-bytes-long!!!!") }),
    );

    expect(expired.ok || forged.ok).toBe(false);
    if (expired.ok || forged.ok) return;
    expect(expired.error.message).toBe(forged.error.message);
    expect(expired.error.code).toBe(forged.error.code);
  });
});

describe("BR-AUTH-005 / TC-AUTH-008", () => {
  it("resolves a verified subject to the local actor", async () => {
    const result = await resolvePrincipal(harness.deps.uow, verifier, await mintToken());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.actorId).toBe(ACTOR_ID);
    expect(result.value.subject).toBe(subjectFor(ACTOR_ID));
  });

  it("refuses a valid token for somebody this system has never heard of", async () => {
    // A real Supabase user with no actor row. Distinct from a bad token: the
    // remedy is to provision an actor, not to reissue a credential.
    const result = await resolvePrincipal(
      harness.deps.uow,
      verifier,
      await mintToken({ subject: "sub-unknown-user" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ACTOR_NOT_FOUND");
    expect(result.error.details).toMatchObject({ subject: "sub-unknown-user" });
  });

  it("refuses when no token was presented at all", async () => {
    const result = await resolvePrincipal(harness.deps.uow, verifier, null);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});

describe("TC-AUTH-010 — bearer header parsing", () => {
  it("extracts a token from a well-formed header", () => {
    expect(bearerTokenFrom("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerTokenFrom("bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("returns null when there is nothing to extract", () => {
    expect(bearerTokenFrom(undefined)).toBeNull();
    expect(bearerTokenFrom(null)).toBeNull();
    expect(bearerTokenFrom("")).toBeNull();
    expect(bearerTokenFrom("Basic abc")).toBeNull();
    // A bare token without the scheme is not a bearer credential.
    expect(bearerTokenFrom("abc.def.ghi")).toBeNull();
  });
});

describe("TC-AUTH-011 — verifier configuration", () => {
  it("refuses to start with neither a secret nor a JWKS url", () => {
    expect(() => createSupabaseJwtVerifier({ issuer: ISSUER, audience: AUDIENCE })).toThrow(
      /exactly one/i,
    );
  });

  it("refuses to start with both", () => {
    // Ambiguous key material is a configuration bug worth failing loudly at
    // boot rather than resolving silently in one direction.
    expect(() =>
      createSupabaseJwtVerifier({
        issuer: ISSUER,
        audience: AUDIENCE,
        jwtSecret: "secret",
        jwksUrl: "https://example.test/jwks.json",
      }),
    ).toThrow(/exactly one/i);
  });
});
