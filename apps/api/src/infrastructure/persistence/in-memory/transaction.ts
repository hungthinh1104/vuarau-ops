import type {
  ActorId,
  AuditRecordDto,
  SaleId,
  CustomerAccountEntryDto,
  IsoInstant,
  WorkspaceId,
  WorkspaceRole,
  DocumentDto,
  WorkspaceOperationalProfileDto,
  CashMovementDto,
  CashAccountId,
  CashBalanceDto,
} from "@vuarau/domain-contracts";
import {
  defaultWorkspaceOperationalProfile,
  normalizeWorkspaceRoles,
  primaryWorkspaceRole,
} from "@vuarau/domain-contracts";
import type { PaymentReversalState, SaleVoidState } from "@vuarau/domain-kernel";
import type { IdGenerator } from "../../clock.ts";
import type { Repositories, UnitOfWork } from "../ports.ts";
import type {
  CustomerAccountBalance,
  CustomerState,
  SaleState,
  PaymentState,
  ProductState,
  QualityGradeState,
  SupplierState,
  InventoryMovementState,
  DeliveryState,
} from "@vuarau/domain-kernel";
import type { Store } from "./store.ts";
import { emptyStore, key } from "./store.ts";
import { createInMemoryRepositories } from "./composition.ts";

export class InMemoryDatabase {
  private store: Store = emptyStore();

  /** An explicit field: Node strips types, and a parameter property emits code. */
  private readonly ids: IdGenerator;

  constructor(ids: IdGenerator) {
    this.ids = ids;
  }

  /**
   * `role` defaults to `owner` to match the migration's backfill, so a test that
   * does not care about roles behaves exactly as it did before Milestone 1.
   */
  grantMembership(
    workspaceId: WorkspaceId,
    actorId: ActorId,
    roleOrRoles: WorkspaceRole | readonly WorkspaceRole[] = "owner",
    isActive = true,
  ): void {
    const roles = normalizeWorkspaceRoles(
      Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles as WorkspaceRole],
    );
    this.store.memberships.set(key(workspaceId, actorId), {
      workspaceId,
      actorId,
      role: primaryWorkspaceRole(roles),
      roles,
      isActive,
      createdAt: "2026-01-01T00:00:00.000Z" as IsoInstant,
    });
  }

  /**
   * Names a workspace, so it can appear in a picker.
   *
   * Mirrors the inner join in the SQL: a membership whose workspace was never
   * named is invisible to `listActiveWorkspaces`, exactly as a membership with no
   * `workspaces` row would be.
   */
  registerWorkspace(workspaceId: WorkspaceId, name: string): void {
    this.store.workspaceNames.set(workspaceId, name);
    if (!this.store.operationalProfiles.has(workspaceId)) {
      this.store.operationalProfiles.set(
        workspaceId,
        defaultWorkspaceOperationalProfile(workspaceId),
      );
    }
  }

  setOperationalProfile(profile: WorkspaceOperationalProfileDto): void {
    this.store.operationalProfiles.set(profile.workspaceId, { ...profile });
  }

  /** Links a verified JWT subject to a local actor. */
  registerActor(supabaseUserId: string, actorId: ActorId, displayName = "Test actor"): void {
    this.store.actorsBySubject.set(supabaseUserId, actorId);
    this.store.actorNames.set(actorId, displayName);
  }

  seedCustomer(customer: CustomerState): void {
    this.store.customers.set(key(customer.workspaceId, customer.id), customer);
  }

  seedProduct(product: ProductState): void {
    this.store.products.set(key(product.workspaceId, product.id), product);
  }

  seedQualityGrade(grade: QualityGradeState): void {
    this.store.qualityGrades.set(key(grade.workspaceId, grade.id), grade);
  }

  seedSupplier(supplier: SupplierState): void {
    this.store.suppliers.set(key(supplier.workspaceId, supplier.id), supplier);
  }

  seedSale(sale: SaleState): void {
    this.store.sales.set(key(sale.workspaceId, sale.id), sale);
  }

  seedPayment(payment: PaymentState): void {
    this.store.payments.set(key(payment.workspaceId, payment.id), payment);
  }

  /** Test-only corruption hook: reconciliation must make damaged rows visible. */
  seedAccountEntry(entry: CustomerAccountEntryDto): void {
    this.store.accountEntries.push(entry);
  }

  /** Test-only corruption hook for a ledger reference whose source vanished. */
  removeSale(workspaceId: WorkspaceId, saleId: SaleId): void {
    this.store.sales.delete(key(workspaceId, saleId));
  }

  accountEntries(): readonly CustomerAccountEntryDto[] {
    return this.store.accountEntries;
  }

  supplierAccountEntries() {
    return this.store.supplierAccountEntries;
  }

  entriesFor(workspaceId: WorkspaceId, customerId: string): readonly CustomerAccountEntryDto[] {
    return this.store.accountEntries.filter(
      (entry) => entry.workspaceId === workspaceId && entry.customerId === customerId,
    );
  }

  saleVoids(): readonly SaleVoidState[] {
    return this.store.saleVoids;
  }

  auditRecords(): readonly AuditRecordDto[] {
    return this.store.audit;
  }

  reversals(): readonly PaymentReversalState[] {
    return this.store.reversals;
  }

  payments(): readonly PaymentState[] {
    return [...this.store.payments.values()];
  }

  inventoryMovementRecords(): readonly InventoryMovementState[] {
    return this.store.inventoryMovements;
  }

  cashMovementRecords(): readonly CashMovementDto[] {
    return this.store.cashMovements;
  }

  cashBalanceFor(workspaceId: WorkspaceId, cashAccountId: CashAccountId): CashBalanceDto | null {
    return this.store.cashBalances.get(key(workspaceId, cashAccountId)) ?? null;
  }

  deliveryRecords(): readonly DeliveryState[] {
    return [...this.store.deliveries.values()];
  }

  corruptDocumentSnapshot(
    workspaceId: WorkspaceId,
    documentId: DocumentDto["id"],
    snapshot: Record<string, unknown>,
  ): void {
    const documentKey = key(workspaceId, documentId);
    const current = this.store.documents.get(documentKey);
    if (current !== undefined) this.store.documents.set(documentKey, { ...current, snapshot });
  }

  balanceFor(workspaceId: WorkspaceId, customerId: string): CustomerAccountBalance | null {
    return this.store.balances.get(key(workspaceId, customerId)) ?? null;
  }

  /** Lets a test corrupt a projection, to prove the rebuild repairs it (CASE-ACCOUNT-007). */
  overwriteBalance(balance: CustomerAccountBalance): void {
    this.store.balances.set(key(balance.workspaceId, balance.customerId), balance);
  }

  unitOfWork(): UnitOfWork {
    return {
      transaction: async <T>(work: (repos: Repositories) => Promise<T>): Promise<T> => {
        // Snapshot-and-restore stands in for a database transaction. A command
        // that throws must leave nothing behind (BR-COMMAND-005), and a test that
        // cannot observe a rollback cannot prove that.
        //
        // It models atomicity, **not isolation**: two overlapping transactions
        // here can wipe each other's writes, which no database does. Concurrency
        // claims — the void race in BR-SALE-013, the idempotency claim in
        // ADR-0008 — belong in the db test project, against real Postgres.
        const snapshot = structuredClone(this.store);
        try {
          return await work(this.repositories());
        } catch (error) {
          this.store = snapshot;
          throw error;
        }
      },
    };
  }

  private repositories(): Repositories {
    return createInMemoryRepositories(this.store, this.ids);
  }
}
