import { TRPCError, initTRPC } from "@trpc/server";
import { ZodError } from "zod";
import type { DomainError, DomainRejectionCode } from "@vuanha/domain-contracts";
import { isRetryableCode } from "@vuanha/domain-contracts";
import type { DomainResult } from "@vuanha/domain-kernel";
import type { ApiContext } from "./context.ts";

/**
 * The transport edge. This is the only place a domain refusal becomes a thrown
 * error — inside the domain, refusals are returned values that must be handled to
 * compile (docs/06-api-contracts/error-contract.md).
 */
const t = initTRPC.context<ApiContext>().create({
  errorFormatter({ shape, error }) {
    // Input that fails the schema is still a business-facing refusal, and it gets
    // the same envelope as every other one rather than a bare Zod dump.
    const domainError =
      error.cause instanceof ZodError
        ? ({
            code: "INVALID_COMMAND_PAYLOAD",
            message: "The command payload is not valid.",
            details: {
              issues: error.cause.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
            retryable: false,
          } satisfies DomainError)
        : ((error.cause as { domainError?: DomainError } | undefined)?.domainError ?? null);

    return { ...shape, data: { ...shape.data, domainError } };
  },
});

export const router = t.router;

/**
 * There is deliberately no `publicProcedure` export.
 *
 * A depot's debt book has no public surface, and an exported unauthenticated
 * procedure builder is an invitation to add one by accident. Anything that
 * genuinely needs to be reachable without a token (a health check) should be
 * served outside this router.
 */

/**
 * Requires a verified identity (BR-AUTH-001).
 *
 * Impersonation is **not** checked here. It is checked inside the command
 * transaction, alongside membership and permission, so that one function decides
 * every authorization question and a procedure cannot be added that forgets one
 * of them. This middleware only refuses callers who have no identity at all.
 */
export const authenticatedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.principal === null) {
    throw toTrpcError(
      ctx.authError ?? {
        code: "AUTHENTICATION_REQUIRED",
        message: "This operation requires an access token.",
        retryable: false,
      },
    );
  }
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});

/** Every command procedure. Named for what it guards. */
export const commandProcedure = authenticatedProcedure;

/** tRPC codes are a coarse transport signal; clients branch on the domain code. */
const TRANSPORT_CODE: Partial<Record<DomainRejectionCode, TRPCError["code"]>> = {
  AUTHENTICATION_REQUIRED: "UNAUTHORIZED",
  AUTHENTICATION_INVALID: "UNAUTHORIZED",
  ACTOR_NOT_FOUND: "FORBIDDEN",
  ACTOR_IMPERSONATION_DENIED: "FORBIDDEN",
  WORKSPACE_MEMBERSHIP_INACTIVE: "FORBIDDEN",
  PERMISSION_DENIED: "FORBIDDEN",
  WORKSPACE_ACCESS_DENIED: "FORBIDDEN",
  CUSTOMER_NOT_FOUND: "NOT_FOUND",
  ORDER_NOT_FOUND: "NOT_FOUND",
  PAYMENT_NOT_FOUND: "NOT_FOUND",
  ORDER_ALREADY_CONFIRMED: "CONFLICT",
  ORDER_CANCELLED: "CONFLICT",
  ORDER_VERSION_CONFLICT: "CONFLICT",
  PAYMENT_ALREADY_REVERSED: "CONFLICT",
  PAYMENT_VERSION_CONFLICT: "CONFLICT",
  DUPLICATE_COMMAND: "CONFLICT",
  IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: "CONFLICT",
  COMMAND_IN_PROGRESS: "CONFLICT",
};

export function toTrpcError(error: DomainError): TRPCError {
  return new TRPCError({
    code: TRANSPORT_CODE[error.code] ?? "BAD_REQUEST",
    message: error.message,
    cause: { domainError: { ...error, retryable: isRetryableCode(error.code) } },
  });
}

/** Unwraps a domain result at the boundary, or throws the mapped error. */
export function unwrap<T>(result: DomainResult<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw toTrpcError(result.error);
}
