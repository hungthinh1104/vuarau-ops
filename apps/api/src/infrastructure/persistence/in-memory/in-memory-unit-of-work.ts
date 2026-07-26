import type {
  ActorId,
  AuditRecordDto,
  CustomerAccountEntryDto,
  WorkspaceId,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import type { PaymentReversalState, SaleVoidState } from "@vuarau/domain-kernel";
import type { IdGenerator } from "../../clock.ts";
import type { CommandReceipt, Repositories, UnitOfWork, WorkspaceMembership } from "../ports.ts";
import type {
  CustomerAccountBalance,
  CustomerState,
  SaleState,
  PaymentState,
} from "@vuarau/domain-kernel";

/**
 * An in-memory implementation of every port, used by the application and contract
 * test projects.
 *
 * It is a real implementation, not a mock: it enforces the same version checks and
 * the same unique constraints the database does, and it rolls back on failure.
 * Tests that assert "the repository was called with X" pass when the repository
 * does the wrong thing with X — these tests assert on stored state instead.
 */
type Store = {
  memberships: Map<string, WorkspaceMembership>;
  /** Supabase subject → local actor id (BR-AUTH-005). */
  actorsBySubject: Map<string, ActorId>;
  customers: Map<string, CustomerState>;
  sales: Map<string, SaleState>;
  payments: Map<string, PaymentState>;
  reversals: PaymentReversalState[];
  saleVoids: SaleVoidState[];
  accountEntries: CustomerAccountEntryDto[];
  balances: Map<string, CustomerAccountBalance>;
  audit: AuditRecordDto[];
  receipts: Map<string, CommandReceipt>;
};

function emptyStore(): Store {
  return {
    memberships: new Map(),
    actorsBySubject: new Map(),
    customers: new Map(),
    sales: new Map(),
    payments: new Map(),
    reversals: [],
    saleVoids: [],
    accountEntries: [],
    balances: new Map(),
    audit: [],
    receipts: new Map(),
  };
}

const key = (workspaceId: string, id: string) => `${workspaceId}:${id}`;

export class InMemoryDatabase {
  private store: Store = emptyStore();

  constructor(private readonly ids: IdGenerator) {}

  /**
   * `role` defaults to `owner` to match the migration's backfill, so a test that
   * does not care about roles behaves exactly as it did before Milestone 1.
   */
  grantMembership(
    workspaceId: WorkspaceId,
    actorId: ActorId,
    role: WorkspaceRole = "owner",
    isActive = true,
  ): void {
    this.store.memberships.set(key(workspaceId, actorId), {
      workspaceId,
      actorId,
      role,
      isActive,
    });
  }

  /** Links a verified JWT subject to a local actor. */
  registerActor(supabaseUserId: string, actorId: ActorId): void {
    this.store.actorsBySubject.set(supabaseUserId, actorId);
  }

  seedCustomer(customer: CustomerState): void {
    this.store.customers.set(key(customer.workspaceId, customer.id), customer);
  }

  seedSale(sale: SaleState): void {
    this.store.sales.set(key(sale.workspaceId, sale.id), sale);
  }

  seedPayment(payment: PaymentState): void {
    this.store.payments.set(key(payment.workspaceId, payment.id), payment);
  }

  accountEntries(): readonly CustomerAccountEntryDto[] {
    return this.store.accountEntries;
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
    const store = this.store;
    const ids = this.ids;

    return {
      workspaces: {
        // Returns inactive memberships too — the same semantics as the Drizzle
        // implementation, which this deliberately mirrors. Before Milestone 1 the
        // two disagreed about `is_active` and no application test could have
        // caught it.
        findMembership: async (workspaceId, actorId) =>
          store.memberships.get(key(workspaceId, actorId)) ?? null,
      },

      actors: {
        findBySupabaseUserId: async (supabaseUserId) => {
          const actorId = store.actorsBySubject.get(supabaseUserId);
          return actorId === undefined ? null : { actorId };
        },
      },

      customers: {
        findById: async (workspaceId, customerId) =>
          store.customers.get(key(workspaceId, customerId)) ?? null,
        insert: async (customer) => {
          store.customers.set(key(customer.workspaceId, customer.id), customer);
        },
      },

      sales: {
        findByIdForUpdate: async (workspaceId, saleId) =>
          store.sales.get(key(workspaceId, saleId)) ?? null,
        insert: async (sale) => {
          store.sales.set(key(sale.workspaceId, sale.id), sale);
        },
        // Conditional on the version *and* on the row still being a draft — the
        // same two conditions the Drizzle UPDATE carries, so an application test
        // cannot pass against semantics the database would refuse.
        post: async (sale, expectedVersion) => {
          const current = store.sales.get(key(sale.workspaceId, sale.id));
          if (
            current === undefined ||
            current.version !== expectedVersion ||
            current.status !== "draft"
          ) {
            return false;
          }
          store.sales.set(key(sale.workspaceId, sale.id), sale);
          return true;
        },
        insertVoid: async (record) => {
          // Mirrors UNIQUE (sale_id) in Postgres (BR-SALE-013). Without this the
          // in-memory adapter would accept a double void that the real database
          // refuses, and the concurrency test would prove nothing.
          if (store.saleVoids.some((existing) => existing.saleId === record.saleId)) {
            return false;
          }
          store.saleVoids.push(record);
          const sale = store.sales.get(key(record.workspaceId, record.saleId));
          if (sale !== undefined) {
            // The sale row itself is untouched; only the void it now has is
            // recorded, mirroring the join the Drizzle repository performs.
            store.sales.set(key(record.workspaceId, record.saleId), {
              ...sale,
              voidRecord: record,
            });
          }
          return true;
        },
      },

      payments: {
        findByIdForUpdate: async (workspaceId, paymentId) =>
          store.payments.get(key(workspaceId, paymentId)) ?? null,
        insert: async (payment) => {
          store.payments.set(key(payment.workspaceId, payment.id), payment);
        },
        update: async (payment, expectedVersion) => {
          const current = store.payments.get(key(payment.workspaceId, payment.id));
          if (current === undefined || current.version !== expectedVersion) {
            return false;
          }
          store.payments.set(key(payment.workspaceId, payment.id), payment);
          return true;
        },
        insertReversal: async (reversal) => {
          store.reversals.push(reversal);
        },
      },

      accountEntries: {
        append: async (drafts) => {
          const appended: CustomerAccountEntryDto[] = [];
          for (const draft of drafts) {
            // Mirrors UNIQUE (source_type, source_id) in Postgres: a second entry
            // for the same posting, void, or payment is unrepresentable, not merely
            // unlikely (docs/07-data/ledger-model.md).
            const duplicate = store.accountEntries.some(
              (entry) =>
                entry.workspaceId === draft.workspaceId &&
                entry.sourceType === draft.sourceType &&
                entry.sourceId === draft.sourceId,
            );
            if (duplicate) {
              throw new Error(
                `Duplicate account entry for ${draft.sourceType}:${draft.sourceId} — ` +
                  "unique (source_type, source_id) violated.",
              );
            }
            const entry: CustomerAccountEntryDto = {
              ...draft,
              id: ids.newId() as CustomerAccountEntryDto["id"],
            };
            store.accountEntries.push(entry);
            appended.push(entry);
          }
          return appended;
        },
        listByCustomer: async (workspaceId, customerId) =>
          store.accountEntries.filter(
            (entry) => entry.workspaceId === workspaceId && entry.customerId === customerId,
          ),
        findBySource: async (workspaceId, sourceType, sourceId) =>
          store.accountEntries.find(
            (entry) =>
              entry.workspaceId === workspaceId &&
              entry.sourceType === sourceType &&
              entry.sourceId === sourceId,
          ) ?? null,
      },

      accountBalances: {
        get: async (workspaceId, customerId) =>
          store.balances.get(key(workspaceId, customerId)) ?? null,
        save: async (summary) => {
          store.balances.set(key(summary.workspaceId, summary.customerId), summary);
        },
      },

      audit: {
        append: async (record) => {
          store.audit.push({
            id: ids.newId() as AuditRecordDto["id"],
            workspaceId: record.workspaceId,
            commandId: record.commandId,
            actorId: record.actorId,
            aggregateType: record.aggregateType,
            aggregateId: record.aggregateId,
            action: record.action,
            transactionTime: record.transactionTime,
            recordedAt: record.recordedAt,
            before: record.before,
            after: record.after,
            reason: record.reason,
            rejectionCode: null,
          });
        },
      },

      receipts: {
        find: async (workspaceId, idempotencyKey) =>
          store.receipts.get(key(workspaceId, idempotencyKey)) ?? null,
        findByCommandId: async (workspaceId, commandId) =>
          [...store.receipts.values()].find(
            (receipt) => receipt.workspaceId === workspaceId && receipt.commandId === commandId,
          ) ?? null,
        claim: async (receipt) => {
          const receiptKey = key(receipt.workspaceId, receipt.idempotencyKey);
          if (store.receipts.has(receiptKey)) {
            return false;
          }
          store.receipts.set(receiptKey, receipt);
          return true;
        },
        complete: async (workspaceId, idempotencyKey, result) => {
          const receiptKey = key(workspaceId, idempotencyKey);
          const existing = store.receipts.get(receiptKey);
          if (existing !== undefined) {
            store.receipts.set(receiptKey, { ...existing, status: "completed", result });
          }
        },
      },
    };
  }
}

/** Deterministic ids so a failing test fails the same way every run. */
export function sequentialIdGenerator(prefix = "9"): IdGenerator {
  let counter = 0;
  return {
    newId: () => {
      counter += 1;
      const suffix = `${prefix}${String(counter).padStart(2, "0")}`.padStart(12, "0");
      return `00000000-0000-4000-8000-${suffix}`;
    },
  };
}
