import type {
  CashStatementMatchDto,
  CashStatementMatchReversalId,
  OperationalCloseExceptionAcknowledgementDto,
  OperationalCloseDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";

export type OperationalCloseExceptionAcknowledgementRepository = {
  lockIdentity(
    workspaceId: WorkspaceId,
    businessDate: string,
    exceptionKind: OperationalCloseExceptionAcknowledgementDto["exceptionKind"],
    sourceKind: OperationalCloseExceptionAcknowledgementDto["source"]["kind"],
    sourceId: string,
  ): Promise<void>;
  findByIdentity(args: {
    workspaceId: WorkspaceId;
    businessDate: string;
    exceptionKind: OperationalCloseExceptionAcknowledgementDto["exceptionKind"];
    sourceKind: OperationalCloseExceptionAcknowledgementDto["source"]["kind"];
    sourceId: string;
  }): Promise<OperationalCloseExceptionAcknowledgementDto | null>;
  insert(acknowledgement: OperationalCloseExceptionAcknowledgementDto): Promise<boolean>;
};

export type OperationalCloseRepository = {
  /** Shared lock used by ordinary commands for the close check. */
  lockBusinessDateShared(workspaceId: WorkspaceId, businessDate: string): Promise<void>;
  /** Exclusive lock used by close/reopen lifecycle commands. */
  lockBusinessDateExclusive(workspaceId: WorkspaceId, businessDate: string): Promise<void>;
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
