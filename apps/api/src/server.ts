import { createServer } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { createDatabase, createUnitOfWork } from "@vuanha/db";
import { appRouter } from "./infrastructure/trpc/router.ts";
import { createContext } from "./infrastructure/trpc/context.ts";
import { randomIdGenerator, systemClock } from "./infrastructure/clock.ts";
import type { CommandDeps } from "./modules/shared/command-pipeline.ts";

/**
 * Development entry point. Wires the Drizzle adapters into the tRPC router.
 *
 * **Not production-ready, deliberately.** There is no authentication: the actor
 * identity is taken from the command envelope rather than a verified Supabase
 * JWT (see `context.ts`). No TLS, no CORS policy, no rate limiting, no graceful
 * shutdown. Building those now would be speculative infrastructure; what exists
 * is enough to exercise the slice against a real database.
 */
export function createApiHandler(deps: CommandDeps) {
  return createHTTPHandler({
    router: appRouter,
    createContext: () => createContext(deps),
  });
}

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const database = createDatabase(databaseUrl);
const deps: CommandDeps = {
  uow: createUnitOfWork(database.db, randomIdGenerator) as CommandDeps["uow"],
  clock: systemClock,
};

const port = Number(process.env["PORT"] ?? 3000);
createServer(createApiHandler(deps)).listen(port, () => {
  console.warn(`VuaNha API listening on http://localhost:${port}`);
});
