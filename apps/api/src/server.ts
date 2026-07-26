import { createServer } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { createDatabase, createUnitOfWork } from "@vuanha/db";
import { appRouter } from "./infrastructure/trpc/router.ts";
import { createContext } from "./infrastructure/trpc/context.ts";
import { createSupabaseJwtVerifier, type JwtVerifier } from "./infrastructure/auth/jwt-verifier.ts";
import { randomIdGenerator, systemClock } from "./infrastructure/clock.ts";
import type { CommandDeps } from "./modules/shared/command-pipeline.ts";

/**
 * Development entry point. Wires the Drizzle adapters and a Supabase JWT
 * verifier into the tRPC router.
 *
 * Since Milestone 1 the actor identity comes from a verified bearer token, not
 * from the request body. What is still missing for production: TLS, a CORS
 * policy, rate limiting, structured request logging, and graceful shutdown.
 * Those are deployment concerns, listed rather than half-built.
 */
export function createApiHandler(deps: CommandDeps, verifier: JwtVerifier) {
  return createHTTPHandler({
    router: appRouter,
    createContext: ({ req }) =>
      createContext({ deps, verifier, authorizationHeader: req.headers.authorization }),
  });
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    console.error(`${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

const databaseUrl = required("DATABASE_URL");
const issuer = required("SUPABASE_JWT_ISSUER");

/**
 * Asymmetric keys (JWKS) are preferred: the API then never holds signing
 * material, so a compromise here cannot mint tokens. The HS256 path exists for
 * Supabase projects still on the legacy shared secret.
 */
const jwksUrl = process.env["SUPABASE_JWKS_URL"];
const jwtSecret = process.env["SUPABASE_JWT_SECRET"];

if ((jwksUrl === undefined) === (jwtSecret === undefined)) {
  console.error("Set exactly one of SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET.");
  process.exit(1);
}

const verifier = createSupabaseJwtVerifier({
  issuer,
  audience: process.env["SUPABASE_JWT_AUDIENCE"] ?? "authenticated",
  ...(jwksUrl !== undefined ? { jwksUrl } : {}),
  ...(jwtSecret !== undefined ? { jwtSecret } : {}),
});

const database = createDatabase(databaseUrl);
const deps: CommandDeps = {
  uow: createUnitOfWork(database.db, randomIdGenerator) as CommandDeps["uow"],
  clock: systemClock,
};

const port = Number(process.env["PORT"] ?? 3000);
createServer(createApiHandler(deps, verifier)).listen(port, () => {
  console.warn(`VuaNha API listening on http://localhost:${port}`);
});
