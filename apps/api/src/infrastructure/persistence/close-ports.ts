import type {
  CashStatementMatchDto,
  CashStatementMatchReversalId,
  OperationalCloseDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";

export type OperationalCloseRepository = {
  /** Serializes root/revision decisions for one workspace business date. */
  lockBusinessDate(workspaceId: WorkspaceId, businessDate: string): Promise<void>;
  findByIdForUpdate(
    workspaceId: WorkspaceId,
    operationalCloseId: OperationalCloseDto["id"],
  ): Promise<OperationalCloseDto | null>;
  findByBusinessDate(
    workspaceId: WorkspaceId,
    businessDate: string,
  ): Promise<OperationalCloseDto | null>;
  insert(close: OperationalCloseDto): Promise<boolean>;
  insertReopen(
    workspaceId: WorkspaceId,
    operationalCloseId: OperationalCloseDto["id"],
    reopen: NonNullable<OperationalCloseDto["reopen"]>,
  ): Promise<boolean>;
};

export type CashStatementMatchRepository = {
  /** Serializes the two active match identities inside the current transaction. */
  lockMatchIdentity(
    workspaceId: WorkspaceId,
    cashMovementId: CashStatementMatchDto["cashMovementId"],
    externalReference: string,
  ): Promise<void>;
  findByIdForUpdate(
    workspaceId: WorkspaceId,
    cashStatementMatchId: CashStatementMatchDto["id"],
  ): Promise<CashStatementMatchDto | null>;
  findByMovementId(
    workspaceId: WorkspaceId,
    cashMovementId: CashStatementMatchDto["cashMovementId"],
  ): Promise<CashStatementMatchDto | null>;
  findByExternalReference(
    workspaceId: WorkspaceId,
    externalReference: string,
  ): Promise<CashStatementMatchDto | null>;
  insert(match: CashStatementMatchDto): Promise<boolean>;
  insertReversal(reversal: {
    id: CashStatementMatchReversalId;
    workspaceId: WorkspaceId;
    cashStatementMatchId: CashStatementMatchDto["id"];
    reason: string;
    evidenceReferences: readonly string[];
    transactionTime: CashStatementMatchDto["transactionTime"];
    recordedAt: CashStatementMatchDto["recordedAt"];
    actorId: CashStatementMatchDto["actorId"];
    commandId: CashStatementMatchDto["commandId"];
  }): Promise<boolean>;
};
