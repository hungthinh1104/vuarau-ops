import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { createDatabase, createUnitOfWork } from "@vuarau/db";
import { appRouter } from "./infrastructure/trpc/router.ts";
import { createContext } from "./infrastructure/trpc/context.ts";
import { createSupabaseJwtVerifier, type JwtVerifier } from "./infrastructure/auth/jwt-verifier.ts";
import { randomIdGenerator, systemClock } from "./infrastructure/clock.ts";
import { describeConfig, readServerConfig } from "./infrastructure/config.ts";
import { log, withRequestId } from "./infrastructure/logging.ts";
import { renderMetrics } from "./infrastructure/metrics.ts";
import { createRequestGuard, safeRequestId } from "./infrastructure/request-guard.ts";
import { checkReadiness } from "./infrastructure/readiness.ts";
import type { CommandDeps } from "./modules/shared/command-pipeline.ts";
import { createPublicDocumentHandler } from "./modules/document/public-document.ts";

/**
 * The API process.
 *
 * Configuration is read and judged **before anything listens** (BR-OPS-002): a
 * missing variable is a startup failure naming the variable, not a request that
 * fails at a loading bay. What is still not here, and is listed rather than
 * half-built: TLS termination, rate limiting and graceful shutdown, all of which
 * belong to the environment (docs/11-operations/deployment-contract.md).
 */
export function createApiHandler(deps: CommandDeps, verifier: JwtVerifier) {
  return createHTTPHandler({
    router: appRouter,
    createContext: ({ req }) =>
      createContext({ deps, verifier, authorizationHeader: req.headers.authorization }),
  });
}

/**
 * Liveness and readiness, and the difference between them matters to whoever is
 * holding the pager.
 *
 * **Liveness** answers "is this process still running": it touches nothing, so a
 * database outage does not make an orchestrator kill and restart every instance
 * of a healthy application.
 *
 * **Readiness** answers "may traffic be sent here": configuration is complete and
 * the database answers. A ready check that skipped the database would send a
 * depot worker to a process that cannot write their sale.
 *
 * Neither returns anything about the depot. The failing check is named; nothing
 * says what is in the database (BR-OPS-001).
 */
export function createHealthHandler(
  probe: () => Promise<{ ok: boolean; failing: string | null }>,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    const path = (req.url ?? "").split("?")[0];

    if (path === "/health/live") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "live" }));
      log({ event: "health", probe: "live", status: 200, failing: null });
      return true;
    }

    if (path === "/health/ready") {
      const result = await probe();
      const status = result.ok ? 200 : 503;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ status: result.ok ? "ready" : "not_ready", failing: result.failing }),
      );
      log({ event: "health", probe: "ready", status, failing: result.failing });
      return true;
    }

    return false;
  };
}

const configuration = readServerConfig(process.env);
if (!configuration.ok) {
  console.error("The API cannot start. Fix these environment variables:\n");
  for (const problem of configuration.problems) {
    console.error(`  ${problem.variable}: ${problem.problem}`);
  }
  console.error("\nSee .env.example and docs/11-operations/deployment-contract.md.");
  process.exit(1);
}

const config = configuration.config;
const verifier = createSupabaseJwtVerifier({
  issuer: config.auth.issuer,
  audience: config.auth.audience,
  ...("jwksUrl" in config.auth ? { jwksUrl: config.auth.jwksUrl } : {}),
  ...("jwtSecret" in config.auth ? { jwtSecret: config.auth.jwtSecret } : {}),
});

const database = createDatabase(config.databaseUrl);
const deps: CommandDeps = {
  uow: createUnitOfWork(database.db, randomIdGenerator) as CommandDeps["uow"],
  clock: systemClock,
};

const health = createHealthHandler(() => checkReadiness(database));
const publicDocument = createPublicDocumentHandler(deps);
const trpc = createApiHandler(deps, verifier);
const guard = createRequestGuard(config.requestLimits);

createServer((req, res) => {
  /*
   * A correlation id per request, taken from the caller when it offers one so a
   * trace survives a proxy, and minted otherwise. Echoed in the response header,
   * because the id a support conversation starts from is the one on the phone.
   */
  const requestId = safeRequestId(req.headers["x-request-id"], randomUUID());
  res.setHeader("x-request-id", requestId);

  const startedAt = Date.now();
  const procedure = (req.url ?? "/").split("?")[0]?.replace(/^\//, "") ?? "";

  res.on("finish", () => {
    if (procedure.startsWith("health/")) return; // Already logged, with its probe.
    log({
      event: "request",
      requestId,
      // A router path — `sale.post` — and never a query string, which on a read
      // carries the input.
      procedure,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  void withRequestId(requestId, async () => {
    if (guard(req, res)) return;
    if (await health(req, res)) return;
    if ((req.url ?? "").split("?")[0] === "/metrics" && req.method === "GET") {
      res.writeHead(200, {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(renderMetrics());
      return;
    }
    if (await publicDocument(req, res)) return;
    trpc(req, res);
  });
}).listen(config.port, () => {
  for (const line of describeConfig(config)) console.warn(line);
  log({
    event: "startup",
    appEnv: config.appEnv,
    port: config.port,
    verification: "jwksUrl" in config.auth ? "jwks" : "hs256",
  });
});
