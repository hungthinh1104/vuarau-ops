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
  ProductId,
  SupplierId,
  SupplierPaymentId,
  SupplierAccountEntryDto,
  WorkspaceId,
  WorkspaceRole,
  WorkspaceBackupV2,
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
  ProductState,
  SupplierState,
  SupplierPaymentState,
  PurchaseState,
  PurchaseVoidState,
  PurchaseReceiptState,
  PurchaseReceiptReversalState,
  InventoryMovementState,
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

export type WorkspaceMember = WorkspaceMembership & {
  readonly displayName: string;
  readonly createdAt: IsoInstant;
};

export type WorkspaceRepository = {
  /** Presentation name for an already workspace-scoped read model. */
  findName(workspaceId: WorkspaceId): Promise<string | null>;
  /**
   * Returns the membership including an **inactive** one, so the caller can tell
   * "never had access" from "access was revoked" and answer with the right code.
   * A repository that filtered inactive rows away would collapse the two.
   */
  findMembership(workspaceId: WorkspaceId, actorId: ActorId): Promise<WorkspaceMembership | null>;
  /**
   * Counts active owners **under a lock**, so two owners revoking each other at
   * the same moment cannot both see a count of two (BR-AUTH-007). A version on
   * the membership row would not have caught that; this is the race that matters.
   */
  countActiveOwnersForUpdate(workspaceId: WorkspaceId): Promise<number>;
  /** Sets `is_active = false`. Never deletes the row (UC-AUTH-002). */
  revokeMembership(workspaceId: WorkspaceId, actorId: ActorId): Promise<boolean>;
  listMembers(workspaceId: WorkspaceId): Promise<readonly WorkspaceMember[]>;
  addMembership(workspaceId: WorkspaceId, actorId: ActorId, role: WorkspaceRole): Promise<boolean>;
  changeMembershipRole(
    workspaceId: WorkspaceId,
    actorId: ActorId,
    expectedRole: WorkspaceRole,
    role: WorkspaceRole,
  ): Promise<boolean>;
  reactivateMembership(workspaceId: WorkspaceId, actorId: ActorId): Promise<boolean>;
};

/** One row of "which depots may this person act in", for the workspace picker. */
export type ActorWorkspace = {
  readonly workspaceId: WorkspaceId;
  readonly workspaceName: string;
  readonly role: WorkspaceRole;
};

/**
 * Identity resolution — the one repository that is **not** workspace-scoped, and
 * the only justified exception to the rule above. Both methods run *before* any
 * workspace is known, which is precisely why they cannot take one: a verified JWT
 * names a subject, this turns that subject into a local actor (BR-AUTH-005), and
 * then into the set of depots that actor may enter (BR-AUTH-008).
 *
 * The exception is safe for one reason, and it is worth stating rather than
 * assuming: **neither method takes anything a caller supplies.** The subject comes
 * from a verified token and the actor id from the subject. There is no argument
 * here that a request can influence, so there is nothing to scope.
 */
export type ActorRepository = {
  findBySupabaseUserId(supabaseUserId: string): Promise<{ actorId: ActorId } | null>;
  findById(actorId: ActorId): Promise<{ actorId: ActorId; displayName: string } | null>;
  /**
   * **Active memberships only.** Unlike `findMembership`, a revoked row must not
   * appear: the caller of that method is answering "why were you refused", and
   * the caller of this one is drawing a list of doors. A revoked depot in a picker
   * is a door that opens onto a refusal.
   */
  listActiveWorkspaces(actorId: ActorId): Promise<readonly ActorWorkspace[]>;
};

export type CustomerRepository = {
  findById(workspaceId: WorkspaceId, customerId: CustomerId): Promise<CustomerState | null>;
  /** Takes a row lock, for the commands that change one (ADR-0009). */
  findByIdForUpdate(
    workspaceId: WorkspaceId,
    customerId: CustomerId,
  ): Promise<CustomerState | null>;
  insert(customer: CustomerState): Promise<void>;
  /**
   * Applies only if the stored version still matches. Covers both
   * `UpdateCustomer` and `DeactivateCustomer`: the columns they touch are
   * disjoint, and the domain decides which — the repository writes what it is
   * given (BR-CUSTOMER-004).
   *
   * There is deliberately no `delete`. A customer's history and their account
   * entries are never removed.
   */
  update(customer: CustomerState, expectedVersion: number): Promise<boolean>;
};

export type ProductRepository = {
  findById(workspaceId: WorkspaceId, productId: ProductId): Promise<ProductState | null>;
  findByIdForUpdate(workspaceId: WorkspaceId, productId: ProductId): Promise<ProductState | null>;
  insert(product: ProductState): Promise<void>;
  update(product: ProductState, expectedVersion: number): Promise<boolean>;
};

export type SupplierRepository = {
  findById(workspaceId: WorkspaceId, supplierId: SupplierId): Promise<SupplierState | null>;
  findByIdForUpdate(
    workspaceId: WorkspaceId,
    supplierId: SupplierId,
  ): Promise<SupplierState | null>;
  insert(supplier: SupplierState): Promise<void>;
  update(supplier: SupplierState, expectedVersion: number): Promise<boolean>;
};

