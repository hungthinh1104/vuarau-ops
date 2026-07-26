import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@vuarau/api";

/**
 * The one place `@vuarau/api` is named, and it is named **as a type**.
 *
 * `import type` is erased before a bundler ever sees it, so nothing from the
 * server — Drizzle, postgres.js, jose — can reach the browser through this line.
 * That is not a convention to remember: `scripts/boundary-check.ts` forbids a
 * value import of `@vuarau/api` anywhere under `apps/web/src`, and this file is
 * the sole exception for the type.
 *
 * The alternative, generating a client from a schema, buys nothing here: the
 * router *is* the schema, and a generated copy is a copy that can be stale.
 */
export type { AppRouter };

/**
 * Same-origin. `/trpc` is rewritten to the API by `next.config.ts`, so the
 * browser makes no cross-origin request and the API needs no CORS policy —
 * see the note there for why that is deliberate rather than unfinished.
 */
const TRPC_URL = "/trpc";

export type BearerTokenSource = () => string | null | Promise<string | null>;

/**
 * The token comes from Supabase's client, which owns the session, the refresh
 * and the storage. Passing a getter rather than a token means every request asks
 * for the current one, so a refresh mid-session is invisible here.
 *
 * There is no client-side authentication logic in this app on purpose: a second
 * implementation of "is this person signed in" is a second answer to it.
 */
export function createApiClient(getToken: BearerTokenSource, url: string = TRPC_URL) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
        headers: async () => {
          const token = await getToken();
          return token === null ? {} : { authorization: `Bearer ${token}` };
        },
      }),
    ],
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

export { TRPCClientError };
