import type { IncomingMessage, ServerResponse } from "node:http";
import { workspaceIdSchema } from "@vuarau/domain-contracts";
import { createContext } from "./trpc/context.ts";
import type { JwtVerifier } from "./auth/jwt-verifier.ts";
import type { CommandDeps } from "../modules/shared/command-pipeline.ts";
import { authorizeWorkspaceAccess } from "../modules/shared/authorization.ts";
import type { InvalidationBus } from "./invalidation.ts";

/**
 * SSE is a long-lived request, so authorization cannot be a one-time check at
 * connection open. Reusing the normal context path re-verifies the bearer
 * token, including expiry, and the membership lookup locks the current row for
 * the short validation transaction.
 */
export function createEventsHandler(
  deps: CommandDeps,
  verifier: JwtVerifier,
  bus: InvalidationBus,
  heartbeatMs = 25_000,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method !== "GET" || url.pathname !== "/events") return false;
    const parsedWorkspace = workspaceIdSchema.safeParse(url.searchParams.get("workspaceId"));
    if (!parsedWorkspace.success) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "workspaceId is required" }));
      return true;
    }

    const authorizationHeader = req.headers.authorization;
    const checkAccess = async (): Promise<{
      readonly authenticated: boolean;
      readonly allowed: boolean;
      readonly errorCode: string | null;
    }> => {
      const context = await createContext({ deps, verifier, authorizationHeader });
      if (context.principal === null) {
        return { authenticated: false, allowed: false, errorCode: context.authError?.code ?? null };
      }
      const allowed = await deps.uow.transaction((repos) =>
        authorizeWorkspaceAccess({
          repos,
          principal: context.principal!,
          workspaceId: parsedWorkspace.data,
          permission: "report.read",
        }),
      );
      return {
        authenticated: true,
        allowed: allowed.ok,
        errorCode: allowed.ok ? null : allowed.error.code,
      };
    };

    const initialAccess = await checkAccess();
    if (!initialAccess.authenticated) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Authentication required" }));
      return true;
    }
    if (!initialAccess.allowed) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: initialAccess.errorCode }));
      return true;
    }

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(": connected\n\n");

    let unsubscribe = (): void => undefined;
    let closed = false;
    let checking = false;

    const closeStream = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) res.end();
    };

    unsubscribe = bus.subscribe(parsedWorkspace.data, (event) => {
      if (!closed && !res.writableEnded) {
        res.write(`event: invalidation\ndata: ${JSON.stringify(event)}\n\n`);
      }
    });

    const revalidate = async (): Promise<void> => {
      if (checking || closed || res.writableEnded) return;
      checking = true;
      try {
        const access = await checkAccess();
        if (!access.authenticated || !access.allowed) closeStream();
        else if (!closed && !res.writableEnded) res.write(": keepalive\n\n");
      } catch {
        // A failed revalidation is fail-closed for a long-lived stream. The
        // client can establish a fresh connection after the dependency recovers.
        closeStream();
      } finally {
        checking = false;
      }
    };

    const heartbeat = setInterval(() => {
      void revalidate();
    }, heartbeatMs);
    heartbeat.unref?.();

    const cleanup = (): void => closeStream();
    req.once("close", cleanup);
    res.once("close", cleanup);
    return true;
  };
}
