import type { WorkspaceBackupV7, WorkspaceId } from "@vuarau/domain-contracts";
import {
  goodsArrivalLines,
  goodsArrivalReversals,
  goodsArrivals,
  qualityDispositionAllocations,
  qualityDispositionReversals,
  qualityDispositions,
  qualityInspectionIssues,
  qualityInspectionReversals,
  qualityInspections,
  qualityIssueCodes,
} from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

type ScopedRow = Record<string, unknown> & { workspaceId: WorkspaceId };
type ScopeRow = (row: Record<string, unknown>) => ScopedRow;
type ParseDate = (value: unknown) => Date;

export async function restoreQualityIssueCodes(
  tx: Tx,
  payload: WorkspaceBackupV7["payload"],
  scoped: ScopeRow,
  date: ParseDate,
): Promise<void> {
  if (payload.qualityIssueCodes.length > 0) {
    await tx.insert(qualityIssueCodes).values(
      payload.qualityIssueCodes.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          createdAt: date(row["createdAt"]),
          updatedAt: date(row["updatedAt"]),
        };
      }) as unknown as (typeof qualityIssueCodes.$inferInsert)[],
    );
  }
}

export async function restoreInspectedIntake(
  tx: Tx,
  payload: WorkspaceBackupV7["payload"],
  scoped: ScopeRow,
  date: ParseDate,
): Promise<void> {
  if (payload.goodsArrivals.length > 0) {
    await tx.insert(goodsArrivals).values(
      payload.goodsArrivals.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof goodsArrivals.$inferInsert)[],
    );
  }
  if (payload.goodsArrivalLines.length > 0) {
    await tx
      .insert(goodsArrivalLines)
      .values(
        payload.goodsArrivalLines.map(
          scoped,
        ) as unknown as (typeof goodsArrivalLines.$inferInsert)[],
      );
  }
  if (payload.goodsArrivalReversals.length > 0) {
    await tx.insert(goodsArrivalReversals).values(
      payload.goodsArrivalReversals.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof goodsArrivalReversals.$inferInsert)[],
    );
  }
  if (payload.qualityInspections.length > 0) {
    await tx.insert(qualityInspections).values(
      payload.qualityInspections.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof qualityInspections.$inferInsert)[],
    );
  }
  if (payload.qualityInspectionIssues.length > 0) {
    await tx
      .insert(qualityInspectionIssues)
      .values(
        payload.qualityInspectionIssues.map(
          scoped,
        ) as unknown as (typeof qualityInspectionIssues.$inferInsert)[],
      );
  }
  if (payload.qualityInspectionReversals.length > 0) {
    await tx.insert(qualityInspectionReversals).values(
      payload.qualityInspectionReversals.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof qualityInspectionReversals.$inferInsert)[],
    );
  }
  if (payload.qualityDispositions.length > 0) {
    await tx.insert(qualityDispositions).values(
      payload.qualityDispositions.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof qualityDispositions.$inferInsert)[],
    );
  }
  if (payload.qualityDispositionAllocations.length > 0) {
    await tx
      .insert(qualityDispositionAllocations)
      .values(
        payload.qualityDispositionAllocations.map(
          scoped,
        ) as unknown as (typeof qualityDispositionAllocations.$inferInsert)[],
      );
  }
  if (payload.qualityDispositionReversals.length > 0) {
    await tx.insert(qualityDispositionReversals).values(
      payload.qualityDispositionReversals.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof qualityDispositionReversals.$inferInsert)[],
    );
  }
}
