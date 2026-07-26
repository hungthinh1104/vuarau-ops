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
export const publicProcedure = t.procedure;

/**
 * A client may not attribute an action to another actor. Skipped entirely when no
 * authenticated identity was supplied — see the note in `context.ts`.
 */
export const commandProcedure = t.procedure.use(async ({ ctx, next, getRawInput }) => {
  const rawInput = (await getRawInput()) as { actorId?: string } | undefined;
  const claimedActorId = rawInput?.actorId;
  if (
    ctx.authenticatedActorId !== undefined &&
    claimedActorId !== undefined &&
    claimedActorId !== ctx.authenticatedActorId
  ) {
    throw toTrpcError({
      code: "WORKSPACE_ACCESS_DENIED",
      message: "You cannot act on behalf of another actor.",
      retryable: false,
    });
  }
  return next();
});

/** tRPC codes are a coarse transport signal; clients branch on the domain code. */
const TRANSPORT_CODE: Partial<Record<DomainRejectionCode, TRPCError["code"]>> = {
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
