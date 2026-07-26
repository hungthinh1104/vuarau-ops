import type {
  ActorId,
  CommandId,
  CustomerId,
  CustomerAccountEntryDto,
  IdempotencyKey,
  IsoInstant,
  AccountEntrySourceType,
  SaleId,
  PaymentId,
  WorkspaceId,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import type {
  AuditDraft,
  CustomerAccountBalance,
  CustomerState,
  AccountEntryDraft,
  SaleState,
  SaleVoidState,
  PaymentReversalState,
  PaymentState,
} from "@vuarau/domain-kernel";
import type { ReadRepositories } from "./read-ports.ts";

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

export type SaleRepository = {
  /**
   * Takes a row lock for the duration of the transaction (ADR-0009), and loads
   * the void record alongside — whether a sale is voided is a fact about a
   * different table, deliberately (BR-SALE-008).
   */
  findByIdForUpdate(workspaceId: WorkspaceId, saleId: SaleId): Promise<SaleState | null>;
  insert(sale: SaleState): Promise<void>;
  /**
   * The only mutation a sale ever receives: `draft` → `posted`. Named `post`
   * rather than `update` because that is the only thing it may do — a generic
   * update is how a posted sale eventually gets edited by something that had no
   * business editing it.
   *
   * Applies only if the stored version still matches `expectedVersion` **and**
   * the row is still a draft. Returns false when it does not; the caller turns
   * that into a version conflict rather than overwriting someone else's change.
   */
  post(sale: SaleState, expectedVersion: number): Promise<boolean>;
  /**
   * Appends the void record. Note that nothing here touches the sale: the void is
   * written beside it, and the sale's financial state is derived from the pair
   * (BR-SALE-012, ADR-0012).
   *
   * Returns **false** when `UNIQUE (sale_id)` already holds a void for this sale
   * — the structural half of BR-SALE-013 firing. Reported rather than thrown so
   * the caller can answer `SALE_ALREADY_VOIDED`: a race between two people who
   * both spotted the same wrong sale is an ordinary Tuesday in a depot, and it
   * deserves a business answer rather than a 500.
   */
  insertVoid(record: SaleVoidState, actorId: ActorId, commandId: CommandId): Promise<boolean>;
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
export type CustomerAccountEntryRepository = {
  append(entries: readonly AccountEntryDraft[]): Promise<readonly CustomerAccountEntryDto[]>;
  listByCustomer(
    workspaceId: WorkspaceId,
    customerId: CustomerId,
  ): Promise<readonly CustomerAccountEntryDto[]>;
  /** Finds the entry a given sale posting, void, or payment produced. */
  findBySource(
    workspaceId: WorkspaceId,
    sourceType: AccountEntrySourceType,
    sourceId: string,
  ): Promise<CustomerAccountEntryDto | null>;
};

export type CustomerAccountBalanceRepository = {
  get(workspaceId: WorkspaceId, customerId: CustomerId): Promise<CustomerAccountBalance | null>;
  save(summary: CustomerAccountBalance): Promise<void>;
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

export type Repositories = ReadRepositories & {
  readonly workspaces: WorkspaceRepository;
  readonly actors: ActorRepository;
  readonly customers: CustomerRepository;
  readonly sales: SaleRepository;
  readonly payments: PaymentRepository;
  readonly accountEntries: CustomerAccountEntryRepository;
  readonly accountBalances: CustomerAccountBalanceRepository;
  readonly audit: AuditRepository;
  readonly receipts: CommandReceiptRepository;
};

/**
 * One transaction per command (BR-COMMAND-005). Everything a command writes —
 * aggregate, account entries, balance, audit record, receipt — commits together or
 * not at all.
 */
export type UnitOfWork = {
  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
};
