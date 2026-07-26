import type {
  ActorId,
  AuditAction,
  AuditAggregateType,
  CommandId,
  CustomerId,
  DebtAdjustmentReasonCode,
  DebtLedgerEntryId,
  IsoInstant,
  LedgerSourceType,
  Money,
  WorkspaceId,
} from "@vuanha/domain-contracts";

/**
 * What a decision function *describes* rather than performs.
 *
 * The kernel is deterministic (ADR-0003): it generates no ids and reads no clock.
 * A ledger entry therefore leaves the kernel without its primary key — the
 * application layer assigns that when it writes the row. Everything else,
 * including both timestamps, is decided here so that the same input always
 * produces the same effect.
 */
export type LedgerEntryDraft = {
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  /** Signed: positive increases what the customer owes. */
  readonly amount: Money;
  readonly sourceType: LedgerSourceType;
  readonly sourceId: string;
  readonly reversalOfEntryId: DebtLedgerEntryId | null;
  readonly reasonCode: DebtAdjustmentReasonCode | null;
  readonly reason: string | null;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly actorId: ActorId;
  readonly commandId: CommandId;
};

/**
 * An audit record describes a business action, not a row diff.
 * `before`/`after` are short semantic summaries — "balance 1 200 000 → 900 000" —
 * never a dump of the aggregate, which would copy customer data into a table with
 * a different retention policy.
 */
export type AuditDraft = {
  readonly aggregateType: AuditAggregateType;
  readonly aggregateId: string;
  readonly action: AuditAction;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly reason: string | null;
};

/**
 * The uniform shape every decision function returns on success.
 *
 * `ledgerEntries` is a list, but for every command in this slice it holds exactly
 * zero or one entry. It is a list because the shape should not have to change when
 * a future command (order cancellation, invoice posting) needs two.
 */
export type Decision<TAggregate> = {
  readonly aggregate: TAggregate;
  readonly ledgerEntries: readonly LedgerEntryDraft[];
  readonly audit: AuditDraft;
};
