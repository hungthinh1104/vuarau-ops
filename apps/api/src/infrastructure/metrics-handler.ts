import type { IncomingMessage, ServerResponse } from "node:http";
import type { CommandDeps } from "../modules/shared/command-pipeline.ts";
import type { JwtVerifier } from "./auth/jwt-verifier.ts";
import { createContext } from "./trpc/context.ts";
import { renderMetrics } from "./metrics.ts";

/**
 * Metrics is outside tRPC because it is a Prometheus text endpoint, not a
 * business query. It is still a protected operational surface: a valid,
 * provisioned application identity is required before process counters are
 * returned. The transport guard runs before this handler and rate-limits it.
 */
export function createMetricsHandler(
  deps: CommandDeps,
  verifier: JwtVerifier,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    if ((req.url ?? "").split("?")[0] !== "/metrics" || req.method !== "GET") return false;

    const context = await createContext({
      deps,
      verifier,
      authorizationHeader: req.headers.authorization,
    });
    if (context.principal === null) {
      const requiresAuthentication =
        context.authError?.code === "AUTHENTICATION_REQUIRED" ||
        context.authError?.code === "AUTHENTICATION_INVALID";
      res.writeHead(requiresAuthentication ? 401 : 403, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ error: requiresAuthentication ? "unauthorized" : "forbidden" }));
      return true;
    }

    res.writeHead(200, {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(renderMetrics());
    return true;
  };
}
