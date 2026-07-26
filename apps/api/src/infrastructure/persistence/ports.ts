import type {
  ActorId,
  CommandId,
  CustomerId,
  DebtLedgerEntryDto,
  IdempotencyKey,
  IsoInstant,
  LedgerSourceType,
  OrderId,
  PaymentId,
  WorkspaceId,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import type {
  AuditDraft,
  CustomerDebtSummary,
  CustomerState,
  LedgerEntryDraft,
  OrderState,
  PaymentReversalState,
  PaymentState,
} from "@vuarau/domain-kernel";

/**
 * Ports are declared by the application layer, which is the layer that needs
 * them. `packages/db` implements the queries behind them and knows nothing about
 * this file — that is what keeps the dependency arrow pointing inwards
 * (docs/01-domain/context-map.md).
 *
 * Every method takes `workspaceId` as a required argument. Not an optional
 * filter, not a property on a context object that a future query could forget:
 * a required parameter, so that omitting it does not compile (BR-CUSTOMER-002).
 */

export type WorkspaceMembership = {
  readonly workspaceId: WorkspaceId;
  readonly actorId: ActorId;
  /** Drives the permission check in the command pipeline (BR-AUTH-004). */
  readonly role: WorkspaceRole;
  /** Revokes access without deleting who was once a member (BR-AUTH-003). */
  readonly isActive: boolean;
};

export type WorkspaceRepository = {
  /**
   * Returns the membership including an **inactive** one, so the caller can tell
   * "never had access" from "access was revoked" and answer with the right code.
   * A repository that filtered inactive rows away would collapse the two.
   */
  findMembership(workspaceId: WorkspaceId, actorId: ActorId): Promise<WorkspaceMembership | null>;
};

/**
 * Identity resolution — the one repository that is **not** workspace-scoped, and
 * the only justified exception to the rule above. It runs before any workspace is
 * known: a verified JWT names a subject, and this turns that subject into the
 * local actor whose memberships are then checked (BR-AUTH-005).
 */
export type ActorRepository = {
  findBySupabaseUserId(supabaseUserId: string): Promise<{ actorId: ActorId } | null>;
};

export type CustomerRepository = {
  findById(workspaceId: WorkspaceId, customerId: CustomerId): Promise<CustomerState | null>;
  insert(customer: CustomerState): Promise<void>;
};

export type OrderRepository = {
  /** Takes a row lock for the duration of the transaction (ADR-0009). */
  findByIdForUpdate(workspaceId: WorkspaceId, orderId: OrderId): Promise<OrderState | null>;
  insert(order: OrderState): Promise<void>;
  /**
   * Updates only if the stored version still matches `expectedVersion`.
   * Returns false when it does not — the caller turns that into a version
   * conflict rather than overwriting someone else's change.
   */
  update(order: OrderState, expectedVersion: number): Promise<boolean>;
};

export type PaymentRepository = {
  findByIdForUpdate(workspaceId: WorkspaceId, paymentId: PaymentId): Promise<PaymentState | null>;
  insert(payment: PaymentState): Promise<void>;
  update(payment: PaymentState, expectedVersion: number): Promise<boolean>;
  insertReversal(reversal: PaymentReversalState): Promise<void>;
};

/**
 * Note the absence of `update` and `delete`. The ledger is append-only
 * (BR-ACCOUNT-005) and the port is shaped so that violating it is not expressible.
 */
export type DebtLedgerRepository = {
  append(entries: readonly LedgerEntryDraft[]): Promise<readonly DebtLedgerEntryDto[]>;
  listByCustomer(
    workspaceId: WorkspaceId,
    customerId: CustomerId,
  ): Promise<readonly DebtLedgerEntryDto[]>;
  /** Finds the entry a given order confirmation or payment produced. */
  findBySource(
    workspaceId: WorkspaceId,
    sourceType: LedgerSourceType,
    sourceId: string,
  ): Promise<DebtLedgerEntryDto | null>;
};

export type DebtSummaryRepository = {
  get(workspaceId: WorkspaceId, customerId: CustomerId): Promise<CustomerDebtSummary | null>;
  save(summary: CustomerDebtSummary): Promise<void>;
};

export type AuditRepository = {
  append(
    record: AuditDraft & { workspaceId: WorkspaceId; actorId: ActorId; commandId: CommandId },
  ): Promise<void>;
};

export type CommandReceiptStatus = "in_progress" | "completed";

export type CommandReceipt = {
  readonly commandId: CommandId;
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: IdempotencyKey;
  readonly commandType: string;
  readonly payloadHash: string;
  readonly status: CommandReceiptStatus;
  /** The original successful result, replayed verbatim to a retry (ADR-0008). */
  readonly result: unknown;
  readonly recordedAt: IsoInstant;
};

export type CommandReceiptRepository = {
  find(workspaceId: WorkspaceId, idempotencyKey: IdempotencyKey): Promise<CommandReceipt | null>;
  /** Detects a `commandId` reused under a different key — `DUPLICATE_COMMAND`. */
  findByCommandId(workspaceId: WorkspaceId, commandId: CommandId): Promise<CommandReceipt | null>;
  /**
   * Claims the key. Returns false if another transaction claimed it first — the
   * unique index, not the preceding read, is what makes idempotency safe under
   * concurrency.
   */
  claim(receipt: CommandReceipt): Promise<boolean>;
  complete(
    workspaceId: WorkspaceId,
    idempotencyKey: IdempotencyKey,
    result: unknown,
  ): Promise<void>;
};

export type Repositories = {
  readonly workspaces: WorkspaceRepository;
  readonly actors: ActorRepository;
  readonly customers: CustomerRepository;
  readonly orders: OrderRepository;
  readonly payments: PaymentRepository;
  readonly ledger: DebtLedgerRepository;
  readonly debtSummaries: DebtSummaryRepository;
  readonly audit: AuditRepository;
  readonly receipts: CommandReceiptRepository;
};

/**
 * One transaction per command (BR-COMMAND-005). Everything a command writes —
 * aggregate, ledger entries, summary, audit record, receipt — commits together or
 * not at all.
 */
export type UnitOfWork = {
  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
};
