import { describe, expect, it } from "vitest";
import type { DomainError, WorkspaceId } from "@vuarau/domain-contracts";
import { hasPermission, parseSession, selectWorkspace } from "./session.ts";
import { createQueryClient } from "./providers.tsx";
import {
  ownerSession,
  salesSession,
  warehouseSession,
  workspaceChoices,
} from "@/fixtures/session.fixtures.ts";
import {
  rejectionCommandInProgress,
  rejectionStaleVersion,
} from "@/fixtures/rejection.fixtures.ts";
import { OTHER_WORKSPACE_ID } from "@vuarau/test-fixtures/ids";

describe("TC-WEB-014 — the session bootstrap", () => {
  it("parses what came back rather than trusting it", () => {
    expect(() => parseSession(ownerSession)).not.toThrow();
    expect(() => parseSession({ ...ownerSession, role: "boss" })).toThrow();
  });

  /**
   * The client never holds a copy of the role table. `session.me` sends the
   * expanded permission set precisely so a UI that hard-coded the mapping could
   * not disagree with the server silently (ADR-0011).
   */
  it("answers 'may I at all' from the permissions the server sent", () => {
    expect(hasPermission(salesSession, "sale.post")).toBe(true);
    expect(hasPermission(salesSession, "sale.void")).toBe(false);
    expect(hasPermission(warehouseSession, "debt.read")).toBe(false);
    expect(hasPermission(ownerSession, "debt.adjust")).toBe(true);
  });
});

/**
 * TC-WEB-015 — workspace selection is explicit.
 *
 * Every command and read is scoped by `workspaceId` (BR-CUSTOMER-002), so a
 * silently chosen workspace is a silently chosen set of books.
 */
describe("TC-WEB-015 — workspace selection", () => {
  // The server's own answer, not a hand-written shape: a picker built from
  // anything else would be a second claim about who may enter which depot.
  const available = workspaceChoices;

  it("asks when nothing has been chosen, even with a single workspace", () => {
    expect(selectWorkspace([available[0]!], null)).toEqual({
      kind: "none_selected",
      available: [available[0]],
    });
  });

  it("returns the chosen workspace when it is still available", () => {
    expect(selectWorkspace(available, OTHER_WORKSPACE_ID)).toEqual({
      kind: "selected",
      workspaceId: OTHER_WORKSPACE_ID,
    });
  });

  /** A stale bookmark or a revoked membership falls back to asking, never to a different depot. */
  it("falls back to asking when the stored id is no longer available", () => {
    const revoked = "00000000-0000-4000-8000-0000000000a9" as WorkspaceId;
    expect(selectWorkspace(available, revoked).kind).toBe("none_selected");
  });
});

/**
 * TC-WEB-016 — the retry policy reads `retryable` from the server and never
 * decides for itself.
 */
describe("TC-WEB-016 — query retry policy", () => {
  const retryOf = () => {
    const option = createQueryClient().getDefaultOptions().queries?.retry;
    if (typeof option !== "function") throw new Error("expected a retry predicate");
    return option;
  };

  /** The shape tRPC throws: an Error carrying the rejection on `data`. */
  const trpcFailure = (domainError: DomainError): Error =>
    Object.assign(new Error(domainError.message), { data: { domainError } });

  it("retries the one code the server marks retryable", () => {
    expect(retryOf()(0, trpcFailure(rejectionCommandInProgress))).toBe(true);
  });

  it("never retries a version conflict", () => {
    // Retrying would apply an intention formed against data the user never saw.
    expect(retryOf()(0, trpcFailure(rejectionStaleVersion))).toBe(false);
  });

  it("retries a dropped connection twice, then stops", () => {
    const transportFailure = new Error("Failed to fetch");
    expect(retryOf()(0, transportFailure)).toBe(true);
    expect(retryOf()(1, transportFailure)).toBe(true);
    expect(retryOf()(2, transportFailure)).toBe(false);
  });

  it("never retries a mutation automatically", () => {
    // An automatic resend is only safe with the original idempotency key, and
    // that decision belongs to the code holding the pending command.
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
