import type { IncomingMessage, ServerResponse } from "node:http";
import { workspaceIdSchema, workspaceChangesSinceDtoSchema } from "@vuarau/domain-contracts";
import { createContext } from "./trpc/context.ts";
import type { JwtVerifier } from "./auth/jwt-verifier.ts";
import type { CommandDeps } from "../modules/shared/command-pipeline.ts";
import { authorizeWorkspaceAccess } from "../modules/shared/authorization.ts";

const MAX_LIMIT = 200;

/**
 * Durable counterpart to `/events`: it is safe to poll, reconnect and drain
 * without exposing command payloads, results or idempotency keys.
 */
export function createChangesHandler(
  deps: CommandDeps,
  verifier: JwtVerifier,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method !== "GET" || url.pathname !== "/changes") return false;
    const parsedWorkspace = workspaceIdSchema.safeParse(url.searchParams.get("workspaceId"));
    const rawSince = url.searchParams.get("since") ?? "0";
    const rawLimit = url.searchParams.get("limit") ?? "200";
    const limit = Number(rawLimit);
    if (
      !parsedWorkspace.success ||
      !/^\d+$/.test(rawSince) ||
      !Number.isSafeInteger(Number(rawSince)) ||
      Number(rawSince) < 0 ||
      !Number.isFinite(limit)
    ) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "workspaceId and a valid since revision are required" }));
      return true;
    }

    const context = await createContext({
      deps,
      verifier,
      authorizationHeader: req.headers.authorization,
    });
    if (context.principal === null) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Authentication required" }));
      return true;
    }

    const result = await deps.uow.transaction(async (repos) => {
      const access = await authorizeWorkspaceAccess({
        repos,
        principal: context.principal!,
        workspaceId: parsedWorkspace.data,
        permission: "report.read",
      });
      if (!access.ok) return access;
      const page = await repos.receipts.changesSince(
        parsedWorkspace.data,
        rawSince,
        Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT),
      );
      return {
        ok: true as const,
        value: workspaceChangesSinceDtoSchema.parse({
          workspaceId: parsedWorkspace.data,
          changes: page.changes,
          nextRevision: page.nextRevision,
        }),
      };
    });

    if (!result.ok) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: result.error.code }));
      return true;
    }
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-cache, no-store",
    });
    res.end(JSON.stringify(result.value));
    return true;
  };
}
