import type {
  ActorId,
  CommandId,
  ProductId,
  QualityGradeId,
  StocktakeCountId,
  StocktakeSessionId,
  WorkspaceId,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import type { StocktakeCountState, StocktakeSessionState } from "@vuarau/domain-kernel";
import type { stocktakeCounts, stocktakeSessions } from "../../schema/index.ts";
import { toIso } from "../row-mappers.ts";

export function toStocktakeCountState(
  row: typeof stocktakeCounts.$inferSelect,
): StocktakeCountState {
  return {
    id: row.id as StocktakeCountId,
    workspaceId: row.workspaceId as WorkspaceId,
    sessionId: row.sessionId as StocktakeSessionId,
    productId: row.productId as ProductId,
    qualityGradeId: row.qualityGradeId as QualityGradeId | null,
    qualityGradeName: row.qualityGradeName,
    quantity: { valueScaled: row.quantityScaled, unit: row.unit },
    supersedesCountId: row.supersedesCountId as StocktakeCountId | null,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as ActorId,
    commandId: row.commandId as CommandId,
    evidenceReferences: [...(row.evidenceReferences ?? [])],
  };
}

export function toStocktakeSessionState(
  row: typeof stocktakeSessions.$inferSelect,
  counts: readonly StocktakeCountState[],
): StocktakeSessionState {
  return {
    id: row.id as StocktakeSessionId,
    workspaceId: row.workspaceId as WorkspaceId,
    asOf: toIso(row.asOf),
    scopeReference: row.scopeReference,
    note: row.note,
    status: row.status,
    version: row.version,
    policyVersionId: row.policyVersionId as WorkspacePolicyVersionId,
    counts: [...counts],
    varianceMovementIds: (row.varianceMovementIds ??
      []) as unknown as StocktakeSessionState["varianceMovementIds"],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as ActorId,
    commandId: row.commandId as CommandId,
    evidenceReferences: [...(row.evidenceReferences ?? [])],
  };
}
