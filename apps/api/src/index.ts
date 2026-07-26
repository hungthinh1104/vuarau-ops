export { appRouter, type AppRouter } from "./infrastructure/trpc/router.ts";
export {
  createContext,
  createTrustedContext,
  type ApiContext,
} from "./infrastructure/trpc/context.ts";
export {
  createSupabaseJwtVerifier,
  bearerTokenFrom,
  type JwtVerifier,
  type SupabaseJwtConfig,
} from "./infrastructure/auth/jwt-verifier.ts";
export { resolvePrincipal, type AuthenticatedPrincipal } from "./infrastructure/auth/principal.ts";
export {
  systemClock,
  randomIdGenerator,
  type Clock,
  type IdGenerator,
} from "./infrastructure/clock.ts";
export type { CommandDeps, CommandContext } from "./modules/shared/command-pipeline.ts";
export type {
  Repositories,
  UnitOfWork,
  WorkspaceMembership,
} from "./infrastructure/persistence/ports.ts";
