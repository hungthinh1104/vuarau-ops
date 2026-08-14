import { expect } from "vitest";
import type {
  ActorId,
  FulfilmentRemainderCaseId,
  PurchaseId,
  SaleId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import {
  getOperationsBoard,
  getOperationsBoardCounts,
} from "../../../modules/dashboard/dashboard.queries.ts";
import { recordFulfilmentRemainderCase } from "../../../modules/delivery/delivery.handlers.ts";
import type { CommandContext as PipelineCommandContext } from "../../../modules/shared/command-pipeline.ts";

type RemainderEnvelope = {
  commandId: string;
  idempotencyKey: string;
  workspaceId: WorkspaceId;
  actorId: ActorId;
  occurredAt: string;
};

export async function assertFulfilmentRemainderDecision(args: {
  context: () => PipelineCommandContext;
  envelope: (label: string, occurredAt: string) => RemainderEnvelope;
  workspaceId: WorkspaceId;
  saleId: SaleId;
}): Promise<void> {
  const openRemainder = await recordFulfilmentRemainderCase(args.context(), {
    ...args.envelope("remainder-open", "2026-07-29T04:02:00.000Z"),
    payload: {
      fulfilmentRemainderCaseId: crypto.randomUUID() as FulfilmentRemainderCaseId,
      saleId: args.saleId,
      caseKind: "opened" as const,
      outcome: null,
      reason: "Phần còn lại cần quyết định.",
      relatedCaseId: null,
      evidenceReferences: ["review://remainder/001"],
    },
  });
  expect(openRemainder.ok).toBe(true);
  const unresolvedRemainder = await getOperationsBoard(args.context(), {
    workspaceId: args.workspaceId,
    filter: "fulfilment_remainder_unresolved",
    sort: "updated_desc",
    search: "",
    cursor: null,
    limit: 20,
  });
  expect(unresolvedRemainder.ok && unresolvedRemainder.value.page.items).toContainEqual(
    expect.objectContaining({
      id: args.saleId,
      nextAction: "Mở Sale để quyết định phần còn lại.",
    }),
  );
  const resolveRemainder = await recordFulfilmentRemainderCase(args.context(), {
    ...args.envelope("remainder-decision", "2026-07-29T04:03:00.000Z"),
    payload: {
      fulfilmentRemainderCaseId: crypto.randomUUID() as FulfilmentRemainderCaseId,
      saleId: args.saleId,
      caseKind: "decision" as const,
      outcome: "continue_fulfilment" as const,
      reason: "Tiếp tục chuyến giao kế tiếp.",
      relatedCaseId: null,
      evidenceReferences: ["review://remainder/002"],
    },
  });
  expect(resolveRemainder.ok).toBe(true);
  const resolvedRemainder = await getOperationsBoard(args.context(), {
    workspaceId: args.workspaceId,
    filter: "fulfilment_remainder_unresolved",
    sort: "updated_desc",
    search: "",
    cursor: null,
    limit: 20,
  });
  expect(resolvedRemainder.ok && resolvedRemainder.value.page.items).toEqual([]);
}

export async function assertInFlightDeliveryBoard(args: {
  context: () => PipelineCommandContext;
  workspaceId: WorkspaceId;
  saleId: SaleId;
}): Promise<void> {
  const inFlight = await getOperationsBoard(args.context(), {
    workspaceId: args.workspaceId,
    filter: "in_delivery",
    sort: "updated_desc",
    search: "",
    cursor: null,
    limit: 20,
  });
  expect(inFlight.ok).toBe(true);
  if (inFlight.ok)
    expect(inFlight.value.page.items).toContainEqual(
      expect.objectContaining({
        id: args.saleId,
        physicalState: "in_delivery",
        nextAction: "Theo dõi giao hàng",
      }),
    );
}

export async function assertIncompleteReceivingBoard(args: {
  context: () => PipelineCommandContext;
  workspaceId: WorkspaceId;
  purchaseId: PurchaseId;
}): Promise<void> {
  const board = await getOperationsBoard(args.context(), {
    workspaceId: args.workspaceId,
    filter: "incomplete_receiving",
    sort: "updated_desc",
    search: "",
    cursor: null,
    limit: 20,
  });
  expect(board.ok).toBe(true);
  if (board.ok)
    expect(board.value.page.items).toContainEqual(
      expect.objectContaining({
        id: args.purchaseId,
        physicalState: "needs_receiving",
        nextAction: "Nhận hàng",
        exceptions: expect.arrayContaining([
          expect.objectContaining({
            kind: "incomplete_receiving",
            closeImpact: "acknowledgeable",
            source: expect.objectContaining({ kind: "purchase", id: args.purchaseId }),
            nextAction: {
              label: "Mở Purchase để tiếp tục nhận và kiểm tra hàng.",
              href: `/purchases/${args.purchaseId}`,
            },
          }),
        ]),
      }),
    );
  const counts = await getOperationsBoardCounts(args.context(), {
    workspaceId: args.workspaceId,
    filter: "all",
    search: "",
  });
  expect(counts.ok).toBe(true);
  if (counts.ok) {
    expect(counts.value.counts.incompleteReceiving).toBe(1);
    expect(counts.value.counts.exceptionCounts.incomplete_receiving).toBe(1);
  }
}
