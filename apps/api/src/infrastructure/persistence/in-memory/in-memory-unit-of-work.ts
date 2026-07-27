import type {
  ActorId,
  AuditRecordDto,
  SaleId,
  CustomerAccountEntryDto,
  WorkspaceId,
  WorkspaceRole,
  Money,
} from "@vuarau/domain-contracts";
import type { PaymentReversalState, SaleVoidState } from "@vuarau/domain-kernel";
import { classifyBalance, money, zeroMoney } from "@vuarau/domain-kernel";
import { DEFAULT_CURRENCY } from "@vuarau/domain-contracts";
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
  /** Workspace id → display name, which is all a picker needs (BR-AUTH-008). */
  workspaceNames: Map<string, string>;
  /** Supabase subject → local actor id (BR-AUTH-005). */
  actorsBySubject: Map<string, ActorId>;
  /** Actor display names, for the audit timeline's `actorDisplayName`. */
  actorNames: Map<string, string>;
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
    workspaceNames: new Map(),
    actorsBySubject: new Map(),
    actorNames: new Map(),
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

/**
 * The read-side helpers. They mirror what the SQL does rather than what is
 * convenient in JavaScript: the same keyset comparison, the same deterministic
 * `(sortValue, id)` order, the same "read one extra row to learn whether there is
 * another page". A page-boundary bug that only one of the two exhibits is a bug
 * no test would catch.
 */
const ascendingBy =
  <T>(sortValue: (row: T) => string, id: (row: T) => string) =>
  (a: T, b: T): number =>
    sortValue(a) === sortValue(b)
      ? id(a).localeCompare(id(b))
      : sortValue(a).localeCompare(sortValue(b));

const descendingBy =
  <T>(sortValue: (row: T) => string, id: (row: T) => string) =>
  (a: T, b: T): number =>
    -ascendingBy(sortValue, id)(a, b);

/** `(sort, id) > (cursorSort, cursorId)` — the ascending keyset predicate. */
const after = (row: [string, string], cursor: [string, string]): boolean =>
  row[0] === cursor[0] ? row[1] > cursor[1] : row[0] > cursor[0];

/** `(sort, id) < (cursorSort, cursorId)` — the descending one. */
const before = (row: [string, string], cursor: [string, string]): boolean =>
  row[0] === cursor[0] ? row[1] < cursor[1] : row[0] < cursor[0];

function takePage<TRow>(
  rows: readonly TRow[],
  page: { limit: number },
  cursorOf: (row: TRow) => { sortValue: string; id: string },
): { rows: readonly TRow[]; next: { sortValue: string; id: string } | null } {
  if (rows.length <= page.limit) {
    return { rows, next: null };
  }
  const visible = rows.slice(0, page.limit);
  return { rows: visible, next: cursorOf(visible[visible.length - 1]!) };
}

/** Matches `vuarau_fold` in migration 0005, so search behaves the same in both. */
const FOLD_FROM =
  "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ" +
  "àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵýỷỹ";
const FOLD_TO =
  "AAAAEEEIIOOOOUUADIUOUAAAAAAAAAAAAEEEEEEEEIIOOOOOOOOOOOOUUUUUUUYYYYY" +
  "aaaaeeeiioooouuadiuouaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyyy";

export function fold(text: string): string {
  let folded = "";
  for (const character of text) {
    const index = FOLD_FROM.indexOf(character);
    folded += index === -1 ? character : FOLD_TO[index];
  }
  return folded.toLowerCase();
}

