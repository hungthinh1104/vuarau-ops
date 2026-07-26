import type { ActorId } from "@vuanha/domain-contracts";
import type { CommandDeps } from "../../modules/shared/command-pipeline.ts";

/**
 * Per-request context.
 *
 * `authenticatedActorId` is the identity the transport established. When it is
 * present, the command envelope's `actorId` must match it — a client may not
 * attribute a debt movement to somebody else.
 *
 * **Supabase JWT verification is not implemented in this phase.** The API accepts
 * a resolved actor from its caller. Deploying this behind an untrusted network
 * without adding that verification would make `actorId` self-asserted, and the
 * audit trail meaningless. Recorded in docs/09-decisions/decision-backlog.md.
 */
export type ApiContext = {
  readonly deps: CommandDeps;
  readonly authenticatedActorId?: ActorId;
};

export function createContext(deps: CommandDeps, authenticatedActorId?: ActorId): ApiContext {
  return authenticatedActorId === undefined ? { deps } : { deps, authenticatedActorId };
}
