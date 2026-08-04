import { describe, expect, it } from "vitest";
import { safeTrpcErrorMessage } from "./trpc.ts";

describe("tRPC error boundary", () => {
  it("does not expose unexpected internal error messages", () => {
    expect(
      safeTrpcErrorMessage({
        message: "select * from customer where workspace_id = 'secret'",
        code: "INTERNAL_SERVER_ERROR",
        hasDomainError: false,
      }),
    ).toBe("An unexpected server error occurred.");
  });

  it("preserves deliberate domain and transport messages", () => {
    expect(
      safeTrpcErrorMessage({
        message: "This sale has already been posted.",
        code: "CONFLICT",
        hasDomainError: true,
      }),
    ).toBe("This sale has already been posted.");
    expect(
      safeTrpcErrorMessage({
        message: "The command payload is not valid.",
        code: "BAD_REQUEST",
        hasDomainError: false,
      }),
    ).toBe("The command payload is not valid.");
  });
});
