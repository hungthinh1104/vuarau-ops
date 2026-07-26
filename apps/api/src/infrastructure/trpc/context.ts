import type { DomainError } from "@vuanha/domain-contracts";
import type { CommandDeps } from "../../modules/shared/command-pipeline.ts";
import type { JwtVerifier } from "../auth/jwt-verifier.ts";
import { bearerTokenFrom } from "../auth/jwt-verifier.ts";
import type { AuthenticatedPrincipal } from "../auth/principal.ts";
import { resolvePrincipal } from "../auth/principal.ts";

/**
 * Per-request context.
 *
 * The identity is established **here**, from a verified bearer token, and is the
 * only thing downstream code trusts. A command's `actorId` is checked against it
 * (BR-AUTH-002); it is never the source of it.
 *
 * Authentication failures are carried rather than thrown so that a query with no
 * token gets the same `DomainError` envelope as every other refusal, and so that
 * the router — not the context builder — decides which procedures need identity.
 */
export type ApiContext = {
  readonly deps: CommandDeps;
  readonly principal: AuthenticatedPrincipal | null;
  /** Why the principal is null, when it is. */
  readonly authError: DomainError | null;
};

export type ContextInput = {
  readonly deps: CommandDeps;
  readonly verifier: JwtVerifier;
  readonly authorizationHeader?: string | undefined;
};

export async function createContext(input: ContextInput): Promise<ApiContext> {
  const token = bearerTokenFrom(input.authorizationHeader);
  const resolved = await resolvePrincipal(input.deps.uow, input.verifier, token);

  return resolved.ok
    ? { deps: input.deps, principal: resolved.value, authError: null }
    : { deps: input.deps, principal: null, authError: resolved.error };
}

/**
 * Builds a context from an already-resolved principal, for tests and for any
 * caller that authenticated by another route. It performs no verification —
 * which is exactly why it is named for what it does.
 */
export function createTrustedContext(
  deps: CommandDeps,
  principal: AuthenticatedPrincipal,
): ApiContext {
  return { deps, principal, authError: null };
}
