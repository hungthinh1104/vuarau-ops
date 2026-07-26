import type {
  AccountEntrySource,
  AuditAction,
  AuditAggregateType,
  AuditCorrection,
  AuditRecordId,
  ActorId,
  BalanceClassification,
  CommandId,
  CursorPosition,
  CustomerAccountEntryId,
  CustomerId,
  DebtAdjustmentReasonCode,
  DomainRejectionCode,
  IsoInstant,
  Money,
  PaymentId,
  PaymentMethod,
  PaymentStatus,
  SaleId,
  SaleStatus,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { SaleState } from "@vuarau/domain-kernel";

/**
 * Read ports, separate from the write ports on purpose.
 *
 * The write side loads aggregates: whole, locked, consistent, one at a time. The
 * read side answers screens: paged, joined, projected, and never locked. Sharing
 * one repository between them ends with `findById` growing a `withCustomerName`
 * flag, and then a command loading data it has no business loading.
 *
 * Every method takes `workspaceId` as a required argument (BR-CUSTOMER-002), and
 * every list is keyset-paged on a deterministic `(sortValue, id)` key so a page
 * boundary cannot repeat or skip a row while somebody is writing.
 *
 * **No method here may issue a query per returned row.** Everything a list needs
 * — a customer's name, a sale's line count, an entry's source — is joined in the
 * query that returns the page. A read that fans out per row is a read that gets
 * slower exactly as the depot gets busier.
 */

/** What every paged query takes, beyond its own filters. */
export type PageQuery = {
  /** Decoded from the opaque cursor; null means the first page. */
  readonly after: CursorPosition | null;
  /** Already clamped to the maximum by the schema. */
  readonly limit: number;
};

/**
 * One page plus the position to resume from. `nextSortValue` is null exactly when
 * the source had no further rows — decided by reading `limit + 1` and discarding
 * the extra, never by a second count query.
 */
export type PageResult<TRow> = {
  readonly rows: readonly TRow[];
  readonly next: CursorPosition | null;
};

export type CustomerSummaryRow = {
  readonly id: CustomerId;
  readonly workspaceId: WorkspaceId;
  readonly displayName: string;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly version: number;
  readonly balance: Money;
  readonly classification: BalanceClassification;
  readonly lastEntryTransactionTime: IsoInstant | null;
};

export type CustomerDetailRow = {
  readonly customer: {
    readonly id: CustomerId;
    readonly workspaceId: WorkspaceId;
    readonly displayName: string;
    readonly phone: string | null;
    readonly note: string | null;
    readonly isActive: boolean;
    readonly version: number;
    readonly transactionTime: IsoInstant;
    readonly recordedAt: IsoInstant;
    readonly updatedAt: IsoInstant;
  };
  readonly balance: Money;
  readonly classification: BalanceClassification;
};

export type SaleSummaryRow = {
  readonly id: SaleId;
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly customerDisplayName: string;
  readonly status: SaleStatus;
  readonly isVoided: boolean;
  readonly totalAmount: Money;
  readonly lineCount: number;
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly postedAt: IsoInstant | null;
  readonly discardedAt: IsoInstant | null;
  readonly dueAt: IsoInstant | null;
  readonly replacesSaleId: SaleId | null;
  readonly replacedBySaleId: SaleId | null;
};

export type PaymentSummaryRow = {
  readonly id: PaymentId;
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly customerDisplayName: string;
  readonly amount: Money;
  readonly method: PaymentMethod;
  readonly status: PaymentStatus;
  readonly reversedAmount: Money;
  readonly payerName: string | null;
  readonly note: string | null;
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
};

export type AccountTimelineRow = {
  readonly id: CustomerAccountEntryId;
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly amount: Money;
  /** The balance after this entry, computed in the same query (UC-ACCOUNT-001). */
  readonly runningBalance: Money;
  readonly source: AccountEntrySource;
  readonly reversalOfEntryId: CustomerAccountEntryId | null;
  readonly reasonCode: DebtAdjustmentReasonCode | null;
  readonly reason: string | null;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly actorId: ActorId;
  readonly commandId: CommandId;
};

export type AuditTimelineRow = {
  readonly id: AuditRecordId;
  readonly workspaceId: WorkspaceId;
  readonly actorId: ActorId;
  readonly actorDisplayName: string;
  readonly commandId: CommandId;
  readonly action: AuditAction;
  readonly aggregateType: AuditAggregateType;
  readonly aggregateId: string;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly reason: string | null;
  readonly rejectionCode: DomainRejectionCode | null;
  readonly correction: AuditCorrection | null;
};

export type CustomerReadRepository = {
  /**
   * Ordered by display name then id, ascending — the order a person scans a list
   * in. `query` matches name and phone, diacritic-insensitively (UC-CUSTOMER-002).
   */
  search(args: {
    workspaceId: WorkspaceId;
    query: string;
    isActive: boolean | null;
    page: PageQuery;
  }): Promise<PageResult<CustomerSummaryRow>>;

  get(workspaceId: WorkspaceId, customerId: CustomerId): Promise<CustomerDetailRow | null>;
};

export type SaleReadRepository = {
  /**
   * The full sale, lines and void record included, **without** a row lock. The
   * write path's `findByIdForUpdate` locks; a read that locked would let a screen
   * refresh block a posting.
   */
  get(workspaceId: WorkspaceId, saleId: SaleId): Promise<SaleState | null>;
  /** Which sale, if any, replaces this one — the forward half of BR-SALE-016. */
  replacedBy(workspaceId: WorkspaceId, saleId: SaleId): Promise<SaleId | null>;
  /** Newest business time first: a depot reads today before last week. */
  list(args: {
    workspaceId: WorkspaceId;
    customerId: CustomerId | null;
    status: SaleStatus | null;
    voided: boolean | null;
    from: IsoInstant | null;
    to: IsoInstant | null;
    page: PageQuery;
  }): Promise<PageResult<SaleSummaryRow>>;
};

export type PaymentReadRepository = {
  get(workspaceId: WorkspaceId, paymentId: PaymentId): Promise<PaymentSummaryRow | null>;
  list(args: {
    workspaceId: WorkspaceId;
    customerId: CustomerId | null;
    status: PaymentStatus | null;
    from: IsoInstant | null;
    to: IsoInstant | null;
    page: PageQuery;
  }): Promise<PageResult<PaymentSummaryRow>>;
};

export type AccountReadRepository = {
  timeline(args: {
    workspaceId: WorkspaceId;
    customerId: CustomerId;
    from: IsoInstant | null;
    to: IsoInstant | null;
    page: PageQuery;
  }): Promise<PageResult<AccountTimelineRow>>;
};

export type AuditReadRepository = {
  timeline(args: {
    workspaceId: WorkspaceId;
    aggregateType: AuditAggregateType | null;
    aggregateId: string | null;
    actorId: ActorId | null;
    from: IsoInstant | null;
    to: IsoInstant | null;
    page: PageQuery;
  }): Promise<PageResult<AuditTimelineRow>>;
};

/**
 * The read side's own bundle. It is reachable from a `Repositories` too, so a
 * query runs in the same transaction as the authorization check that guards it —
 * a read authorized against a membership that was revoked mid-query would
 * otherwise be possible.
 */
export type ReadRepositories = {
  readonly customerReads: CustomerReadRepository;
  readonly saleReads: SaleReadRepository;
  readonly paymentReads: PaymentReadRepository;
  readonly accountReads: AccountReadRepository;
  readonly auditReads: AuditReadRepository;
};