export type SupplierPaymentRepository = {
  findByIdForUpdate(
    workspaceId: WorkspaceId,
    supplierPaymentId: SupplierPaymentId,
  ): Promise<SupplierPaymentState | null>;
  insert(payment: SupplierPaymentState): Promise<void>;
  update(payment: SupplierPaymentState, expectedVersion: number): Promise<boolean>;
  insertReversal(reversal: {
    id: string;
    workspaceId: WorkspaceId;
    supplierPaymentId: SupplierPaymentId;
    amount: SupplierPaymentState["amount"];
    reason: string;
    transactionTime: IsoInstant;
    recordedAt: IsoInstant;
  }): Promise<void>;
};

export type SupplierAccountEntryDraft = Omit<SupplierAccountEntryDto, "id">;
export type SupplierAccountEntryRepository = {
  append(
    entries: readonly SupplierAccountEntryDraft[],
  ): Promise<readonly SupplierAccountEntryDto[]>;
  listBySupplier(
    workspaceId: WorkspaceId,
    supplierId: SupplierId,
  ): Promise<readonly SupplierAccountEntryDto[]>;
  findBySource(
    workspaceId: WorkspaceId,
    sourceType: SupplierAccountEntryDto["sourceType"],
    sourceId: string,
  ): Promise<SupplierAccountEntryDto | null>;
};

export type SupplierAccountBalanceState = {
  readonly workspaceId: WorkspaceId;
  readonly supplierId: SupplierId;
  readonly balance: SupplierPaymentState["amount"];
  readonly entryCount: number;
  readonly lastEntryTransactionTime: IsoInstant | null;
  readonly updatedAt: IsoInstant;
};
export type SupplierAccountBalanceRepository = {
  get(
    workspaceId: WorkspaceId,
    supplierId: SupplierId,
  ): Promise<SupplierAccountBalanceState | null>;
  save(balance: SupplierAccountBalanceState): Promise<void>;
};

export type PurchaseRepository = {
  findById(workspaceId: WorkspaceId, purchaseId: string): Promise<PurchaseState | null>;
  findReplacementOf(workspaceId: WorkspaceId, purchaseId: string): Promise<PurchaseState | null>;
  findByIdForUpdate(workspaceId: WorkspaceId, purchaseId: string): Promise<PurchaseState | null>;
  insert(purchase: PurchaseState): Promise<void>;
  updateDraft(
    purchase: PurchaseState,
    expectedVersion: number,
    replaceLines: boolean,
  ): Promise<boolean>;
  confirm(purchase: PurchaseState, expectedVersion: number): Promise<boolean>;
  insertVoid(record: PurchaseVoidState): Promise<boolean>;
};
export type ReceiptRepository = {
  findById(workspaceId: WorkspaceId, receiptId: string): Promise<PurchaseReceiptState | null>;
  insert(receipt: PurchaseReceiptState): Promise<void>;
  insertReversal(reversal: PurchaseReceiptReversalState): Promise<boolean>;
  netReceivedByPurchaseLine(
    workspaceId: WorkspaceId,
    purchaseId: string,
  ): Promise<ReadonlyMap<string, number>>;
};
export type InventoryMovementRepository = {
  append(
    movements: readonly Omit<InventoryMovementState, "id">[],
  ): Promise<readonly InventoryMovementState[]>;
  listByProduct(
    workspaceId: WorkspaceId,
    productId: ProductId,
    unit: InventoryMovementState["quantity"]["unit"] | null,
  ): Promise<readonly InventoryMovementState[]>;
};
export type InventoryBalanceState = {
  workspaceId: WorkspaceId;
  productId: ProductId;
  unit: InventoryMovementState["quantity"]["unit"];
  quantityScaled: number;
  movementCount: number;
  lastMovementTransactionTime: IsoInstant | null;
  updatedAt: IsoInstant;
};
export type InventoryBalanceRepository = {
  get(
    workspaceId: WorkspaceId,
    productId: ProductId,
    unit: InventoryBalanceState["unit"],
  ): Promise<InventoryBalanceState | null>;
  save(balance: InventoryBalanceState): Promise<void>;
};

export type OperationsRepository = {
  restoreBackup(
    workspaceId: WorkspaceId,
    payload: WorkspaceBackupV2["payload"],
  ): Promise<
    | { readonly kind: "restored"; readonly counts: Readonly<Record<string, number>> }
    | {
        readonly kind: "unsafe_target" | "integrity_error";
        readonly reason: string;
      }
  >;
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
   * Edits or discards a **draft**, version-conditionally and status-conditionally.
   * A posted sale cannot be reached through it whatever version is supplied
   * (BR-SALE-008), which is the same belt-and-braces `post` carries.
   *
   * `replaceLines` is false for a discard: discarding keeps the lines, because
   * the draft row stays and "what they had entered" is part of what stays.
   */
  updateDraft(
    sale: SaleState,
    expectedVersion: number,
    options: { replaceLines: boolean },
  ): Promise<boolean>;
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
  readonly products: ProductRepository;
  readonly suppliers: SupplierRepository;
  readonly supplierPayments: SupplierPaymentRepository;
  readonly supplierAccountEntries: SupplierAccountEntryRepository;
  readonly supplierAccountBalances: SupplierAccountBalanceRepository;
  readonly purchases: PurchaseRepository;
  readonly purchaseReceipts: ReceiptRepository;
  readonly inventoryMovements: InventoryMovementRepository;
  readonly inventoryBalances: InventoryBalanceRepository;
  readonly operations: OperationsRepository;
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
