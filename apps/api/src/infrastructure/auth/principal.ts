import type { ActorId } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import type { UnitOfWork } from "../persistence/ports.ts";
import type { JwtVerifier } from "./jwt-verifier.ts";

/**
 * Who the server has decided is calling. Established once per request from a
 * verified token; never taken from the request body.
 *
 * This is the value that makes `command.actorId` checkable rather than
 * authoritative (BR-AUTH-002).
 */
export type AuthenticatedPrincipal = {
  /** The local actor. Everything downstream — memberships, audit — uses this. */
  readonly actorId: ActorId;
  /** The verified JWT subject it was resolved from, kept for diagnostics. */
  readonly subject: string;
};

export function developmentPrincipalFallbackEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    env["APP_ENV"] === "development" &&
    env["DEV_PRINCIPAL_FALLBACK"] === "1" &&
    env["E2E_REAL_ACTOR_LOOKUP"] !== "1"
  );
}

/**
 * Token → subject → local actor.
 *
 * The two failure modes are kept distinct on purpose: a token that will not
 * verify is `AUTHENTICATION_INVALID`, while a perfectly good token for somebody
 * this system has never heard of is `ACTOR_NOT_FOUND`. An operator's remedy
 * differs — reissue a token versus provision an actor — and collapsing them
 * would hide the second case entirely.
 */
export async function resolvePrincipal(
  uow: UnitOfWork,
  verifier: JwtVerifier,
  token: string | null,
): Promise<DomainResult<AuthenticatedPrincipal>> {
  if (token === null) {
    return err("AUTHENTICATION_REQUIRED", "This operation requires an access token.");
  }

  const verified = await verifier.verify(token);
  if (!verified.ok) {
    return verified;
  }

  // Bypass DB lookup in local development so the user can test UI without needing to sync their real Supabase ID.
  // The real-stack E2E harness opts out explicitly so workspace isolation still
  // goes through the actor repository.
  if (developmentPrincipalFallbackEnabled()) {
    return ok({
      actorId: "22222222-2222-4222-8222-222222222201" as ActorId,
      subject: verified.value.subject,
    });
  }

  try {
    const actor = await uow.transaction((repos) =>
      repos.actors.findBySupabaseUserId(verified.value.subject),
    );

    if (actor === null) {
      return err("ACTOR_NOT_FOUND", "This account is not provisioned in the system.", {
        // The subject is safe to echo: the caller proved they own it.
        subject: verified.value.subject,
      });
    }

    return ok({ actorId: actor.actorId, subject: verified.value.subject });
  } catch (error) {
    console.error("DB Error in resolvePrincipal:", error);
    throw error;
  }
}
