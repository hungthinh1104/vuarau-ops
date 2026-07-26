import { createRemoteJWKSet, jwtVerify } from "jose";
import type { DomainError } from "@vuanha/domain-contracts";
import type { DomainResult } from "@vuanha/domain-kernel";
import { err, ok } from "@vuanha/domain-kernel";

/**
 * Verifies a Supabase access token and returns nothing but its subject.
 *
 * Deliberately narrow: the token's role claims, email, and app metadata are
 * ignored. Authorization comes from `workspace_memberships`, which the depot
 * controls — not from claims an identity provider happens to mint (ADR-0011).
 *
 * `jose` does the cryptography. Hand-rolling this is the classic way to fail
 * **open**: `alg: none`, algorithm confusion between HMAC and RSA, an unchecked
 * `exp`, a missing issuer check. See ADR-0010 for why this is the one place a
 * dependency is clearly worth it.
 */
export type VerifiedToken = {
  /** The `sub` claim — Supabase's `auth.users.id`. */
  readonly subject: string;
};

export type JwtVerifier = {
  verify(token: string): Promise<DomainResult<VerifiedToken>>;
};

export type SupabaseJwtConfig = {
  /** Expected `iss`, e.g. `https://<project>.supabase.co/auth/v1`. */
  readonly issuer: string;
  /** Expected `aud`. Supabase issues `authenticated` for signed-in users. */
  readonly audience: string;
  /**
   * Legacy shared secret (HS256). Mutually exclusive with `jwksUrl`; asymmetric
   * keys are preferred because the API then never holds signing material.
   */
  readonly jwtSecret?: string;
  /** JWKS endpoint for asymmetric keys, e.g. `<issuer>/.well-known/jwks.json`. */
  readonly jwksUrl?: string;
  /** Tolerance for clock skew between Supabase and this server. */
  readonly clockToleranceSeconds?: number;
};

const INVALID = (detail: string) =>
  err<VerifiedToken>(
    "AUTHENTICATION_INVALID",
    "The access token is not valid.",
    // The reason is for our logs, not the caller: telling a client *why* a token
    // failed is an oracle. The code is the same whichever way it failed.
    { reason: detail },
  );

export function createSupabaseJwtVerifier(config: SupabaseJwtConfig): JwtVerifier {
  const hasSecret = config.jwtSecret !== undefined && config.jwtSecret.length > 0;
  const hasJwks = config.jwksUrl !== undefined && config.jwksUrl.length > 0;

  if (hasSecret === hasJwks) {
    throw new Error(
      "Supabase JWT verification needs exactly one of `jwtSecret` (HS256) or `jwksUrl` (asymmetric).",
    );
  }

  // Algorithms are pinned to what the configured key material can possibly
  // produce. Trusting the token's own `alg` header is how algorithm-confusion
  // attacks get in.
  const algorithms = hasSecret ? ["HS256"] : ["RS256", "ES256"];

  const keyMaterial = hasSecret
    ? new TextEncoder().encode(config.jwtSecret)
    : createRemoteJWKSet(new URL(config.jwksUrl!));

  return {
    async verify(token: string): Promise<DomainResult<VerifiedToken>> {
      if (token.length === 0) {
        return err("AUTHENTICATION_REQUIRED", "No access token was presented.");
      }

      try {
        const { payload } = await jwtVerify(token, keyMaterial as never, {
          issuer: config.issuer,
          audience: config.audience,
          algorithms,
          clockTolerance: config.clockToleranceSeconds ?? 5,
        });

        const subject = payload.sub;
        if (typeof subject !== "string" || subject.length === 0) {
          return INVALID("token has no subject");
        }
        return ok({ subject });
      } catch (error) {
        return INVALID(error instanceof Error ? error.name : "verification failed");
      }
    },
  };
}

/** Extracts the bearer token from an `Authorization` header, if there is one. */
export function bearerTokenFrom(header: string | undefined | null): string | null {
  if (header === undefined || header === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

export type { DomainError };