function toPaymentSummaryRow(store: Store, payment: PaymentState) {
  return {
    id: payment.id,
    workspaceId: payment.workspaceId,
    customerId: payment.customerId,
    customerDisplayName:
      store.customers.get(key(payment.workspaceId, payment.customerId))?.displayName ?? "",
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    reversedAmount: payment.reversedAmount,
    payerName: payment.payerName,
    note: payment.note,
    version: payment.version,
    transactionTime: payment.transactionTime,
    recordedAt: payment.recordedAt,
  };
}

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

  /**
   * Names a workspace, so it can appear in a picker.
   *
   * Mirrors the inner join in the SQL: a membership whose workspace was never
   * named is invisible to `listActiveWorkspaces`, exactly as a membership with no
   * `workspaces` row would be.
   */
  registerWorkspace(workspaceId: WorkspaceId, name: string): void {
    this.store.workspaceNames.set(workspaceId, name);
  }

  /** Links a verified JWT subject to a local actor. */
  registerActor(supabaseUserId: string, actorId: ActorId, displayName = "Test actor"): void {
    this.store.actorsBySubject.set(supabaseUserId, actorId);
    this.store.actorNames.set(actorId, displayName);
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
        findName: async (workspaceId) => store.workspaceNames.get(workspaceId) ?? null,
        // Returns inactive memberships too — the same semantics as the Drizzle
        // implementation, which this deliberately mirrors. Before Milestone 1 the
        // two disagreed about `is_active` and no application test could have
        // caught it.
        findMembership: async (workspaceId, actorId) =>
          store.memberships.get(key(workspaceId, actorId)) ?? null,

        countActiveOwnersForUpdate: async (workspaceId) =>
          [...store.memberships.values()].filter(
            (membership) =>
              membership.workspaceId === workspaceId &&
              membership.role === "owner" &&
              membership.isActive,
          ).length,

        revokeMembership: async (workspaceId, actorId) => {
          const membership = store.memberships.get(key(workspaceId, actorId));
          if (membership === undefined || !membership.isActive) {
            return false;
          }
          store.memberships.set(key(workspaceId, actorId), { ...membership, isActive: false });
          return true;
        },
      },

      actors: {
        findBySupabaseUserId: async (supabaseUserId) => {
          const actorId = store.actorsBySubject.get(supabaseUserId);
          return actorId === undefined ? null : { actorId };
        },

        listActiveWorkspaces: async (actorId) =>
          [...store.memberships.values()]
            .filter((membership) => membership.actorId === actorId && membership.isActive)
            .flatMap((membership) => {
              const workspaceName = store.workspaceNames.get(membership.workspaceId);
              // Inner join, as in the SQL: an unnamed workspace is not a door.
              return workspaceName === undefined
                ? []
                : [
                    {
                      workspaceId: membership.workspaceId,
                      workspaceName,
                      role: membership.role,
                    },
                  ];
            })
            .sort((a, b) =>
              a.workspaceName === b.workspaceName
                ? a.workspaceId.localeCompare(b.workspaceId)
                : a.workspaceName.localeCompare(b.workspaceName),
            ),
      },

      customers: {
        findById: async (workspaceId, customerId) =>
          store.customers.get(key(workspaceId, customerId)) ?? null,
        findByIdForUpdate: async (workspaceId, customerId) =>
          store.customers.get(key(workspaceId, customerId)) ?? null,
        insert: async (customer) => {
          store.customers.set(key(customer.workspaceId, customer.id), customer);
        },
        update: async (customer, expectedVersion) => {
          const current = store.customers.get(key(customer.workspaceId, customer.id));
          if (current === undefined || current.version !== expectedVersion) {
            return false;
          }
          store.customers.set(key(customer.workspaceId, customer.id), customer);
          return true;
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
        // The same two conditions the Drizzle UPDATE carries — version *and*
        // still-a-draft — so an application test cannot pass against semantics
        // the database would refuse.
        updateDraft: async (sale, expectedVersion) => {
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

      // --- reads ----------------------------------------------------------
      // Deliberately the same shape the SQL produces, including the keyset
      // paging: a page boundary bug that only the database exhibits would never
      // be caught by an application test, so the two agree by construction.
      customerReads: {
        search: async ({ workspaceId, query, isActive, page }) => {
          const needle = fold(query);
          const matched = [...store.customers.values()]
            .filter((customer) => customer.workspaceId === workspaceId)
            .filter((customer) => isActive === null || customer.isActive === isActive)
            .filter(
              (customer) =>
                needle.length === 0 ||
                fold(customer.displayName).includes(needle) ||
                (customer.phone ?? "").includes(query),
            )
            .sort(
              ascendingBy(
                (customer) => customer.displayName,
                (customer) => customer.id,
              ),
            )
            .filter((customer) =>
              page.after === null
                ? true
                : after([customer.displayName, customer.id], [page.after.sortValue, page.after.id]),
            )
            .map((customer) => {
              const stored = store.balances.get(key(workspaceId, customer.id));
              const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
              return {
                id: customer.id,
                workspaceId: customer.workspaceId,
                displayName: customer.displayName,
                phone: customer.phone,
                isActive: customer.isActive,
                version: customer.version,
                balance,
                classification: classifyBalance(balance),
                lastEntryTransactionTime: stored?.lastEntryTransactionTime ?? null,
              };
            });

          return takePage(matched, page, (row) => ({
            sortValue: row.displayName,
            id: row.id,
          }));
        },

        get: async (workspaceId, customerId) => {
          const customer = store.customers.get(key(workspaceId, customerId));
          if (customer === undefined) {
            return null;
          }
          const stored = store.balances.get(key(workspaceId, customerId));
          const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
          return { customer, balance, classification: classifyBalance(balance) };
        },

        recent: async (workspaceId, limit) => {
          const activeSales = [...store.sales.values()].filter(
            (sale) =>
              sale.workspaceId === workspaceId &&
              sale.status === "posted" &&
              sale.voidRecord === null,
          );
          return [...store.customers.values()]
            .filter((customer) => customer.workspaceId === workspaceId && customer.isActive)
            .map((customer) => {
              const lastSale = activeSales
                .filter((sale) => sale.customerId === customer.id)
                .sort(
                  descendingBy(
                    (sale) => sale.transactionTime,
                    (sale) => sale.id,
                  ),
                )[0];
              const stored = store.balances.get(key(workspaceId, customer.id));
              const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
              return {
                customerId: customer.id,
                displayName: customer.displayName,
                phone: customer.phone,
                balance,
                classification: classifyBalance(balance),
                lastSaleTransactionTime: lastSale?.transactionTime ?? null,
              };
            })
            .filter((customer) => customer.lastSaleTransactionTime !== null)
            .sort(
              descendingBy(
                (customer) => customer.lastSaleTransactionTime!,
                (customer) => customer.customerId,
              ),
            )
            .slice(0, limit);
        },
      },

      saleReads: {
        get: async (workspaceId, saleId) => store.sales.get(key(workspaceId, saleId)) ?? null,

        replacedBy: async (workspaceId, saleId) =>
          [...store.sales.values()].find(
            (sale) => sale.workspaceId === workspaceId && sale.replacesSaleId === saleId,
          )?.id ?? null,

        list: async ({ workspaceId, customerId, status, voided, from, to, page }) => {
          const matched = [...store.sales.values()]
            .filter((sale) => sale.workspaceId === workspaceId)
            .filter((sale) => customerId === null || sale.customerId === customerId)
            .filter((sale) => status === null || sale.status === status)
            .filter((sale) => voided === null || (sale.voidRecord !== null) === voided)
            .filter((sale) => from === null || sale.transactionTime >= from)
            .filter((sale) => to === null || sale.transactionTime <= to)
            .sort(
              descendingBy(
                (sale) => sale.transactionTime,
                (sale) => sale.id,
              ),
            )
            .filter((sale) =>
              page.after === null
                ? true
                : before([sale.transactionTime, sale.id], [page.after.sortValue, page.after.id]),
            )
            .map((sale) => ({
              id: sale.id,
              workspaceId: sale.workspaceId,
              customerId: sale.customerId,
              customerDisplayName:
                store.customers.get(key(workspaceId, sale.customerId))?.displayName ?? "",
              status: sale.status,
              isVoided: sale.voidRecord !== null,
              totalAmount: sale.totalAmount,
              lineCount: sale.lines.length,
              version: sale.version,
              transactionTime: sale.transactionTime,
              recordedAt: sale.recordedAt,
              postedAt: sale.postedAt,
              discardedAt: sale.discardedAt,
              dueAt: sale.dueAt,
              replacesSaleId: sale.replacesSaleId,
              replacedBySaleId:
                [...store.sales.values()].find(
                  (other) => other.workspaceId === workspaceId && other.replacesSaleId === sale.id,
                )?.id ?? null,
            }));

          return takePage(matched, page, (row) => ({
            sortValue: row.transactionTime,
            id: row.id,
          }));
        },

        captureContext: async ({ workspaceId, customerId, query, limit }) => {
          const needle = fold(query);
          const eligible = [...store.sales.values()]
            .filter(
              (sale) =>
                sale.workspaceId === workspaceId &&
                sale.status === "posted" &&
                sale.voidRecord === null,
            )
            .sort(
              descendingBy(
                (sale) => sale.transactionTime,
                (sale) => sale.id,
              ),
            );
          const customerHistory = [] as Array<{
            productName: string;
            unit: string;
            lastUnitPrice: Money;
            lastTransactionTime: string;
            sourceSaleId: SaleId;
          }>;
          const workspaceHistory = [] as Array<{ productName: string; unit: string }>;
          const customerSeen = new Set<string>();
          const workspaceSeen = new Set<string>();
          for (const sale of eligible)
            for (const line of sale.lines) {
              if (needle.length > 0 && !fold(line.productName).includes(needle)) continue;
              const identity = `${line.productName}\u0000${line.quantity.unit}`;
              if (!workspaceSeen.has(identity) && workspaceHistory.length < limit) {
                workspaceSeen.add(identity);
                workspaceHistory.push({ productName: line.productName, unit: line.quantity.unit });
              }
              if (
                sale.customerId === customerId &&
                !customerSeen.has(identity) &&
                customerHistory.length < limit
              ) {
                customerSeen.add(identity);
                customerHistory.push({
                  productName: line.productName,
                  unit: line.quantity.unit,
                  lastUnitPrice: line.unitPrice,
                  lastTransactionTime: sale.transactionTime,
                  sourceSaleId: sale.id,
                });
              }
            }
          return { customerHistory, workspaceHistory };
        },
      },

      paymentReads: {
        get: async (workspaceId, paymentId) => {
          const payment = store.payments.get(key(workspaceId, paymentId));
          return payment === undefined ? null : toPaymentSummaryRow(store, payment);
        },

        list: async ({ workspaceId, customerId, status, from, to, page }) => {
          const matched = [...store.payments.values()]
            .filter((payment) => payment.workspaceId === workspaceId)
            .filter((payment) => customerId === null || payment.customerId === customerId)
            .filter((payment) => status === null || payment.status === status)
            .filter((payment) => from === null || payment.transactionTime >= from)
            .filter((payment) => to === null || payment.transactionTime <= to)
            .sort(
              descendingBy(
                (payment) => payment.transactionTime,
                (payment) => payment.id,
              ),
            )
            .filter((payment) =>
              page.after === null
                ? true
                : before(
                    [payment.transactionTime, payment.id],
                    [page.after.sortValue, page.after.id],
                  ),
            )
            .map((payment) => toPaymentSummaryRow(store, payment));

          return takePage(matched, page, (row) => ({
            sortValue: row.transactionTime,
            id: row.id,
          }));
        },
      },

      accountReads: {
        adjustmentDetail: async ({ workspaceId, adjustmentId }) => {
          const entry = store.accountEntries.find(
            (item) =>
              item.workspaceId === workspaceId &&
              item.sourceType === "manual_adjustment" &&
              item.sourceId === adjustmentId,
          );
          if (entry === undefined || entry.reasonCode === null || entry.reason === null)
            return null;
          const history = store.accountEntries
            .filter(
              (item) => item.workspaceId === workspaceId && item.customerId === entry.customerId,
            )
            .sort(
              ascendingBy(
                (item) => `${item.transactionTime}:${item.recordedAt}`,
                (item) => item.id,
              ),
            );
          let running = 0;
          for (const item of history) {
            running += item.amount.amountMinor;
            if (item.id === entry.id) break;
          }
          const customer = store.customers.get(key(workspaceId, entry.customerId));
          const workspace = store.workspaceNames.get(workspaceId);
          const actor = store.actorNames.get(entry.actorId);
          if (customer === undefined || workspace === undefined || actor === undefined) return null;
          return {
            adjustmentId,
            entryId: entry.id,
            commandId: entry.commandId,
            workspace: { id: workspaceId, name: workspace },
            customer: { id: entry.customerId, displayName: customer.displayName },
            actor: { id: entry.actorId, displayName: actor },
            amount: entry.amount,
            reasonCode: entry.reasonCode,
            reason: entry.reason,
            transactionTime: entry.transactionTime,
            recordedAt: entry.recordedAt,
            runningBalance: money(running, entry.amount.currency),
          };
        },
        timeline: async ({ workspaceId, customerId, from, to, page }) => {
          // The running balance is computed over the customer's whole history in
          // business-time order, then the page is cut out of it — the same thing
          // the SQL window function does, and for the same reason: a page is a
          // slice, and a slice cannot know what came before it.
          const ascending = store.accountEntries
            .filter((entry) => entry.workspaceId === workspaceId && entry.customerId === customerId)
            .sort(
              ascendingBy(
                (entry) => entry.transactionTime,
                (entry) => entry.id,
              ),
            );

          let running = 0;
          const withBalance = ascending.map((entry) => {
            running += entry.amount.amountMinor;
            return { entry, runningBalance: money(running, entry.amount.currency) };
          });

          const matched = withBalance
            .filter(({ entry }) => from === null || entry.transactionTime >= from)
            .filter(({ entry }) => to === null || entry.transactionTime <= to)
            .reverse()
            .filter(({ entry }) =>
              page.after === null
                ? true
                : before([entry.transactionTime, entry.id], [page.after.sortValue, page.after.id]),
            )
            .map(({ entry, runningBalance }) => ({
              id: entry.id,
              workspaceId: entry.workspaceId,
              customerId: entry.customerId,
              amount: entry.amount,
              runningBalance,
              source: {
                type: entry.sourceType,
                id: entry.sourceId,
                document: sourceDocument(store, entry.sourceType, entry.sourceId),
                label: entry.sourceType,
              },
              reversalOfEntryId: entry.reversalOfEntryId,
              reasonCode: entry.reasonCode,
              reason: entry.reason,
              transactionTime: entry.transactionTime,
              recordedAt: entry.recordedAt,
              actorId: entry.actorId,
              commandId: entry.commandId,
            }));

          return takePage(matched, page, (row) => ({
            sortValue: row.transactionTime,
            id: row.id,
          }));
        },
      },

      auditReads: {
        timeline: async ({ workspaceId, aggregateType, aggregateId, actorId, from, to, page }) => {
          const matched = store.audit
            .filter((record) => record.workspaceId === workspaceId)
            .filter((record) => aggregateType === null || record.aggregateType === aggregateType)
            .filter((record) => aggregateId === null || record.aggregateId === aggregateId)
            .filter((record) => actorId === null || record.actorId === actorId)
            .filter((record) => from === null || record.recordedAt >= from)
            .filter((record) => to === null || record.recordedAt <= to)
            .sort(
              descendingBy(
                (record) => record.recordedAt,
                (record) => record.id,
              ),
            )
            .filter((record) =>
              page.after === null
                ? true
                : before([record.recordedAt, record.id], [page.after.sortValue, page.after.id]),
            )
            .map((record) => {
              const sale =
                record.aggregateType === "sale"
                  ? store.sales.get(key(workspaceId, record.aggregateId))
                  : undefined;
              return {
                id: record.id,
                workspaceId: record.workspaceId,
                actorId: record.actorId,
                actorDisplayName: store.actorNames.get(record.actorId) ?? "",
                commandId: record.commandId,
                action: record.action,
                aggregateType: record.aggregateType,
                aggregateId: record.aggregateId,
                transactionTime: record.transactionTime,
                recordedAt: record.recordedAt,
                before: record.before,
                after: record.after,
                reason: record.reason,
                rejectionCode: record.rejectionCode,
                correction:
                  record.action === "sale.voided"
                    ? {
                        relation: "voids_sale" as const,
                        targetSaleId: record.aggregateId as SaleId,
                      }
                    : sale?.replacesSaleId != null
                      ? {
                          relation: "replaces_sale" as const,
                          targetSaleId: sale.replacesSaleId,
                        }
                      : null,
              };
            });

          return takePage(matched, page, (row) => ({
            sortValue: row.recordedAt,
            id: row.id,
          }));
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

function sourceDocument(
  store: Store,
  sourceType: CustomerAccountEntryDto["sourceType"],
  sourceId: string,
): { type: "sale" | "payment" | "adjustment"; id: string } {
  if (sourceType === "sale_posting") return { type: "sale", id: sourceId };
  if (sourceType === "sale_void") {
    return {
      type: "sale",
      id: store.saleVoids.find((record) => record.id === sourceId)?.saleId ?? sourceId,
    };
  }
  if (sourceType === "payment") return { type: "payment", id: sourceId };
  if (sourceType === "payment_reversal") {
    return {
      type: "payment",
      id: store.reversals.find((record) => record.id === sourceId)?.paymentId ?? sourceId,
    };
  }
  return { type: "adjustment", id: sourceId };
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
