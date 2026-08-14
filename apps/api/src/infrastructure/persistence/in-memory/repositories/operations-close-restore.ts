import type {
  CashStatementMatchDto,
  OperationalCloseDto,
  OperationalCloseExceptionAcknowledgementDto,
  WorkspaceBackupV22,
} from "@vuarau/domain-contracts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export function restoreCloseFacts(
  store: Store,
  workspaceId: string,
  payload: WorkspaceBackupV22["payload"],
): void {
  const remap = <T extends Record<string, unknown>>(row: T) => ({
    ...row,
    workspaceId,
  });
  for (const raw of payload.operationalCloses) {
    const reopen = payload.operationalCloseReopens.find(
      (candidate) => candidate["operationalCloseId"] === raw["id"],
    );
    const row = remap({
      ...raw,
      supersedesOperationalCloseId: raw["supersedesOperationalCloseId"] ?? null,
      version: raw["version"] ?? 1,
      evidenceReferences: raw["evidenceReferences"] ?? [],
      observationIds: raw["observationIds"] ?? [],
      reopen:
        reopen === undefined
          ? null
          : {
              id: reopen["id"],
              reason: reopen["reason"],
              evidenceReferences: reopen["evidenceReferences"] ?? [],
              transactionTime: reopen["transactionTime"],
              recordedAt: reopen["recordedAt"],
              actorId: reopen["actorId"],
              commandId: reopen["commandId"],
            },
    }) as unknown as OperationalCloseDto;
    store.operationalCloses.set(key(workspaceId, row.id), row);
  }
  for (const raw of payload.cashStatementMatches) {
    const reversal = payload.cashStatementMatchReversals.find(
      (candidate) => candidate["cashStatementMatchId"] === raw["id"],
    );
    const row = remap({
      ...raw,
      evidenceReferences: raw["evidenceReferences"] ?? [],
      reversal:
        reversal === undefined
          ? null
          : {
              id: reversal["id"],
              reason: reversal["reason"],
              evidenceReferences: reversal["evidenceReferences"] ?? [],
              transactionTime: reversal["transactionTime"],
              recordedAt: reversal["recordedAt"],
              actorId: reversal["actorId"],
              commandId: reversal["commandId"],
            },
    }) as unknown as CashStatementMatchDto;
    store.cashStatementMatches.set(key(workspaceId, row.id), row);
  }
  for (const raw of payload.operationalCloseExceptionAcknowledgements) {
    const source = raw["source"] as Record<string, unknown> | undefined;
    const row = remap({
      ...raw,
      source: {
        kind: raw["sourceKind"] ?? source?.["kind"],
        reference: raw["sourceReference"] ?? source?.["reference"],
        id: raw["sourceId"] ?? source?.["id"],
      },
      evidenceReferences: raw["evidenceReferences"] ?? [],
    }) as unknown as OperationalCloseExceptionAcknowledgementDto;
    store.operationalCloseExceptionAcknowledgements.set(key(workspaceId, row.id), row);
  }
}
