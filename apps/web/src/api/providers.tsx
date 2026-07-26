"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState, type ReactNode } from "react";
import type { AppRouter, BearerTokenSource } from "./trpc.ts";
import { createApiClient } from "./trpc.ts";
import { browserAccessToken } from "./access-token.ts";
import { domainErrorOf, isAutoRetryable } from "./domain-error.ts";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/**
 * One retry policy for the whole app, because "should this be retried" is a
 * business question and answering it per call site is how it gets answered
 * differently in two places.
 *
 * The server already decided: `retryable` is derived from the rejection code and
 * is true for exactly one of them today (`COMMAND_IN_PROGRESS`). A version
 * conflict is emphatically not retryable — retrying would apply an intention
 * formed against data this user never saw.
 *
 * Mutations get `retry: false` regardless. An automatic resend of a command is
 * only safe when it carries the original idempotency key, and that decision
 * belongs to the code holding the pending command, not to a cache library.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          const domainError = domainErrorOf(error);
          // No domain error means the transport failed, not the business rule.
          // Two quiet retries on flaky 4G, then tell the user.
          if (domainError === null) return failureCount < 2;
          return isAutoRetryable(domainError) && failureCount < 3;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function ApiProvider({
  children,
  getToken = browserAccessToken,
}: {
  children: ReactNode;
  /** Defaults to the browser's Supabase session. Overridden only by tests. */
  getToken?: BearerTokenSource;
}) {
  const [queryClient] = useState(createQueryClient);
  const [client] = useState(() => createApiClient(getToken));

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
