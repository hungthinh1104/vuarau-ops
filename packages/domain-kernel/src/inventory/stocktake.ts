import type {
  ApproveStocktakeCommand,
  RecordStocktakeCountCommand,
  ReopenStocktakeCommand,
  StartStocktakeCommand,
  StocktakeCountDto,
  StocktakeState,
} from "@vuarau/domain-contracts";
import type {
  InventoryMovementState,
  StocktakeCountState,
  StocktakeSessionState,
} from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

function countKey(count: {
  productId: string;
  qualityGradeId: string | null;
  quantity: { unit: string };
}): string {
  return `${count.productId}:${count.qualityGradeId ?? "ungraded"}:${count.quantity.unit}`;
}

export function decideStartStocktake(
  command: StartStocktakeCommand,
  policyVersionId: StocktakeSessionState["policyVersionId"],
  recordedAt: string,
): DomainResult<StocktakeSessionState> {
  return ok({
    id: command.payload.stocktakeSessionId,
    workspaceId: command.workspaceId,
    asOf: command.payload.asOf,
    scopeReference: command.payload.scopeReference.trim(),
    note: command.payload.note?.trim() || null,
    status: "draft",
    version: 1,
    policyVersionId,
    counts: [],
    varianceMovementIds: [],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    evidenceReferences: [...command.payload.evidenceReferences],
  });
}

export function decideRecordStocktakeCount(args: {
  readonly session: StocktakeSessionState;
  readonly existingCounts: readonly StocktakeCountState[];
  readonly command: RecordStocktakeCountCommand;
  readonly recordedAt: string;
}): DomainResult<{ readonly count: StocktakeCountState; readonly session: StocktakeSessionState }> {
  const { session, command, recordedAt } = args;
  if (session.status !== "draft" && session.status !== "reopened") {
    return err("STOCKTAKE_STATE_INVALID", "Counts can only be recorded in an open stocktake.");
  }
  if (command.payload.quantity.valueScaled < 0) {
    return err("STOCKTAKE_COUNT_INVALID", "A physical count cannot be negative.");
  }
  if (command.payload.supersedesCountId !== null) {
    const target = args.existingCounts.find(
      (count) => count.id === command.payload.supersedesCountId,
    );
    if (target === undefined || target.sessionId !== session.id) {
      return err("STOCKTAKE_COUNT_INVALID", "The corrected count is not part of this session.");
    }
    if (
      target.productId !== command.payload.productId ||
      target.qualityGradeId !== command.payload.qualityGradeId ||
      target.quantity.unit !== command.payload.quantity.unit
    ) {
      return err("STOCKTAKE_COUNT_INVALID", "A corrected count must keep the counted identity.");
    }
  } else if (
    args.existingCounts.some(
      (count) =>
        countKey(count) ===
        countKey({
          productId: command.payload.productId,
          qualityGradeId: command.payload.qualityGradeId,
          quantity: { unit: command.payload.quantity.unit },
        }),
    )
  ) {
    return err("STOCKTAKE_COUNT_DUPLICATE", "This product and grade already has a count.");
  }
  const count: StocktakeCountState = {
    id: command.payload.stocktakeCountId,
    workspaceId: command.workspaceId,
    sessionId: session.id,
    productId: command.payload.productId,
    qualityGradeId: command.payload.qualityGradeId,
    qualityGradeName: command.payload.qualityGradeName,
    quantity: { ...command.payload.quantity },
    supersedesCountId: command.payload.supersedesCountId,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    evidenceReferences: [...command.payload.evidenceReferences],
  };
  return ok({
    count,
    session: { ...session, version: session.version + 1, counts: [...session.counts, count] },
  });
}

export function activeStocktakeCounts(
  counts: readonly StocktakeCountState[],
): readonly StocktakeCountState[] {
  const latest = new Map<string, StocktakeCountState>();
  for (const count of counts) {
    const current = latest.get(countKey(count));
    if (
      current === undefined ||
      count.recordedAt > current.recordedAt ||
      (count.recordedAt === current.recordedAt && count.id > current.id)
    ) {
      latest.set(countKey(count), count);
    }
  }
  return [...latest.values()].sort((left, right) => countKey(left).localeCompare(countKey(right)));
}

export function decideApproveStocktake(args: {
  readonly session: StocktakeSessionState;
  readonly command: ApproveStocktakeCommand;
}): DomainResult<StocktakeSessionState> {
  if (args.session.status !== "draft" && args.session.status !== "reopened") {
    return err("STOCKTAKE_STATE_INVALID", "Only an open stocktake can be approved.");
  }
  if (args.session.counts.length === 0) {
    return err("STOCKTAKE_COUNT_INVALID", "A stocktake needs at least one count before approval.");
  }
  return ok({ ...args.session, status: "approved", version: args.session.version + 1 });
}

export function decideReopenStocktake(args: {
  readonly session: StocktakeSessionState;
  readonly command: ReopenStocktakeCommand;
  readonly allowReopen: boolean;
}): DomainResult<StocktakeSessionState> {
  if (!args.allowReopen) {
    return err(
      "STOCKTAKE_STATE_INVALID",
      "This workspace policy does not allow reopening stocktake.",
    );
  }
  if (args.session.status !== "approved") {
    return err("STOCKTAKE_STATE_INVALID", "Only an approved stocktake can be reopened.");
  }
  return ok({ ...args.session, status: "reopened", version: args.session.version + 1 });
}

export function calculateStocktakeExpectedQuantity(args: {
  readonly movements: readonly Pick<InventoryMovementState, "quantity" | "transactionTime">[];
  readonly asOf: string;
}): number {
  return args.movements
    .filter((movement) => Date.parse(movement.transactionTime) <= Date.parse(args.asOf))
    .reduce((total, movement) => total + movement.quantity.valueScaled, 0);
}

export function stocktakeCountDto(count: StocktakeCountState): StocktakeCountDto {
  return { ...count, evidenceReferences: [...count.evidenceReferences] };
}

export type StocktakeStatus = StocktakeState;
