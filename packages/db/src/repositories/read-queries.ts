import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  actors,
  auditLogs,
  commandReceipts,
  customerAccountBalances,
  customerAccountEntries,
  customers,
  paymentReversals,
  payments,
  products,
  suppliers,
  supplierPayments,
  supplierPaymentReversals,
  supplierAccountEntries,
  supplierAccountBalances,
  purchases,
  purchaseLines,
  purchaseVoids,
  purchaseReceipts,
  purchaseReceiptLines,
  purchaseReceiptReversals,
  inventoryMovements,
  inventoryBalances,
  deliveries,
  deliveryLines,
  deliveryReturns,
  deliveryReturnLines,
  documents,
  documentShares,
  saleLines,
  saleVoids,
  sales,
  workspaces,
  workspaceMemberships,
} from "../schema/index.ts";
import type { Database } from "../client.ts";
import { classifyBalance, classifyInventory, classifySupplierBalance } from "@vuarau/domain-kernel";
import { encodeCursor, unitSchema } from "@vuarau/domain-contracts";
import { fromIso, money, toIso, toIsoOrNull, toSaleState } from "./row-mappers.ts";

/**
 * The read side, in SQL.
 *
 * Every list here is **keyset paged**: `WHERE (sort, id) < (:sort, :id)` with a
 * matching `ORDER BY sort DESC, id DESC`, reading `limit + 1` rows to learn
 * whether another page exists. Postgres compares row values natively, so the
 * predicate uses the same index the ordering does.
 *
 * `OFFSET` is deliberately absent. It re-reads the rows it skips, and it shifts
 * under concurrent inserts — a sale posted while somebody is paging pushes a row
 * they have already seen onto the next page. When the list is money, a page
 * boundary that silently duplicates a row is a support call.
 *
 * No query in this file runs per row. Names, line counts and entry sources are
 * joined into the page query, because a read that fans out per row degrades
 * exactly as a depot gets busy.
 */

// Keep this aligned with the concrete transaction produced by our database
// factory. This also lets database regression tests exercise a read repository
// inside their own transaction.
type Tx = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];

type Page = { after: { sortValue: string; id: string } | null; limit: number };

function vietnamBusinessDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

/** Reads one extra row to answer "is there more" without a second count query. */
function fetchLimit(page: Page): number {
  return page.limit + 1;
}

function paged<TRow>(
  rows: readonly TRow[],
  page: Page,
  key: (row: TRow) => { sortValue: string; id: string },
): { rows: readonly TRow[]; next: { sortValue: string; id: string } | null } {
  if (rows.length <= page.limit) {
    return { rows, next: null };
  }
  const visible = rows.slice(0, page.limit);
  return { rows: visible, next: key(visible[visible.length - 1]!) };
}

async function readPurchaseDto(tx: Tx, workspaceId: string, purchaseId: string) {
  const rows = await tx
    .select()
    .from(purchases)
    .where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.id, purchaseId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const [lines, voidRows] = await Promise.all([
    tx
      .select()
      .from(purchaseLines)
      .where(
        and(eq(purchaseLines.workspaceId, workspaceId), eq(purchaseLines.purchaseId, purchaseId)),
      )
      .orderBy(asc(purchaseLines.id)),
    tx
      .select()
      .from(purchaseVoids)
      .where(
        and(eq(purchaseVoids.workspaceId, workspaceId), eq(purchaseVoids.purchaseId, purchaseId)),
      )
      .limit(1),
  ]);
  const voidRow = voidRows[0];
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    supplierId: row.supplierId,
    status: row.status,
    currency: row.currency,
    lines: lines.map((line) => ({
      lineId: line.id,
      productId: line.productId,
      productName: line.productName,
      quantity: { valueScaled: line.quantityScaled, unit: line.unit },
      unitPrice: money(line.unitPriceMinor, line.currency),
      lineTotal: money(line.lineTotalMinor, line.currency),
    })),
    totalAmount: money(row.totalAmountMinor, row.currency),
    note: row.note,
    dueAt: toIsoOrNull(row.dueAt),
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    confirmedAt: toIsoOrNull(row.confirmedAt),
    discardedAt: toIsoOrNull(row.discardedAt),
    replacesPurchaseId: row.replacesPurchaseId,
    voidRecord:
      voidRow === undefined
        ? null
        : {
            id: voidRow.id,
            purchaseId: voidRow.purchaseId,
            reasonCode: voidRow.reasonCode as
              | "wrong_supplier"
              | "wrong_product"
              | "wrong_quantity"
              | "wrong_price"
              | "duplicate"
              | "other",
            reason: voidRow.reason,
            amount: money(voidRow.amountMinor, voidRow.currency),
            transactionTime: toIso(voidRow.transactionTime),
            recordedAt: toIso(voidRow.recordedAt),
          },
  };
}

async function readReceiptDto(tx: Tx, workspaceId: string, receiptId: string) {
  const rows = await tx
    .select()
    .from(purchaseReceipts)
    .where(and(eq(purchaseReceipts.workspaceId, workspaceId), eq(purchaseReceipts.id, receiptId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const [lines, reversals] = await Promise.all([
    tx
      .select()
      .from(purchaseReceiptLines)
      .where(
        and(
          eq(purchaseReceiptLines.workspaceId, workspaceId),
          eq(purchaseReceiptLines.receiptId, receiptId),
        ),
      )
      .orderBy(asc(purchaseReceiptLines.id)),
    tx
      .select()
      .from(purchaseReceiptReversals)
      .where(
        and(
          eq(purchaseReceiptReversals.workspaceId, workspaceId),
          eq(purchaseReceiptReversals.receiptId, receiptId),
        ),
      )
      .limit(1),
  ]);
  const reversal = reversals[0];
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    purchaseId: row.purchaseId,
    lines: lines.map((line) => ({
      receiptLineId: line.id,
      purchaseLineId: line.purchaseLineId,
      productId: line.productId,
      quantity: { valueScaled: line.quantityScaled, unit: line.unit },
    })),
    note: row.note,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId,
    reversal:
      reversal === undefined
        ? null
        : {
            id: reversal.id,
            reasonCode: reversal.reasonCode,
            reason: reversal.reason,
            transactionTime: toIso(reversal.transactionTime),
            recordedAt: toIso(reversal.recordedAt),
          },
  };
}

async function readDeliveryDto(tx: Tx, workspaceId: string, deliveryId: string) {
  const rows = await tx
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.workspaceId, workspaceId), eq(deliveries.id, deliveryId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const [lines, returnRows] = await Promise.all([
    tx
      .select()
      .from(deliveryLines)
      .where(
        and(eq(deliveryLines.workspaceId, workspaceId), eq(deliveryLines.deliveryId, deliveryId)),
      )
      .orderBy(asc(deliveryLines.id)),
    tx
      .select()
      .from(deliveryReturns)
      .where(
        and(
          eq(deliveryReturns.workspaceId, workspaceId),
          eq(deliveryReturns.deliveryId, deliveryId),
        ),
      )
      .orderBy(
        asc(deliveryReturns.transactionTime),
        asc(deliveryReturns.recordedAt),
        asc(deliveryReturns.id),
      ),
  ]);
  const returnIds = returnRows.map((record) => record.id);
  const returnLineRows =
    returnIds.length === 0
      ? []
      : await tx
          .select()
          .from(deliveryReturnLines)
          .where(inArray(deliveryReturnLines.returnId, returnIds));
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    saleId: row.saleId,
    status: row.status,
    lines: lines.map((line) => {
      const returnedQuantity = returnLineRows
        .filter((item) => item.deliveryLineId === line.id)
        .reduce((sum, item) => sum + item.quantityScaled, 0);
      return {
        deliveryLineId: line.id,
        saleLineId: line.saleLineId,
        productId: line.productId,
        productName: line.productName,
        quantity: { valueScaled: line.quantityScaled, unit: line.unit },
        returnedQuantity: { valueScaled: returnedQuantity, unit: line.unit },
      };
    }),
    note: row.note,
    cancellationReason: row.cancellationReason,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    dispatchedAt: toIsoOrNull(row.dispatchedAt),
    deliveredAt: toIsoOrNull(row.deliveredAt),
    returns: returnRows.map((record) => ({
      id: record.id,
      reason: record.reason,
      lines: returnLineRows
        .filter((item) => item.returnId === record.id)
        .map((item) => ({
          deliveryLineId: item.deliveryLineId,
          quantity: { valueScaled: item.quantityScaled, unit: item.unit },
        })),
      transactionTime: toIso(record.transactionTime),
      recordedAt: toIso(record.recordedAt),
      actorId: record.actorId,
    })),
  };
}

const toDocumentDto = (row: typeof documents.$inferSelect) => ({
  id: row.id,
  workspaceId: row.workspaceId,
  documentType: row.documentType,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  version: row.version,
  snapshot: row.snapshot as Record<string, unknown>,
  digest: row.digest,
  generatedAt: toIso(row.generatedAt),
  generatedBy: row.generatedBy,
});

/**
 * Diacritic folding for search.
 *
 * `vuarau_fold` is an IMMUTABLE SQL function installed by migration 0005 rather
 * than the `unaccent` extension: it also folds `đ`/`Đ`, which Vietnamese names
 * are full of and which generic unaccenting leaves alone. Being IMMUTABLE, it can
 * back an expression index the day the customer count makes one worth having.
 */

export function createReadRepositories(tx: Tx) {
  return {
    customerReads: {
      async search(args: {
        workspaceId: string;
        query: string;
        isActive: boolean | null;
        page: Page;
      }) {
        const { workspaceId, query, isActive, page } = args;

        const filters: SQL[] = [eq(customers.workspaceId, workspaceId)];
        if (isActive !== null) {
          filters.push(eq(customers.isActive, isActive));
        }
        if (query.length > 0) {
          const pattern = `%${query}%`;
          filters.push(
            or(
              sql`vuarau_fold(${customers.displayName}) ILIKE vuarau_fold(${pattern})`,
              ilike(customers.phone, pattern),
            )!,
          );
        }
        // Ascending, because a person scans a name list from the top. The id is
        // the tiebreak: two customers may legitimately share a name (ASM-012).
        if (page.after !== null) {
          filters.push(
            sql`(${customers.displayName}, ${customers.id}) > (${page.after.sortValue}, ${page.after.id}::uuid)`,
          );
        }

        const rows = await tx
          .select({
            id: customers.id,
            workspaceId: customers.workspaceId,
            displayName: customers.displayName,
            phone: customers.phone,
            isActive: customers.isActive,
            version: customers.version,
            balanceMinor: customerAccountBalances.balanceMinor,
            currency: customerAccountBalances.currency,
            lastEntryTransactionTime: customerAccountBalances.lastEntryTransactionTime,
          })
          .from(customers)
          // LEFT: a customer with no entries has no balance row, and their balance
          // is zero because nothing has moved it — not because they are missing.
          .leftJoin(
            customerAccountBalances,
            and(
              eq(customerAccountBalances.workspaceId, customers.workspaceId),
              eq(customerAccountBalances.customerId, customers.id),
            ),
          )
          .where(and(...filters))
          .orderBy(asc(customers.displayName), asc(customers.id))
          .limit(fetchLimit(page));

        return paged(
          rows.map((row) => {
            const balance = money(row.balanceMinor ?? 0, row.currency ?? "VND");
            return {
              id: row.id,
              workspaceId: row.workspaceId,
              displayName: row.displayName,
              phone: row.phone,
              isActive: row.isActive,
              version: row.version,
              balance,
              classification: classifyBalance(balance),
              lastEntryTransactionTime: toIsoOrNull(row.lastEntryTransactionTime),
            };
          }),
          page,
          (row) => ({ sortValue: row.displayName, id: row.id }),
        );
      },

      async get(workspaceId: string, customerId: string) {
        const rows = await tx
          .select({
            customer: customers,
            balanceMinor: customerAccountBalances.balanceMinor,
            currency: customerAccountBalances.currency,
          })
          .from(customers)
          .leftJoin(
            customerAccountBalances,
            and(
              eq(customerAccountBalances.workspaceId, customers.workspaceId),
              eq(customerAccountBalances.customerId, customers.id),
            ),
          )
          .where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, customerId)))
          .limit(1);

        const row = rows[0];
        if (row === undefined) {
          return null;
        }
        const balance = money(row.balanceMinor ?? 0, row.currency ?? "VND");
        return {
          customer: {
            id: row.customer.id,
            workspaceId: row.customer.workspaceId,
            displayName: row.customer.displayName,
            phone: row.customer.phone,
            note: row.customer.note,
            isActive: row.customer.isActive,
            version: row.customer.version,
            transactionTime: toIso(row.customer.transactionTime),
            recordedAt: toIso(row.customer.recordedAt),
            updatedAt: toIso(row.customer.updatedAt),
          },
          balance,
          classification: classifyBalance(balance),
        };
      },

      async recent(workspaceId: string, limit: number) {
        const rows = await tx
          .select({
            customerId: customers.id,
            displayName: customers.displayName,
            phone: customers.phone,
            balanceMinor: customerAccountBalances.balanceMinor,
            currency: customerAccountBalances.currency,
            lastSale: sql<Date | null>`max(${sales.transactionTime})`,
          })
          .from(customers)
          .leftJoin(
            customerAccountBalances,
            and(
              eq(customerAccountBalances.workspaceId, customers.workspaceId),
              eq(customerAccountBalances.customerId, customers.id),
            ),
          )
          .leftJoin(
            sales,
            and(
              eq(sales.workspaceId, customers.workspaceId),
              eq(sales.customerId, customers.id),
              eq(sales.status, "posted"),
            ),
          )
          .leftJoin(saleVoids, eq(saleVoids.saleId, sales.id))
          .where(
            and(
              eq(customers.workspaceId, workspaceId),
              eq(customers.isActive, true),
              sql`${saleVoids.id} IS NULL`,
            ),
          )
          .groupBy(
            customers.id,
            customers.displayName,
            customers.phone,
            customerAccountBalances.balanceMinor,
            customerAccountBalances.currency,
          )
          .orderBy(desc(sql`max(${sales.transactionTime})`), asc(customers.id))
          .limit(limit);
        return rows.map((row) => {
          const balance = money(row.balanceMinor ?? 0, row.currency ?? "VND");
          return {
            customerId: row.customerId,
            displayName: row.displayName,
            phone: row.phone,
            balance,
            classification: classifyBalance(balance),
            lastSaleTransactionTime: row.lastSale === null ? null : toIso(row.lastSale),
          };
        });
      },

      async possibleDuplicates(args: {
        workspaceId: string;
        displayName: string;
        phone: string | null;
        excludeCustomerId: string | null;
        limit: number;
      }) {
        const normalizedName = args.displayName.trim();
        const normalizedPhone = args.phone?.replace(/\D/g, "") ?? "";
        if (normalizedName.length === 0 && normalizedPhone.length === 0) return [];

        const sameName =
          normalizedName.length === 0
            ? sql<boolean>`false`
            : sql<boolean>`vuarau_fold(trim(${customers.displayName})) = vuarau_fold(${normalizedName})`;
        const samePhone =
          normalizedPhone.length === 0
            ? sql<boolean>`false`
            : sql<boolean>`regexp_replace(coalesce(${customers.phone}, ''), '[^0-9]', '', 'g') = ${normalizedPhone}`;
        const filters: SQL[] = [
          eq(customers.workspaceId, args.workspaceId),
          or(sameName, samePhone)!,
        ];
        if (args.excludeCustomerId !== null) {
          filters.push(sql`${customers.id} <> ${args.excludeCustomerId}::uuid`);
        }
        const rows = await tx
          .select({
            id: customers.id,
            workspaceId: customers.workspaceId,
            displayName: customers.displayName,
            phone: customers.phone,
            isActive: customers.isActive,
            version: customers.version,
            balanceMinor: customerAccountBalances.balanceMinor,
            currency: customerAccountBalances.currency,
            lastEntryTransactionTime: customerAccountBalances.lastEntryTransactionTime,
            sameName,
            samePhone,
          })
          .from(customers)
          .leftJoin(
            customerAccountBalances,
            and(
              eq(customerAccountBalances.workspaceId, customers.workspaceId),
              eq(customerAccountBalances.customerId, customers.id),
            ),
          )
          .where(and(...filters))
          .orderBy(asc(customers.displayName), asc(customers.id))
          .limit(args.limit);

        return rows.map((row) => {
          const balance = money(row.balanceMinor ?? 0, row.currency ?? "VND");
          return {
            customer: {
              id: row.id,
              workspaceId: row.workspaceId,
              displayName: row.displayName,
              phone: row.phone,
              isActive: row.isActive,
              version: row.version,
              balance,
              classification: classifyBalance(balance),
              lastEntryTransactionTime: toIsoOrNull(row.lastEntryTransactionTime),
            },
            reasons: [
              ...(row.sameName ? (["same_name"] as const) : []),
              ...(row.samePhone ? (["same_phone"] as const) : []),
            ],
          };
        });
      },
    },

    productReads: {
      async search(args: {
        workspaceId: string;
        query: string;
        isActive: boolean | null;
        page: Page;
      }) {
        const filters: SQL[] = [eq(products.workspaceId, args.workspaceId)];
        if (args.isActive !== null) filters.push(eq(products.isActive, args.isActive));
        if (args.query.length > 0) {
          const pattern = `%${args.query}%`;
          filters.push(
            or(
              sql`vuarau_fold(${products.name}) ILIKE vuarau_fold(${pattern})`,
              sql`EXISTS (SELECT 1 FROM unnest(${products.aliases}) alias WHERE vuarau_fold(alias) ILIKE vuarau_fold(${pattern}))`,
            )!,
          );
        }
        if (args.page.after !== null) {
          filters.push(
            sql`(${products.name}, ${products.id}) > (${args.page.after.sortValue}, ${args.page.after.id}::uuid)`,
          );
        }
        const rows = await tx
          .select()
          .from(products)
          .where(and(...filters))
          .orderBy(asc(products.name), asc(products.id))
          .limit(fetchLimit(args.page));
        return paged(
          rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            displayName: row.name,
            aliases: row.aliases,
            preferredUnit: row.preferredUnit === null ? null : unitSchema.parse(row.preferredUnit),
            isActive: row.isActive,
            version: row.version,
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          })),
          args.page,
          (row) => ({ sortValue: row.displayName, id: row.id }),
        );
      },
      async get(workspaceId: string, productId: string) {
        const rows = await tx
          .select()
          .from(products)
          .where(and(eq(products.workspaceId, workspaceId), eq(products.id, productId)))
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? null
          : {
              id: row.id,
              workspaceId: row.workspaceId,
              displayName: row.name,
              aliases: row.aliases,
              preferredUnit:
                row.preferredUnit === null ? null : unitSchema.parse(row.preferredUnit),
              isActive: row.isActive,
              version: row.version,
              createdAt: toIso(row.createdAt),
              updatedAt: toIso(row.updatedAt),
            };
      },
    },

    supplierReads: {
      async search(args: {
        workspaceId: string;
        query: string;
        isActive: boolean | null;
        page: Page;
      }) {
        const filters: SQL[] = [eq(suppliers.workspaceId, args.workspaceId)];
        if (args.isActive !== null) filters.push(eq(suppliers.isActive, args.isActive));
        if (args.query.length > 0) {
          const pattern = `%${args.query}%`;
          filters.push(
            or(
              sql`vuarau_fold(${suppliers.displayName}) ILIKE vuarau_fold(${pattern})`,
              ilike(suppliers.phone, pattern),
            )!,
          );
        }
        if (args.page.after !== null) {
          filters.push(
            sql`(${suppliers.displayName}, ${suppliers.id}) > (${args.page.after.sortValue}, ${args.page.after.id}::uuid)`,
          );
        }
        const rows = await tx
          .select()
          .from(suppliers)
          .where(and(...filters))
          .orderBy(asc(suppliers.displayName), asc(suppliers.id))
          .limit(fetchLimit(args.page));
        return paged(
          rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            displayName: row.displayName,
            phone: row.phone,
            note: row.note,
            isActive: row.isActive,
            version: row.version,
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          })),
          args.page,
          (row) => ({ sortValue: row.displayName, id: row.id }),
        );
      },
      async get(workspaceId: string, supplierId: string) {
        const rows = await tx
          .select()
          .from(suppliers)
          .where(and(eq(suppliers.workspaceId, workspaceId), eq(suppliers.id, supplierId)))
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? null
          : {
              id: row.id,
              workspaceId: row.workspaceId,
              displayName: row.displayName,
              phone: row.phone,
              note: row.note,
              isActive: row.isActive,
              version: row.version,
              createdAt: toIso(row.createdAt),
              updatedAt: toIso(row.updatedAt),
            };
      },
    },

    supplierAccountReads: {
      async balance(workspaceId: string, supplierId: string) {
        const rows = await tx
          .select()
          .from(supplierAccountBalances)
          .where(
            and(
              eq(supplierAccountBalances.workspaceId, workspaceId),
              eq(supplierAccountBalances.supplierId, supplierId),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (row === undefined) return null;
        const balance = money(row.balanceMinor, row.currency);
        return {
          workspaceId: row.workspaceId,
          supplierId: row.supplierId,
          balance,
          classification: classifySupplierBalance(balance.amountMinor),
          entryCount: row.entryCount,
          lastEntryTransactionTime: toIsoOrNull(row.lastEntryTransactionTime),
          updatedAt: toIso(row.updatedAt),
        };
      },
      async timeline(args: { workspaceId: string; supplierId: string; page: Page }) {
        const filters: SQL[] = [
          eq(supplierAccountEntries.workspaceId, args.workspaceId),
          eq(supplierAccountEntries.supplierId, args.supplierId),
        ];
        if (args.page.after !== null) {
          const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
          filters.push(
            sql`(${supplierAccountEntries.transactionTime}, ${supplierAccountEntries.recordedAt}, ${supplierAccountEntries.id}) < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`,
          );
        }
        const rows = await tx
          .select()
          .from(supplierAccountEntries)
          .where(and(...filters))
          .orderBy(
            desc(supplierAccountEntries.transactionTime),
            desc(supplierAccountEntries.recordedAt),
            desc(supplierAccountEntries.id),
          )
          .limit(fetchLimit(args.page));
        const reversalSourceIds = rows
          .filter((row) => row.sourceType === "supplier_payment_reversal")
          .map((row) => row.sourceId);
        const voidSourceIds = rows
          .filter((row) => row.sourceType === "purchase_void")
          .map((row) => row.sourceId);
        const [paymentSources, purchaseSources] = await Promise.all([
          reversalSourceIds.length === 0
            ? []
            : tx
                .select({
                  reversalId: supplierPaymentReversals.id,
                  paymentId: supplierPaymentReversals.supplierPaymentId,
                })
                .from(supplierPaymentReversals)
                .where(
                  and(
                    eq(supplierPaymentReversals.workspaceId, args.workspaceId),
                    inArray(supplierPaymentReversals.id, reversalSourceIds),
                  ),
                ),
          voidSourceIds.length === 0
            ? []
            : tx
                .select({
                  voidId: purchaseVoids.id,
                  purchaseId: purchaseVoids.purchaseId,
                })
                .from(purchaseVoids)
                .where(
                  and(
                    eq(purchaseVoids.workspaceId, args.workspaceId),
                    inArray(purchaseVoids.id, voidSourceIds),
                  ),
                ),
        ]);
        return paged(
          rows.map((row) => {
            const sourceDocument =
              row.sourceType === "supplier_payment"
                ? { type: "supplier_payment" as const, id: row.sourceId }
                : row.sourceType === "supplier_payment_reversal"
                  ? {
                      type: "supplier_payment" as const,
                      id:
                        paymentSources.find((source) => source.reversalId === row.sourceId)
                          ?.paymentId ?? row.sourceId,
                    }
                  : row.sourceType === "purchase_confirmation"
                    ? { type: "purchase" as const, id: row.sourceId }
                    : row.sourceType === "purchase_void"
                      ? {
                          type: "purchase" as const,
                          id:
                            purchaseSources.find((source) => source.voidId === row.sourceId)
                              ?.purchaseId ?? row.sourceId,
                        }
                      : { type: "supplier_adjustment" as const, id: row.sourceId };
            return {
              id: row.id,
              workspaceId: row.workspaceId,
              supplierId: row.supplierId,
              amount: money(row.amountMinor, row.currency),
              sourceType: row.sourceType,
              sourceId: row.sourceId,
              reversalOfEntryId: row.reversalOfEntryId,
              reasonCode: row.reasonCode,
              reason: row.reason,
              transactionTime: toIso(row.transactionTime),
              recordedAt: toIso(row.recordedAt),
              actorId: row.actorId,
              commandId: row.commandId,
              sourceDocument,
            };
          }),
          args.page,
          (row) => ({
            sortValue: `${row.transactionTime}|${row.recordedAt}`,
            id: row.id,
          }),
        );
      },
      async payment(workspaceId: string, paymentId: string) {
        const rows = await tx
          .select()
          .from(supplierPayments)
          .where(
            and(eq(supplierPayments.workspaceId, workspaceId), eq(supplierPayments.id, paymentId)),
          )
          .limit(1);
        const row = rows[0];
        if (row === undefined) return null;
        const status =
          row.reversedAmountMinor === 0
            ? ("recorded" as const)
            : row.reversedAmountMinor === row.amountMinor
              ? ("reversed" as const)
              : ("partially_reversed" as const);
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          supplierId: row.supplierId,
          amount: money(row.amountMinor, row.currency),
          method: row.method,
          note: row.note,
          reversedAmount: money(row.reversedAmountMinor, row.currency),
          status,
          version: row.version,
          transactionTime: toIso(row.transactionTime),
          recordedAt: toIso(row.recordedAt),
        };
      },
      async integrity(workspaceId: string, supplierId: string) {
        const rows = await tx.execute(sql`
          select sae.id::text as id,
            case
              when sae.amount_minor = 0 then 'zero_amount'
              when sae.source_type = 'manual_adjustment'
                and (sae.reason_code is null or length(btrim(coalesce(sae.reason, ''))) = 0)
                then 'malformed_adjustment'
              when sae.source_type = 'supplier_payment'
                and (sp.id is null or sp.workspace_id <> sae.workspace_id
                  or sp.supplier_id <> sae.supplier_id
                  or -sp.amount_minor <> sae.amount_minor or sp.currency <> sae.currency)
                then 'missing_or_mismatched_supplier_payment'
              when sae.source_type = 'supplier_payment_reversal'
                and (spr.id is null or sp2.id is null or spr.workspace_id <> sae.workspace_id
                  or sp2.supplier_id <> sae.supplier_id
                  or spr.amount_minor <> sae.amount_minor or spr.currency <> sae.currency)
                then 'missing_or_mismatched_supplier_payment_reversal'
              when sae.source_type = 'purchase_confirmation'
                and (p.id is null or p.workspace_id <> sae.workspace_id
                  or p.supplier_id <> sae.supplier_id
                  or p.status <> 'confirmed'
                  or p.total_amount_minor <> sae.amount_minor or p.currency <> sae.currency)
                then 'missing_or_mismatched_purchase'
              when sae.source_type = 'purchase_void'
                and (pv.id is null or p2.id is null or pv.workspace_id <> sae.workspace_id
                  or p2.supplier_id <> sae.supplier_id
                  or -pv.amount_minor <> sae.amount_minor or pv.currency <> sae.currency)
                then 'missing_or_mismatched_purchase_void'
              else null
            end as diagnostic
          from supplier_account_entries sae
          left join supplier_payments sp
            on sae.source_type = 'supplier_payment' and sp.id = sae.source_id
          left join supplier_payment_reversals spr
            on sae.source_type = 'supplier_payment_reversal' and spr.id = sae.source_id
          left join supplier_payments sp2 on sp2.id = spr.supplier_payment_id
          left join purchases p
            on sae.source_type = 'purchase_confirmation' and p.id = sae.source_id
          left join purchase_voids pv
            on sae.source_type = 'purchase_void' and pv.id = sae.source_id
          left join purchases p2 on p2.id = pv.purchase_id
          where sae.workspace_id = ${workspaceId}::uuid
            and sae.supplier_id = ${supplierId}::uuid
        `);
        return (rows as unknown as Array<{ diagnostic: string | null }>).flatMap((row) =>
          row.diagnostic === null ? [] : [row.diagnostic],
        );
      },
    },

    purchaseReads: {
      async get(workspaceId: string, purchaseId: string) {
        return readPurchaseDto(tx, workspaceId, purchaseId);
      },
      async list(args: {
        workspaceId: string;
        supplierId: string | null;
        status: string | null;
        page: Page;
      }) {
        const filters: SQL[] = [eq(purchases.workspaceId, args.workspaceId)];
        if (args.supplierId !== null) filters.push(eq(purchases.supplierId, args.supplierId));
        if (args.status !== null)
          filters.push(eq(purchases.status, args.status as typeof purchases.$inferSelect.status));
        if (args.page.after !== null) {
          const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
          filters.push(sql`(${purchases.transactionTime}, ${purchases.recordedAt}, ${purchases.id})
            < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
        }
        const purchaseRows = await tx
          .select()
          .from(purchases)
          .where(and(...filters))
          .orderBy(desc(purchases.transactionTime), desc(purchases.recordedAt), desc(purchases.id))
          .limit(fetchLimit(args.page));
        const purchaseIds = purchaseRows.map((row) => row.id);
        const [lineRows, voidRows] =
          purchaseIds.length === 0
            ? ([[], []] as const)
            : await Promise.all([
                tx
                  .select()
                  .from(purchaseLines)
                  .where(
                    and(
                      eq(purchaseLines.workspaceId, args.workspaceId),
                      inArray(purchaseLines.purchaseId, purchaseIds),
                    ),
                  )
                  .orderBy(asc(purchaseLines.id)),
                tx
                  .select()
                  .from(purchaseVoids)
                  .where(
                    and(
                      eq(purchaseVoids.workspaceId, args.workspaceId),
                      inArray(purchaseVoids.purchaseId, purchaseIds),
                    ),
                  ),
              ]);
        const mapped = purchaseRows.map((row) => {
          const voidRow = voidRows.find((candidate) => candidate.purchaseId === row.id);
          return {
            id: row.id,
            workspaceId: row.workspaceId,
            supplierId: row.supplierId,
            status: row.status,
            currency: row.currency,
            lines: lineRows
              .filter((line) => line.purchaseId === row.id)
              .map((line) => ({
                lineId: line.id,
                productId: line.productId,
                productName: line.productName,
                quantity: { valueScaled: line.quantityScaled, unit: line.unit },
                unitPrice: money(line.unitPriceMinor, line.currency),
                lineTotal: money(line.lineTotalMinor, line.currency),
              })),
            totalAmount: money(row.totalAmountMinor, row.currency),
            note: row.note,
            dueAt: toIsoOrNull(row.dueAt),
            version: row.version,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            confirmedAt: toIsoOrNull(row.confirmedAt),
            discardedAt: toIsoOrNull(row.discardedAt),
            replacesPurchaseId: row.replacesPurchaseId,
            voidRecord:
              voidRow === undefined
                ? null
                : {
                    id: voidRow.id,
                    purchaseId: voidRow.purchaseId,
                    reasonCode: voidRow.reasonCode,
                    reason: voidRow.reason,
                    amount: money(voidRow.amountMinor, voidRow.currency),
                    transactionTime: toIso(voidRow.transactionTime),
                    recordedAt: toIso(voidRow.recordedAt),
                  },
          };
        });
        return paged(mapped, args.page, (row) => ({
          sortValue: `${row.transactionTime}|${row.recordedAt}`,
          id: row.id,
        }));
      },
    },

    inventoryReads: {
      async receipt(workspaceId: string, receiptId: string) {
        return readReceiptDto(tx, workspaceId, receiptId);
      },
      async receipts(workspaceId: string, purchaseId: string) {
        const rows = await tx
          .select()
          .from(purchaseReceipts)
          .where(
            and(
              eq(purchaseReceipts.workspaceId, workspaceId),
              eq(purchaseReceipts.purchaseId, purchaseId),
            ),
          )
          .orderBy(
            asc(purchaseReceipts.transactionTime),
            asc(purchaseReceipts.recordedAt),
            asc(purchaseReceipts.id),
          );
        const receiptIds = rows.map((row) => row.id);
        if (receiptIds.length === 0) return [];
        const [lines, reversals] = await Promise.all([
          tx
            .select()
            .from(purchaseReceiptLines)
            .where(
              and(
                eq(purchaseReceiptLines.workspaceId, workspaceId),
                inArray(purchaseReceiptLines.receiptId, receiptIds),
              ),
            )
            .orderBy(asc(purchaseReceiptLines.id)),
          tx
            .select()
            .from(purchaseReceiptReversals)
            .where(
              and(
                eq(purchaseReceiptReversals.workspaceId, workspaceId),
                inArray(purchaseReceiptReversals.receiptId, receiptIds),
              ),
            ),
        ]);
        return rows.map((row) => {
          const reversal = reversals.find((candidate) => candidate.receiptId === row.id);
          return {
            id: row.id,
            workspaceId: row.workspaceId,
            purchaseId: row.purchaseId,
            lines: lines
              .filter((line) => line.receiptId === row.id)
              .map((line) => ({
                receiptLineId: line.id,
                purchaseLineId: line.purchaseLineId,
                productId: line.productId,
                quantity: { valueScaled: line.quantityScaled, unit: line.unit },
              })),
            note: row.note,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            actorId: row.actorId,
            reversal:
              reversal === undefined
                ? null
                : {
                    id: reversal.id,
                    reasonCode: reversal.reasonCode,
                    reason: reversal.reason,
                    transactionTime: toIso(reversal.transactionTime),
                    recordedAt: toIso(reversal.recordedAt),
                  },
          };
        });
      },
      async adjustment(workspaceId: string, adjustmentId: string) {
        const rows = await tx
          .select()
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.workspaceId, workspaceId),
              eq(inventoryMovements.sourceType, "inventory_adjustment"),
              eq(inventoryMovements.sourceId, adjustmentId),
            ),
          )
          .limit(1);
        const row = rows[0];
        return row === undefined
          ? null
          : {
              id: row.id,
              workspaceId: row.workspaceId,
              productId: row.productId,
              quantity: { valueScaled: row.quantityScaled, unit: row.unit },
              sourceType: row.sourceType,
              sourceId: row.sourceId,
              sourceLineId: row.sourceLineId,
              reversalOfMovementId: row.reversalOfMovementId,
              reasonCode: row.reasonCode,
              reason: row.reason,
              transactionTime: toIso(row.transactionTime),
              recordedAt: toIso(row.recordedAt),
              actorId: row.actorId,
              commandId: row.commandId,
              sourceDocument: { type: "inventory_adjustment" as const, id: row.sourceId },
            };
      },
      async balances(workspaceId: string, productId: string) {
        const rows = await tx
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.workspaceId, workspaceId),
              eq(inventoryBalances.productId, productId),
            ),
          )
          .orderBy(asc(inventoryBalances.unit));
        return rows.map((row) => ({
          workspaceId: row.workspaceId,
          productId: row.productId,
          unit: row.unit,
          quantityScaled: row.quantityScaled,
          classification: classifyInventory(row.quantityScaled),
          movementCount: row.movementCount,
          lastMovementTransactionTime: toIsoOrNull(row.lastMovementTransactionTime),
          updatedAt: toIso(row.updatedAt),
        }));
      },
      async timeline(args: {
        workspaceId: string;
        productId: string;
        unit: typeof inventoryMovements.$inferSelect.unit | null;
        page: Page;
      }) {
        const filters: SQL[] = [
          eq(inventoryMovements.workspaceId, args.workspaceId),
          eq(inventoryMovements.productId, args.productId),
        ];
        if (args.unit !== null) filters.push(eq(inventoryMovements.unit, args.unit));
        if (args.page.after !== null) {
          const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
          filters.push(sql`(${inventoryMovements.transactionTime}, ${inventoryMovements.recordedAt}, ${inventoryMovements.id})
            < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
        }
        const rows = await tx
          .select()
          .from(inventoryMovements)
          .where(and(...filters))
          .orderBy(
            desc(inventoryMovements.transactionTime),
            desc(inventoryMovements.recordedAt),
            desc(inventoryMovements.id),
          )
          .limit(fetchLimit(args.page));
        const reversalIds = rows
          .filter((row) => row.sourceType === "purchase_receipt_reversal")
          .map((row) => row.sourceId);
        const reversalSources =
          reversalIds.length === 0
            ? []
            : await tx
                .select({
                  reversalId: purchaseReceiptReversals.id,
                  receiptId: purchaseReceiptReversals.receiptId,
                })
                .from(purchaseReceiptReversals)
                .where(
                  and(
                    eq(purchaseReceiptReversals.workspaceId, args.workspaceId),
                    inArray(purchaseReceiptReversals.id, reversalIds),
                  ),
                );
        const deliveryReturnIds = rows
          .filter((row) => row.sourceType === "delivery_return")
          .map((row) => row.sourceId);
        const deliveryReturnSources =
          deliveryReturnIds.length === 0
            ? []
            : await tx
                .select({
                  returnId: deliveryReturns.id,
                  deliveryId: deliveryReturns.deliveryId,
                })
                .from(deliveryReturns)
                .where(
                  and(
                    eq(deliveryReturns.workspaceId, args.workspaceId),
                    inArray(deliveryReturns.id, deliveryReturnIds),
                  ),
                );
        return paged(
          rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            productId: row.productId,
            quantity: { valueScaled: row.quantityScaled, unit: row.unit },
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            sourceLineId: row.sourceLineId,
            reversalOfMovementId: row.reversalOfMovementId,
            reasonCode: row.reasonCode,
            reason: row.reason,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            actorId: row.actorId,
            commandId: row.commandId,
            sourceDocument:
              row.sourceType === "inventory_adjustment"
                ? { type: "inventory_adjustment" as const, id: row.sourceId }
                : row.sourceType === "delivery_dispatch"
                  ? { type: "delivery" as const, id: row.sourceId }
                  : row.sourceType === "delivery_return"
                    ? {
                        type: "delivery" as const,
                        id:
                          deliveryReturnSources.find((source) => source.returnId === row.sourceId)
                            ?.deliveryId ?? row.sourceId,
                      }
                    : {
                        type: "receipt" as const,
                        id:
                          row.sourceType === "purchase_receipt"
                            ? row.sourceId
                            : (reversalSources.find((source) => source.reversalId === row.sourceId)
                                ?.receiptId ?? row.sourceId),
                      },
          })),
          args.page,
          (row) => ({
            sortValue: `${row.transactionTime}|${row.recordedAt}`,
            id: row.id,
          }),
        );
      },
      async integrity(
        workspaceId: string,
        productId: string,
        unit: typeof inventoryMovements.$inferSelect.unit,
      ) {
        const rows = await tx.execute(sql`
          select case
            when im.quantity_scaled = 0 then 'zero_quantity'
            when im.source_type = 'inventory_adjustment'
              and (im.reason_code is null or length(btrim(coalesce(im.reason, ''))) = 0)
              then 'malformed_adjustment'
            when im.source_type = 'purchase_receipt'
              and (prl.id is null or prl.workspace_id <> im.workspace_id
                or prl.product_id <> im.product_id or prl.unit <> im.unit
                or prl.quantity_scaled <> im.quantity_scaled)
              then 'missing_or_mismatched_receipt'
            when im.source_type = 'purchase_receipt_reversal'
              and (prr.id is null or original.id is null
                or im.reversal_of_movement_id <> original.id
                or im.quantity_scaled <> -original.quantity_scaled)
              then 'broken_receipt_reversal'
            when im.source_type = 'delivery_dispatch'
              and (dl.id is null or d.id is null
                or dl.product_id <> im.product_id or dl.unit <> im.unit
                or -dl.quantity_scaled <> im.quantity_scaled)
              then 'missing_or_mismatched_delivery_dispatch'
            when im.source_type = 'delivery_return'
              and (dr.id is null or drl.delivery_line_id is null or return_dl.id is null
                or return_dl.product_id <> im.product_id or return_dl.unit <> im.unit
                or drl.quantity_scaled <> im.quantity_scaled
                or original.id is null
                or original.source_type <> 'delivery_dispatch'
                or original.source_id <> dr.delivery_id
                or original.source_line_id <> drl.delivery_line_id)
              then 'broken_delivery_return'
            else null end as diagnostic
          from inventory_movements im
          left join purchase_receipt_lines prl
            on im.source_type = 'purchase_receipt'
            and prl.receipt_id = im.source_id and prl.id = im.source_line_id
          left join purchase_receipt_reversals prr
            on im.source_type = 'purchase_receipt_reversal' and prr.id = im.source_id
          left join inventory_movements original on original.id = im.reversal_of_movement_id
          left join delivery_lines dl
            on im.source_type = 'delivery_dispatch'
            and dl.workspace_id = im.workspace_id
            and dl.delivery_id = im.source_id and dl.id = im.source_line_id
          left join deliveries d
            on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
          left join delivery_returns dr
            on im.source_type = 'delivery_return'
            and dr.workspace_id = im.workspace_id and dr.id = im.source_id
          left join delivery_return_lines drl
            on drl.return_id = dr.id and drl.delivery_line_id = im.source_line_id
          left join delivery_lines return_dl
            on return_dl.workspace_id = im.workspace_id and return_dl.id = drl.delivery_line_id
          where im.workspace_id = ${workspaceId}::uuid
            and im.product_id = ${productId}::uuid and im.unit = ${unit}::unit
        `);
        return (rows as unknown as Array<{ diagnostic: string | null }>).flatMap((row) =>
          row.diagnostic === null ? [] : [row.diagnostic],
        );
      },
    },

    deliveryReads: {
      get: (workspaceId: string, deliveryId: string) =>
        readDeliveryDto(tx, workspaceId, deliveryId),
      async list(args: {
        workspaceId: string;
        saleId: string | null;
        status: typeof deliveries.$inferSelect.status | null;
        page: Page;
      }) {
        const filters: SQL[] = [eq(deliveries.workspaceId, args.workspaceId)];
        if (args.saleId !== null) filters.push(eq(deliveries.saleId, args.saleId));
        if (args.status !== null) filters.push(eq(deliveries.status, args.status));
        if (args.page.after !== null) {
          const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
          filters.push(sql`(${deliveries.transactionTime}, ${deliveries.recordedAt}, ${deliveries.id})
            < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
        }
        const rows = await tx
          .select()
          .from(deliveries)
          .where(and(...filters))
          .orderBy(
            desc(deliveries.transactionTime),
            desc(deliveries.recordedAt),
            desc(deliveries.id),
          )
          .limit(fetchLimit(args.page));
        const ids = rows.map((row) => row.id);
        const [lineRows, returnRows] =
          ids.length === 0
            ? [[], []]
            : await Promise.all([
                tx
                  .select()
                  .from(deliveryLines)
                  .where(
                    and(
                      eq(deliveryLines.workspaceId, args.workspaceId),
                      inArray(deliveryLines.deliveryId, ids),
                    ),
                  ),
                tx
                  .select()
                  .from(deliveryReturns)
                  .where(
                    and(
                      eq(deliveryReturns.workspaceId, args.workspaceId),
                      inArray(deliveryReturns.deliveryId, ids),
                    ),
                  ),
              ]);
        const returnIds = returnRows.map((row) => row.id);
        const returnLineRows =
          returnIds.length === 0
            ? []
            : await tx
                .select()
                .from(deliveryReturnLines)
                .where(inArray(deliveryReturnLines.returnId, returnIds));
        const loaded = rows.map((row) => {
          const deliveryLineRows = lineRows.filter((line) => line.deliveryId === row.id);
          const deliveryReturnRows = returnRows.filter((record) => record.deliveryId === row.id);
          return {
            id: row.id,
            workspaceId: row.workspaceId,
            saleId: row.saleId,
            status: row.status,
            lines: deliveryLineRows.map((line) => ({
              deliveryLineId: line.id,
              saleLineId: line.saleLineId,
              productId: line.productId,
              productName: line.productName,
              quantity: { valueScaled: line.quantityScaled, unit: line.unit },
              returnedQuantity: {
                valueScaled: returnLineRows
                  .filter((item) => item.deliveryLineId === line.id)
                  .reduce((sum, item) => sum + item.quantityScaled, 0),
                unit: line.unit,
              },
            })),
            note: row.note,
            cancellationReason: row.cancellationReason,
            version: row.version,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            dispatchedAt: toIsoOrNull(row.dispatchedAt),
            deliveredAt: toIsoOrNull(row.deliveredAt),
            returns: deliveryReturnRows.map((record) => ({
              id: record.id,
              reason: record.reason,
              lines: returnLineRows
                .filter((item) => item.returnId === record.id)
                .map((item) => ({
                  deliveryLineId: item.deliveryLineId,
                  quantity: { valueScaled: item.quantityScaled, unit: item.unit },
                })),
              transactionTime: toIso(record.transactionTime),
              recordedAt: toIso(record.recordedAt),
              actorId: record.actorId,
            })),
          };
        });
        return paged(loaded, args.page, (row) => ({
          sortValue: `${row.transactionTime}|${row.recordedAt}`,
          id: row.id,
        }));
      },
    },

    documentReads: {
      async get(workspaceId: string, documentId: string) {
        const rows = await tx
          .select()
          .from(documents)
          .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, documentId)))
          .limit(1);
        return rows[0] === undefined ? null : toDocumentDto(rows[0]);
      },
      async listBySource(workspaceId: string, sourceType: string, sourceId: string) {
        const rows = await tx
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.workspaceId, workspaceId),
              eq(documents.sourceType, sourceType as typeof documents.$inferSelect.sourceType),
              eq(documents.sourceId, sourceId),
            ),
          )
          .orderBy(desc(documents.version), desc(documents.id));
        return rows.map(toDocumentDto);
      },
      async publicByTokenHash(tokenHash: string, now: string) {
        const rows = await tx
          .select({ share: documentShares, document: documents })
          .from(documentShares)
          .innerJoin(documents, eq(documents.id, documentShares.documentId))
          .where(eq(documentShares.tokenHash, tokenHash))
          .limit(1);
        const row = rows[0];
        if (row === undefined) return { kind: "not_found" as const };
        if (row.share.revokedAt !== null) return { kind: "revoked" as const };
        if (row.share.expiresAt !== null && row.share.expiresAt < fromIso(now as never))
          return { kind: "expired" as const };
        return { kind: "found" as const, document: toDocumentDto(row.document) };
      },
    },

    reportReads: {
      async operational(args: {
        workspaceId: string;
        reportType:
          | "customer_account_activity"
          | "customer_receivables"
          | "supplier_payables"
          | "inventory_by_product_unit"
          | "inventory_movement_report"
          | "outstanding_delivery";
        businessDate: string | null;
        productId: string | null;
        unit: typeof inventoryMovements.$inferSelect.unit | null;
        page: Page;
      }) {
        type Row = {
          id: string;
          label: string;
          sourceType: string;
          sourceId: string;
          documentHref: string | null;
          transactionTime: string | null;
          amount: { amountMinor: number; currency: "VND" } | null;
          quantity: {
            valueScaled: number;
            unit: typeof inventoryMovements.$inferSelect.unit;
          } | null;
          status: string;
        };
        let rows: Row[] = [];
        const diagnostics: string[] = [];
        if (args.reportType === "customer_account_activity") {
          const entries = await tx
            .select()
            .from(customerAccountEntries)
            .where(eq(customerAccountEntries.workspaceId, args.workspaceId));
          const voidIds = entries
            .filter((entry) => entry.sourceType === "sale_void")
            .map((entry) => entry.sourceId);
          const reversalIds = entries
            .filter((entry) => entry.sourceType === "payment_reversal")
            .map((entry) => entry.sourceId);
          const [voidSources, reversalSources] = await Promise.all([
            voidIds.length === 0
              ? Promise.resolve([])
              : tx
                  .select({ id: saleVoids.id, saleId: saleVoids.saleId })
                  .from(saleVoids)
                  .where(
                    and(
                      eq(saleVoids.workspaceId, args.workspaceId),
                      inArray(saleVoids.id, voidIds),
                    ),
                  ),
            reversalIds.length === 0
              ? Promise.resolve([])
              : tx
                  .select({ id: paymentReversals.id, paymentId: paymentReversals.paymentId })
                  .from(paymentReversals)
                  .where(
                    and(
                      eq(paymentReversals.workspaceId, args.workspaceId),
                      inArray(paymentReversals.id, reversalIds),
                    ),
                  ),
          ]);
          rows = entries
            .filter(
              (entry) =>
                args.businessDate === null ||
                vietnamBusinessDate(entry.transactionTime) === args.businessDate,
            )
            .map((entry) => ({
              id: entry.id,
              label: entry.sourceType.replaceAll("_", " "),
              sourceType: entry.sourceType,
              sourceId: entry.sourceId,
              documentHref:
                entry.sourceType === "sale_posting"
                  ? `/sales/${entry.sourceId}`
                  : entry.sourceType === "sale_void"
                    ? `/sales/${voidSources.find((source) => source.id === entry.sourceId)?.saleId ?? entry.sourceId}`
                    : entry.sourceType === "payment"
                      ? `/payments/${entry.sourceId}`
                      : entry.sourceType === "payment_reversal"
                        ? `/payments/${reversalSources.find((source) => source.id === entry.sourceId)?.paymentId ?? entry.sourceId}`
                        : `/account-adjustments/${entry.sourceId}`,
              transactionTime: toIso(entry.transactionTime),
              amount: money(entry.amountMinor, entry.currency),
              quantity: null,
              status: "canonical",
            }));
        } else if (args.reportType === "customer_receivables") {
          const values = await tx
            .select({ balance: customerAccountBalances, customer: customers })
            .from(customerAccountBalances)
            .innerJoin(
              customers,
              and(
                eq(customers.workspaceId, customerAccountBalances.workspaceId),
                eq(customers.id, customerAccountBalances.customerId),
              ),
            )
            .where(eq(customerAccountBalances.workspaceId, args.workspaceId));
          rows = values
            .filter((value) => value.balance.balanceMinor > 0)
            .map(({ balance, customer }) => ({
              id: customer.id,
              label: customer.displayName,
              sourceType: "customer",
              sourceId: customer.id,
              documentHref: `/customers/${customer.id}`,
              transactionTime: toIsoOrNull(balance.lastEntryTransactionTime),
              amount: money(balance.balanceMinor, balance.currency),
              quantity: null,
              status: "receivable",
            }));
        } else if (args.reportType === "supplier_payables") {
          const values = await tx
            .select({ balance: supplierAccountBalances, supplier: suppliers })
            .from(supplierAccountBalances)
            .innerJoin(
              suppliers,
              and(
                eq(suppliers.workspaceId, supplierAccountBalances.workspaceId),
                eq(suppliers.id, supplierAccountBalances.supplierId),
              ),
            )
            .where(eq(supplierAccountBalances.workspaceId, args.workspaceId));
          rows = values
            .filter((value) => value.balance.balanceMinor > 0)
            .map(({ balance, supplier }) => ({
              id: supplier.id,
              label: supplier.displayName,
              sourceType: "supplier",
              sourceId: supplier.id,
              documentHref: `/suppliers/${supplier.id}`,
              transactionTime: toIsoOrNull(balance.lastEntryTransactionTime),
              amount: money(balance.balanceMinor, balance.currency),
              quantity: null,
              status: "payable",
            }));
        } else if (args.reportType === "inventory_by_product_unit") {
          const filters = [eq(inventoryBalances.workspaceId, args.workspaceId)];
          if (args.productId !== null)
            filters.push(eq(inventoryBalances.productId, args.productId));
          if (args.unit !== null) filters.push(eq(inventoryBalances.unit, args.unit));
          const values = await tx
            .select({ balance: inventoryBalances, product: products })
            .from(inventoryBalances)
            .innerJoin(
              products,
              and(
                eq(products.workspaceId, inventoryBalances.workspaceId),
                eq(products.id, inventoryBalances.productId),
              ),
            )
            .where(and(...filters));
          rows = values.map(({ balance, product }) => ({
            id: `${product.id}:${balance.unit}`,
            label: `${product.name} · ${balance.unit}`,
            sourceType: "product",
            sourceId: product.id,
            documentHref: `/products/${product.id}/inventory`,
            transactionTime: toIsoOrNull(balance.lastMovementTransactionTime),
            amount: null,
            quantity: { valueScaled: balance.quantityScaled, unit: balance.unit },
            status: classifyInventory(balance.quantityScaled),
          }));
        } else if (args.reportType === "inventory_movement_report") {
          const filters = [eq(inventoryMovements.workspaceId, args.workspaceId)];
          if (args.productId !== null)
            filters.push(eq(inventoryMovements.productId, args.productId));
          if (args.unit !== null) filters.push(eq(inventoryMovements.unit, args.unit));
          const values = await tx
            .select()
            .from(inventoryMovements)
            .where(and(...filters));
          const deliveryReturnIds = values
            .filter((movement) => movement.sourceType === "delivery_return")
            .map((movement) => movement.sourceId);
          const deliveryReturnSources =
            deliveryReturnIds.length === 0
              ? []
              : await tx
                  .select({ id: deliveryReturns.id, deliveryId: deliveryReturns.deliveryId })
                  .from(deliveryReturns)
                  .where(
                    and(
                      eq(deliveryReturns.workspaceId, args.workspaceId),
                      inArray(deliveryReturns.id, deliveryReturnIds),
                    ),
                  );
          const receiptReversalIds = values
            .filter((movement) => movement.sourceType === "purchase_receipt_reversal")
            .map((movement) => movement.sourceId);
          const receiptReversalSources =
            receiptReversalIds.length === 0
              ? []
              : await tx
                  .select({
                    id: purchaseReceiptReversals.id,
                    receiptId: purchaseReceiptReversals.receiptId,
                  })
                  .from(purchaseReceiptReversals)
                  .where(
                    and(
                      eq(purchaseReceiptReversals.workspaceId, args.workspaceId),
                      inArray(purchaseReceiptReversals.id, receiptReversalIds),
                    ),
                  );
          rows = values.map((movement) => ({
            id: movement.id,
            label: movement.sourceType.replaceAll("_", " "),
            sourceType: movement.sourceType,
            sourceId: movement.sourceId,
            documentHref: movement.sourceType.startsWith("delivery_")
              ? `/deliveries/${
                  movement.sourceType === "delivery_return"
                    ? (deliveryReturnSources.find((source) => source.id === movement.sourceId)
                        ?.deliveryId ?? movement.sourceId)
                    : movement.sourceId
                }`
              : movement.sourceType === "purchase_receipt"
                ? `/receipts/${movement.sourceId}`
                : movement.sourceType === "purchase_receipt_reversal"
                  ? `/receipts/${
                      receiptReversalSources.find((source) => source.id === movement.sourceId)
                        ?.receiptId ?? movement.sourceId
                    }`
                  : movement.sourceType === "inventory_adjustment"
                    ? `/inventory-adjustments/${movement.sourceId}`
                    : null,
            transactionTime: toIso(movement.transactionTime),
            amount: null,
            quantity: { valueScaled: movement.quantityScaled, unit: movement.unit },
            status: "canonical",
          }));
        } else {
          const values = await tx.execute(sql`
            with dispatched as (
              select dl.sale_line_id, sum(dl.quantity_scaled)::bigint quantity
              from delivery_lines dl
              join deliveries d
                on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
              where d.workspace_id=${args.workspaceId}::uuid
                and d.status in ('dispatched','delivered')
              group by dl.sale_line_id
            ), returned as (
              select dl.sale_line_id, sum(drl.quantity_scaled)::bigint quantity
              from delivery_return_lines drl
              join delivery_returns dr on dr.id=drl.return_id
              join delivery_lines dl on dl.id=drl.delivery_line_id
              where dr.workspace_id=${args.workspaceId}::uuid
              group by dl.sale_line_id
            )
            select s.id as sale_id, c.display_name,
              sl.id as sale_line_id, sl.product_name, sl.quantity_scaled, sl.unit,
              (coalesce(dispatched.quantity,0)-coalesce(returned.quantity,0))::bigint
                as net_fulfilled
            from sales s
            join customers c on c.workspace_id=s.workspace_id and c.id=s.customer_id
            join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
            left join dispatched on dispatched.sale_line_id=sl.id
            left join returned on returned.sale_line_id=sl.id
            where s.workspace_id=${args.workspaceId}::uuid and s.status='posted'
          `);
          rows = values.flatMap((value) => {
            const ordered = Number(value["quantity_scaled"]);
            const net = Number(value["net_fulfilled"]);
            return ordered - net <= 0
              ? []
              : [
                  {
                    id: String(value["sale_line_id"]),
                    label: `${String(value["display_name"])} · ${String(value["product_name"])}`,
                    sourceType: "sale",
                    sourceId: String(value["sale_id"]),
                    documentHref: `/sales/${String(value["sale_id"])}`,
                    transactionTime: null,
                    amount: null,
                    quantity: {
                      valueScaled: ordered - net,
                      unit: value["unit"] as typeof inventoryMovements.$inferSelect.unit,
                    },
                    status: "outstanding",
                  },
                ];
          });
        }
        rows.sort((a, b) => {
          const aKey = `${a.transactionTime ?? ""}|${a.id}`;
          const bKey = `${b.transactionTime ?? ""}|${b.id}`;
          return aKey < bKey ? 1 : aKey > bKey ? -1 : 0;
        });
        const allRows = rows;
        if (args.page.after !== null) {
          const boundary = `${args.page.after.sortValue}|${args.page.after.id}`;
          rows = rows.filter((row) => `${row.transactionTime ?? ""}|${row.id}` < boundary);
        }
        const visible = rows.slice(0, args.page.limit);
        const next =
          rows.length <= args.page.limit || visible.length === 0
            ? null
            : {
                sortValue: visible[visible.length - 1]!.transactionTime ?? "",
                id: visible[visible.length - 1]!.id,
              };
        const amountRows = allRows.flatMap((row) => (row.amount === null ? [] : [row.amount]));
        const quantityTotals = new Map<string, number>();
        for (const row of allRows) {
          if (row.quantity !== null)
            quantityTotals.set(
              row.quantity.unit,
              (quantityTotals.get(row.quantity.unit) ?? 0) + row.quantity.valueScaled,
            );
        }
        return {
          reportType: args.reportType,
          businessDate: args.businessDate,
          timezone: "Asia/Ho_Chi_Minh" as const,
          integrity: diagnostics.length === 0 ? ("healthy" as const) : ("attention" as const),
          diagnostics,
          totals: {
            amount:
              amountRows.length === 0
                ? null
                : money(
                    amountRows.reduce((sum, amount) => sum + amount.amountMinor, 0),
                    "VND",
                  ),
            quantities: [...quantityTotals.entries()].map(([unit, valueScaled]) => ({
              unit: unit as typeof inventoryMovements.$inferSelect.unit,
              valueScaled,
            })),
          },
          page: {
            items: visible,
            nextCursor: next === null ? null : encodeCursor(next),
          },
        };
      },
    },

    saleReads: {
      /** No `FOR UPDATE`: a screen refresh must not block a posting. */
      async get(workspaceId: string, saleId: string) {
        const rows = await tx
          .select()
          .from(sales)
          .where(and(eq(sales.workspaceId, workspaceId), eq(sales.id, saleId)))
          .limit(1);
        const row = rows[0];
        if (row === undefined) {
          return null;
        }

        const lineRows = await tx
          .select()
          .from(saleLines)
          .where(and(eq(saleLines.workspaceId, workspaceId), eq(saleLines.saleId, saleId)))
          .orderBy(asc(saleLines.position));

        const voidRows = await tx
          .select()
          .from(saleVoids)
          .where(and(eq(saleVoids.workspaceId, workspaceId), eq(saleVoids.saleId, saleId)))
          .limit(1);

        return toSaleState(row, lineRows, voidRows[0] ?? null);
      },

      async replacedBy(workspaceId: string, saleId: string) {
        const rows = await tx
          .select({ id: sales.id })
          .from(sales)
          .where(and(eq(sales.workspaceId, workspaceId), eq(sales.replacesSaleId, saleId)))
          .limit(1);
        return rows[0]?.id ?? null;
      },

      async list(args: {
        workspaceId: string;
        customerId: string | null;
        status: "draft" | "posted" | null;
        voided: boolean | null;
        from: string | null;
        to: string | null;
        page: Page;
      }) {
        const { workspaceId, customerId, status, voided, from, to, page } = args;
        const replacement = alias(sales, "replacement");

        const filters: SQL[] = [eq(sales.workspaceId, workspaceId)];
        if (customerId !== null) filters.push(eq(sales.customerId, customerId));
        if (status !== null) filters.push(eq(sales.status, status));
        if (from !== null) filters.push(gte(sales.transactionTime, fromIso(from as never)));
        if (to !== null) filters.push(lte(sales.transactionTime, fromIso(to as never)));
        // The financial state is derived from the void table (BR-SALE-013), so
        // filtering on it is a filter on the join, not on a column.
        if (voided === true) filters.push(sql`${saleVoids.id} IS NOT NULL`);
        if (voided === false) filters.push(sql`${saleVoids.id} IS NULL`);
        if (page.after !== null) {
          filters.push(
            sql`(${sales.transactionTime}, ${sales.id}) < (${page.after.sortValue}::timestamptz, ${page.after.id}::uuid)`,
          );
        }

        const rows = await tx
          .select({
            id: sales.id,
            workspaceId: sales.workspaceId,
            customerId: sales.customerId,
            customerDisplayName: customers.displayName,
            status: sales.status,
            voidId: saleVoids.id,
            totalAmountMinor: sales.totalAmountMinor,
            currency: sales.currency,
            version: sales.version,
            transactionTime: sales.transactionTime,
            recordedAt: sales.recordedAt,
            postedAt: sales.postedAt,
            discardedAt: sales.discardedAt,
            dueAt: sales.dueAt,
            replacesSaleId: sales.replacesSaleId,
            replacedBySaleId: replacement.id,
            // A correlated count rather than a join and a GROUP BY: it keeps the
            // page query flat, and it is one index probe per returned row inside
            // the same statement — not a round trip per row.
            lineCount: sql<number>`(
              SELECT count(*)::int FROM ${saleLines}
              WHERE ${saleLines.saleId} = ${sales.id}
            )`,
          })
          .from(sales)
          .innerJoin(customers, eq(customers.id, sales.customerId))
          .leftJoin(
            saleVoids,
            and(eq(saleVoids.workspaceId, sales.workspaceId), eq(saleVoids.saleId, sales.id)),
          )
          .leftJoin(
            replacement,
            and(
              eq(replacement.workspaceId, sales.workspaceId),
              eq(replacement.replacesSaleId, sales.id),
            ),
          )
          .where(and(...filters))
          .orderBy(desc(sales.transactionTime), desc(sales.id))
          .limit(fetchLimit(page));

        return paged(
          rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            customerId: row.customerId,
            customerDisplayName: row.customerDisplayName,
            status: row.status,
            isVoided: row.voidId !== null,
            totalAmount: money(row.totalAmountMinor, row.currency),
            lineCount: row.lineCount,
            version: row.version,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            postedAt: toIsoOrNull(row.postedAt),
            discardedAt: toIsoOrNull(row.discardedAt),
            dueAt: toIsoOrNull(row.dueAt),
            replacesSaleId: row.replacesSaleId,
            replacedBySaleId: row.replacedBySaleId,
          })),
          page,
          (row) => ({ sortValue: row.transactionTime, id: row.id }),
        );
      },

      async captureContext({
        workspaceId,
        customerId,
        query,
        limit,
      }: {
        workspaceId: string;
        customerId: string;
        query: string;
        limit: number;
      }) {
        const filters: SQL[] = [
          eq(sales.workspaceId, workspaceId),
          eq(sales.status, "posted"),
          sql`${saleVoids.id} IS NULL`,
        ];
        if (query.length > 0) {
          filters.push(
            sql`vuarau_fold(${saleLines.productName}) ILIKE vuarau_fold(${`%${query}%`})`,
          );
        }
        const rows = await tx
          .select({
            customerId: sales.customerId,
            saleId: sales.id,
            transactionTime: sales.transactionTime,
            productName: saleLines.productName,
            unit: saleLines.unit,
            unitPriceMinor: saleLines.unitPriceMinor,
            currency: saleLines.currency,
            position: saleLines.position,
          })
          .from(saleLines)
          .innerJoin(sales, eq(sales.id, saleLines.saleId))
          .leftJoin(saleVoids, eq(saleVoids.saleId, sales.id))
          .where(and(...filters))
          .orderBy(desc(sales.transactionTime), desc(sales.id), asc(saleLines.position));

        const customerHistory = [] as Array<{
          productName: string;
          unit: string;
          lastUnitPrice: ReturnType<typeof money>;
          lastTransactionTime: string;
          sourceSaleId: string;
        }>;
        const workspaceHistory = [] as Array<{ productName: string; unit: string }>;
        const customerSeen = new Set<string>();
        const workspaceSeen = new Set<string>();
        for (const row of rows) {
          const identity = `${row.productName}\u0000${row.unit}`;
          if (!workspaceSeen.has(identity) && workspaceHistory.length < limit) {
            workspaceSeen.add(identity);
            workspaceHistory.push({ productName: row.productName, unit: row.unit });
          }
          if (
            row.customerId === customerId &&
            !customerSeen.has(identity) &&
            customerHistory.length < limit
          ) {
            customerSeen.add(identity);
            customerHistory.push({
              productName: row.productName,
              unit: row.unit,
              lastUnitPrice: money(row.unitPriceMinor, row.currency),
              lastTransactionTime: toIso(row.transactionTime),
              sourceSaleId: row.saleId,
            });
          }
          if (customerHistory.length >= limit && workspaceHistory.length >= limit) break;
        }
        return { customerHistory, workspaceHistory };
      },
    },

    paymentReads: {
      async get(workspaceId: string, paymentId: string) {
        const rows = await paymentSelect(tx)
          .where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, paymentId)))
          .limit(1);
        return rows[0] === undefined ? null : toPaymentSummary(rows[0]);
      },

      async list(args: {
        workspaceId: string;
        customerId: string | null;
        status: "recorded" | "partially_reversed" | "reversed" | null;
        from: string | null;
        to: string | null;
        page: Page;
      }) {
        const { workspaceId, customerId, status, from, to, page } = args;

        const filters: SQL[] = [eq(payments.workspaceId, workspaceId)];
        if (customerId !== null) filters.push(eq(payments.customerId, customerId));
        if (status !== null) filters.push(eq(payments.status, status));
        if (from !== null) filters.push(gte(payments.transactionTime, fromIso(from as never)));
        if (to !== null) filters.push(lte(payments.transactionTime, fromIso(to as never)));
        if (page.after !== null) {
          filters.push(
            sql`(${payments.transactionTime}, ${payments.id}) < (${page.after.sortValue}::timestamptz, ${page.after.id}::uuid)`,
          );
        }

        const rows = await paymentSelect(tx)
          .where(and(...filters))
          .orderBy(desc(payments.transactionTime), desc(payments.id))
          .limit(fetchLimit(page));

        return paged(rows.map(toPaymentSummary), page, (row) => ({
          sortValue: row.transactionTime,
          id: row.id,
        }));
      },
    },

    accountReads: {
      async adjustmentDetail({
        workspaceId,
        adjustmentId,
      }: {
        workspaceId: string;
        adjustmentId: string;
      }) {
        const ranked = tx.$with("ranked").as(
          tx
            .select({
              id: customerAccountEntries.id,
              workspaceId: customerAccountEntries.workspaceId,
              customerId: customerAccountEntries.customerId,
              amountMinor: customerAccountEntries.amountMinor,
              currency: customerAccountEntries.currency,
              reasonCode: customerAccountEntries.reasonCode,
              reason: customerAccountEntries.reason,
              transactionTime: customerAccountEntries.transactionTime,
              recordedAt: customerAccountEntries.recordedAt,
              actorId: customerAccountEntries.actorId,
              commandId: customerAccountEntries.commandId,
              sourceType: customerAccountEntries.sourceType,
              sourceId: customerAccountEntries.sourceId,
              runningBalanceMinor:
                sql<number>`sum(${customerAccountEntries.amountMinor}) over (partition by ${customerAccountEntries.workspaceId}, ${customerAccountEntries.customerId} order by ${customerAccountEntries.transactionTime}, ${customerAccountEntries.recordedAt}, ${customerAccountEntries.id})::bigint`.as(
                  "running_balance_minor",
                ),
            })
            .from(customerAccountEntries),
        );
        const [row] = await tx
          .with(ranked)
          .select({
            adjustmentId: ranked.sourceId,
            entryId: ranked.id,
            commandId: ranked.commandId,
            workspaceId: workspaces.id,
            workspaceName: workspaces.name,
            customerId: customers.id,
            customerName: customers.displayName,
            actorId: actors.id,
            actorName: actors.displayName,
            amountMinor: ranked.amountMinor,
            currency: ranked.currency,
            reasonCode: ranked.reasonCode,
            reason: ranked.reason,
            transactionTime: ranked.transactionTime,
            recordedAt: ranked.recordedAt,
            runningBalanceMinor: ranked.runningBalanceMinor,
          })
          .from(ranked)
          // The ledger entry is the record we are looking up. Keep it visible
          // when a referenced row has been damaged or removed, so this read can
          // report an integrity failure instead of incorrectly calling it absent.
          .leftJoin(customers, eq(customers.id, ranked.customerId))
          .leftJoin(workspaces, eq(workspaces.id, ranked.workspaceId))
          .leftJoin(actors, eq(actors.id, ranked.actorId))
          .where(
            and(
              eq(ranked.workspaceId, workspaceId),
              eq(ranked.sourceType, "manual_adjustment"),
              eq(ranked.sourceId, adjustmentId),
            ),
          )
          .limit(1);
        if (row === undefined) return { kind: "not_found" as const };
        if (
          row.reasonCode === null ||
          row.reason === null ||
          row.reason.trim().length === 0 ||
          row.amountMinor === 0
        )
          return { kind: "integrity_error" as const, reason: "missing adjustment fields" };
        if (
          row.workspaceId === null ||
          row.workspaceName === null ||
          row.customerId === null ||
          row.customerName === null ||
          row.actorId === null ||
          row.actorName === null
        )
          return { kind: "integrity_error" as const, reason: "missing joined record" };
        return {
          kind: "found" as const,
          row: {
            adjustmentId: row.adjustmentId,
            entryId: row.entryId,
            commandId: row.commandId,
            workspace: { id: row.workspaceId, name: row.workspaceName },
            customer: { id: row.customerId, displayName: row.customerName },
            actor: { id: row.actorId, displayName: row.actorName },
            amount: money(row.amountMinor, row.currency),
            reasonCode: row.reasonCode,
            reason: row.reason,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            runningBalance: money(Number(row.runningBalanceMinor), row.currency),
          },
        };
      },
      async timeline(args: {
        workspaceId: string;
        customerId: string;
        from: string | null;
        to: string | null;
        page: Page;
      }) {
        const { workspaceId, customerId, from, to, page } = args;

        const ranked = tx.$with("ranked_account_entries").as(
          tx
            .select({
              id: customerAccountEntries.id,
              workspaceId: customerAccountEntries.workspaceId,
              customerId: customerAccountEntries.customerId,
              amountMinor: customerAccountEntries.amountMinor,
              currency: customerAccountEntries.currency,
              sourceType: customerAccountEntries.sourceType,
              sourceId: customerAccountEntries.sourceId,
              reversalOfEntryId: customerAccountEntries.reversalOfEntryId,
              reasonCode: customerAccountEntries.reasonCode,
              reason: customerAccountEntries.reason,
              transactionTime: customerAccountEntries.transactionTime,
              recordedAt: customerAccountEntries.recordedAt,
              actorId: customerAccountEntries.actorId,
              commandId: customerAccountEntries.commandId,
              runningBalanceMinor:
                sql<number>`sum(${customerAccountEntries.amountMinor}) over (order by ${customerAccountEntries.transactionTime}, ${customerAccountEntries.recordedAt}, ${customerAccountEntries.id})::bigint`.as(
                  "running_balance_minor",
                ),
            })
            .from(customerAccountEntries)
            .where(
              and(
                eq(customerAccountEntries.workspaceId, workspaceId),
                eq(customerAccountEntries.customerId, customerId),
              ),
            ),
        );
        const filters: SQL[] = [];
        if (from !== null) {
          filters.push(gte(ranked.transactionTime, fromIso(from as never)));
        }
        if (to !== null) {
          filters.push(lte(ranked.transactionTime, fromIso(to as never)));
        }
        if (page.after !== null) {
          filters.push(
            sql`(${ranked.transactionTime}, ${ranked.recordedAt}, ${ranked.id}) < (split_part(${page.after.sortValue}, '|', 1)::timestamptz, split_part(${page.after.sortValue}, '|', 2)::timestamptz, ${page.after.id}::uuid)`,
          );
        }

        /**
         * The running balance is a window over the customer's **whole** history in
         * business-time order, so an entry shows the same balance whichever page it
         * lands on. Computed here rather than by summing a page client-side: a page
         * is a slice, and a slice cannot know what came before it.
         *
         * The window is evaluated over the partition, not the page, so this is O(n)
         * in the customer's entries per request. At a depot's scale — hundreds to
         * low thousands per customer — that is the right trade for a number that
         * must never disagree with the balance projection. If a customer's history
         * ever makes it hurt, the fix is a stored running total, not a client-side
         * sum.
         */
        const rows = await tx
          .with(ranked)
          .select({
            id: ranked.id,
            workspaceId: ranked.workspaceId,
            customerId: ranked.customerId,
            amountMinor: ranked.amountMinor,
            currency: ranked.currency,
            sourceType: ranked.sourceType,
            sourceId: ranked.sourceId,
            reversalOfEntryId: ranked.reversalOfEntryId,
            reasonCode: ranked.reasonCode,
            reason: ranked.reason,
            transactionTime: ranked.transactionTime,
            recordedAt: ranked.recordedAt,
            actorId: ranked.actorId,
            commandId: ranked.commandId,
            runningBalanceMinor: ranked.runningBalanceMinor,
            saleTotalMinor: sales.totalAmountMinor,
            saleTransactionTime: sales.transactionTime,
            voidSaleId: saleVoids.saleId,
            voidReasonCode: saleVoids.reasonCode,
            paymentMethod: payments.method,
            reversalPaymentId: paymentReversals.paymentId,
            reversalAmountMinor: paymentReversals.amountMinor,
          })
          .from(ranked)
          // One LEFT JOIN per source kind, resolved in the page query. The
          // alternative is a lookup per entry, which is the N+1 this port forbids.
          .leftJoin(sales, eq(sales.id, ranked.sourceId))
          .leftJoin(saleVoids, eq(saleVoids.id, ranked.sourceId))
          .leftJoin(payments, eq(payments.id, ranked.sourceId))
          .leftJoin(paymentReversals, eq(paymentReversals.id, ranked.sourceId))
          .where(and(...filters))
          .orderBy(desc(ranked.transactionTime), desc(ranked.recordedAt), desc(ranked.id))
          .limit(fetchLimit(page));

        return paged(
          rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            customerId: row.customerId,
            amount: money(row.amountMinor, row.currency),
            runningBalance: money(Number(row.runningBalanceMinor), row.currency),
            source: {
              type: row.sourceType,
              id: row.sourceId,
              document: sourceDocument(row),
              label: sourceLabel(row),
            },
            reversalOfEntryId: row.reversalOfEntryId,
            reasonCode: row.reasonCode,
            reason: row.reason,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            actorId: row.actorId,
            commandId: row.commandId,
          })),
          page,
          (row) => ({ sortValue: `${row.transactionTime}|${row.recordedAt}`, id: row.id }),
        );
      },

      async sourceObservations(args: { workspaceId: string; customerId: string }) {
        const postingSale = alias(sales, "reconciliation_posting_sale");
        const voidRecord = alias(saleVoids, "reconciliation_sale_void");
        const voidSale = alias(sales, "reconciliation_void_sale");
        const sourcePayment = alias(payments, "reconciliation_payment");
        const reversal = alias(paymentReversals, "reconciliation_payment_reversal");
        const reversedPayment = alias(payments, "reconciliation_reversed_payment");
        const reversalTarget = alias(customerAccountEntries, "reconciliation_reversal_target");

        const rows = await tx
          .select({
            entryId: customerAccountEntries.id,
            sourceType: customerAccountEntries.sourceType,
            sourceId: customerAccountEntries.sourceId,
            sourceExists: sql<boolean>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.id} IS NOT NULL
              WHEN 'sale_void' THEN ${voidRecord.id} IS NOT NULL
              WHEN 'payment' THEN ${sourcePayment.id} IS NOT NULL
              WHEN 'payment_reversal' THEN ${reversal.id} IS NOT NULL
              WHEN 'manual_adjustment' THEN true
              ELSE false
            END`,
            sourceWorkspaceId: sql<string | null>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.workspaceId}
              WHEN 'sale_void' THEN ${voidRecord.workspaceId}
              WHEN 'payment' THEN ${sourcePayment.workspaceId}
              WHEN 'payment_reversal' THEN ${reversal.workspaceId}
              WHEN 'manual_adjustment' THEN ${customerAccountEntries.workspaceId}
              ELSE NULL
            END`,
            sourceCustomerId: sql<string | null>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.customerId}
              WHEN 'sale_void' THEN ${voidSale.customerId}
              WHEN 'payment' THEN ${sourcePayment.customerId}
              WHEN 'payment_reversal' THEN ${reversedPayment.customerId}
              WHEN 'manual_adjustment' THEN ${customerAccountEntries.customerId}
              ELSE NULL
            END`,
            expectedAmountMinor: sql<number | null>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.totalAmountMinor}
              WHEN 'sale_void' THEN -${voidRecord.amountMinor}
              WHEN 'payment' THEN -${sourcePayment.amountMinor}
              WHEN 'payment_reversal' THEN ${reversal.amountMinor}
              WHEN 'manual_adjustment' THEN ${customerAccountEntries.amountMinor}
              ELSE NULL
            END`,
            expectedCurrency: sql<"VND" | null>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.currency}
              WHEN 'sale_void' THEN ${voidRecord.currency}
              WHEN 'payment' THEN ${sourcePayment.currency}
              WHEN 'payment_reversal' THEN ${reversal.currency}
              WHEN 'manual_adjustment' THEN ${customerAccountEntries.currency}
              ELSE NULL
            END`,
            reversalOfEntryId: customerAccountEntries.reversalOfEntryId,
            reversalTargetId: reversalTarget.id,
          })
          .from(customerAccountEntries)
          .leftJoin(postingSale, eq(postingSale.id, customerAccountEntries.sourceId))
          .leftJoin(voidRecord, eq(voidRecord.id, customerAccountEntries.sourceId))
          .leftJoin(voidSale, eq(voidSale.id, voidRecord.saleId))
          .leftJoin(sourcePayment, eq(sourcePayment.id, customerAccountEntries.sourceId))
          .leftJoin(reversal, eq(reversal.id, customerAccountEntries.sourceId))
          .leftJoin(reversedPayment, eq(reversedPayment.id, reversal.paymentId))
          .leftJoin(reversalTarget, eq(reversalTarget.id, customerAccountEntries.reversalOfEntryId))
          .where(
            and(
              eq(customerAccountEntries.workspaceId, args.workspaceId),
              eq(customerAccountEntries.customerId, args.customerId),
            ),
          )
          .orderBy(
            asc(customerAccountEntries.transactionTime),
            asc(customerAccountEntries.recordedAt),
            asc(customerAccountEntries.id),
          );

        return rows.map((row) => ({
          entryId: row.entryId,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          sourceExists: row.sourceExists,
          sourceWorkspaceId: row.sourceWorkspaceId,
          sourceCustomerId: row.sourceCustomerId,
          expectedAmount:
            row.expectedAmountMinor === null || row.expectedCurrency === null
              ? null
              : money(Number(row.expectedAmountMinor), row.expectedCurrency),
          reversalTargetExists: row.reversalOfEntryId === null || row.reversalTargetId !== null,
        }));
      },
    },

    operationsReads: {
      async integrity(workspaceId: string) {
        const rows = await tx.execute(sql`
          WITH ledger AS (
            SELECT workspace_id, customer_id, sum(amount_minor)::bigint AS ledger_minor
            FROM ${customerAccountEntries}
            WHERE workspace_id = ${workspaceId}::uuid
            GROUP BY workspace_id, customer_id
          ),
          projection_anomalies AS (
            SELECT c.id AS customer_id
            FROM ${customers} c
            LEFT JOIN ${customerAccountBalances} b
              ON b.workspace_id = c.workspace_id AND b.customer_id = c.id
            LEFT JOIN ledger l
              ON l.workspace_id = c.workspace_id AND l.customer_id = c.id
            WHERE c.workspace_id = ${workspaceId}::uuid
              AND coalesce(b.balance_minor, 0) <> coalesce(l.ledger_minor, 0)
          ),
          source_checks AS (
            SELECT
              e.customer_id,
              e.source_type,
              e.source_id,
              CASE e.source_type
                WHEN 'sale_posting' THEN
                  posting_sale.id IS NOT NULL
                  AND posting_sale.workspace_id = e.workspace_id
                  AND posting_sale.customer_id = e.customer_id
                  AND posting_sale.status = 'posted'
                  AND posting_sale.total_amount_minor = e.amount_minor
                  AND posting_sale.currency = e.currency
                WHEN 'sale_void' THEN
                  void_record.id IS NOT NULL
                  AND void_record.workspace_id = e.workspace_id
                  AND void_sale.customer_id = e.customer_id
                  AND -void_record.amount_minor = e.amount_minor
                  AND void_record.currency = e.currency
                WHEN 'payment' THEN
                  source_payment.id IS NOT NULL
                  AND source_payment.workspace_id = e.workspace_id
                  AND source_payment.customer_id = e.customer_id
                  AND -source_payment.amount_minor = e.amount_minor
                  AND source_payment.currency = e.currency
                WHEN 'payment_reversal' THEN
                  reversal.id IS NOT NULL
                  AND reversal.workspace_id = e.workspace_id
                  AND reversed_payment.customer_id = e.customer_id
                  AND reversal.amount_minor = e.amount_minor
                  AND reversal.currency = e.currency
                WHEN 'manual_adjustment' THEN
                  e.amount_minor <> 0
                  AND nullif(btrim(e.reason), '') IS NOT NULL
                ELSE false
              END AS source_valid
            FROM ${customerAccountEntries} e
            LEFT JOIN ${sales} posting_sale
              ON posting_sale.id = e.source_id AND e.source_type = 'sale_posting'
            LEFT JOIN ${saleVoids} void_record
              ON void_record.id = e.source_id AND e.source_type = 'sale_void'
            LEFT JOIN ${sales} void_sale ON void_sale.id = void_record.sale_id
            LEFT JOIN ${payments} source_payment
              ON source_payment.id = e.source_id AND e.source_type = 'payment'
            LEFT JOIN ${paymentReversals} reversal
              ON reversal.id = e.source_id AND e.source_type = 'payment_reversal'
            LEFT JOIN ${payments} reversed_payment ON reversed_payment.id = reversal.payment_id
            WHERE e.workspace_id = ${workspaceId}::uuid
          ),
          duplicate_groups AS (
            SELECT
              source_type,
              source_id,
              min(customer_id::text)::uuid AS customer_id,
              count(*)::int AS source_count
            FROM source_checks
            GROUP BY source_type, source_id
            HAVING count(*) > 1
          ),
          anomalous_customers AS (
            SELECT customer_id FROM projection_anomalies
            UNION
            SELECT customer_id FROM source_checks WHERE NOT source_valid
            UNION
            SELECT customer_id FROM duplicate_groups
          )
          SELECT
            (SELECT count(*)::int FROM ${customers}
              WHERE workspace_id = ${workspaceId}::uuid) AS customer_count,
            (SELECT count(*)::int FROM projection_anomalies) AS projection_drift,
            (SELECT count(*)::int FROM source_checks WHERE NOT source_valid) AS missing_sources,
            (SELECT coalesce(sum(source_count - 1), 0)::int FROM duplicate_groups)
              AS duplicate_sources,
            (SELECT count(*)::int FROM anomalous_customers) AS anomalous_customers
        `);
        const row = rows[0] as
          | {
              customer_count: number;
              projection_drift: number;
              missing_sources: number;
              duplicate_sources: number;
              anomalous_customers: number;
            }
          | undefined;
        const customerCount = Number(row?.customer_count ?? 0);
        const projectionDrift = Number(row?.projection_drift ?? 0);
        const missingSources = Number(row?.missing_sources ?? 0);
        const duplicateSources = Number(row?.duplicate_sources ?? 0);
        const anomalousCustomers = Number(row?.anomalous_customers ?? 0);
        const goodsRows = await tx.execute(sql`
          WITH supplier_ledger AS (
            SELECT supplier_id, sum(amount_minor)::bigint balance_minor, count(*)::int entry_count
            FROM ${supplierAccountEntries}
            WHERE workspace_id = ${workspaceId}::uuid
            GROUP BY supplier_id
          ),
          supplier_projection_anomalies AS (
            SELECT s.id
            FROM ${suppliers} s
            LEFT JOIN supplier_ledger l ON l.supplier_id = s.id
            LEFT JOIN ${supplierAccountBalances} b
              ON b.workspace_id = s.workspace_id AND b.supplier_id = s.id
            WHERE s.workspace_id = ${workspaceId}::uuid
              AND (
                coalesce(l.balance_minor, 0) <> coalesce(b.balance_minor, 0)
                OR coalesce(l.entry_count, 0) <> coalesce(b.entry_count, 0)
              )
          ),
          supplier_source_anomalies AS (
            SELECT DISTINCT sae.supplier_id AS id
            FROM ${supplierAccountEntries} sae
            LEFT JOIN ${supplierPayments} sp
              ON sae.source_type = 'supplier_payment' AND sp.id = sae.source_id
            LEFT JOIN ${supplierPaymentReversals} spr
              ON sae.source_type = 'supplier_payment_reversal' AND spr.id = sae.source_id
            LEFT JOIN ${purchases} p
              ON sae.source_type = 'purchase_confirmation' AND p.id = sae.source_id
            LEFT JOIN ${purchaseVoids} pv
              ON sae.source_type = 'purchase_void' AND pv.id = sae.source_id
            WHERE sae.workspace_id = ${workspaceId}::uuid
              AND (
                sae.amount_minor = 0
                OR (sae.source_type = 'manual_adjustment'
                  AND (sae.reason_code IS NULL OR nullif(btrim(sae.reason), '') IS NULL))
                OR (sae.source_type = 'supplier_payment' AND sp.id IS NULL)
                OR (sae.source_type = 'supplier_payment_reversal' AND spr.id IS NULL)
                OR (sae.source_type = 'purchase_confirmation' AND p.id IS NULL)
                OR (sae.source_type = 'purchase_void' AND pv.id IS NULL)
              )
          ),
          supplier_anomalies AS (
            SELECT id FROM supplier_projection_anomalies
            UNION SELECT id FROM supplier_source_anomalies
          ),
          inventory_ledger AS (
            SELECT product_id, unit, sum(quantity_scaled)::bigint quantity_scaled,
                   count(*)::int movement_count
            FROM ${inventoryMovements}
            WHERE workspace_id = ${workspaceId}::uuid
            GROUP BY product_id, unit
          ),
          inventory_projection_anomalies AS (
            SELECT l.product_id, l.unit
            FROM inventory_ledger l
            LEFT JOIN ${inventoryBalances} b
              ON b.workspace_id = ${workspaceId}::uuid
              AND b.product_id = l.product_id AND b.unit = l.unit
            WHERE b.product_id IS NULL
              OR b.quantity_scaled <> l.quantity_scaled
              OR b.movement_count <> l.movement_count
          ),
          inventory_source_anomalies AS (
            SELECT DISTINCT im.product_id, im.unit
            FROM ${inventoryMovements} im
            LEFT JOIN ${purchaseReceipts} pr
              ON im.source_type = 'purchase_receipt' AND pr.id = im.source_id
            LEFT JOIN ${purchaseReceiptReversals} prr
              ON im.source_type = 'purchase_receipt_reversal' AND prr.id = im.source_id
            LEFT JOIN ${deliveryLines} dl
              ON im.source_type = 'delivery_dispatch'
              AND dl.workspace_id = im.workspace_id
              AND dl.delivery_id = im.source_id AND dl.id = im.source_line_id
            LEFT JOIN ${deliveries} d
              ON d.workspace_id = dl.workspace_id AND d.id = dl.delivery_id
            LEFT JOIN ${deliveryReturns} dr
              ON im.source_type = 'delivery_return'
              AND dr.workspace_id = im.workspace_id AND dr.id = im.source_id
            LEFT JOIN ${deliveryReturnLines} drl
              ON drl.return_id = dr.id AND drl.delivery_line_id = im.source_line_id
            LEFT JOIN ${deliveryLines} return_dl
              ON return_dl.workspace_id = im.workspace_id
              AND return_dl.id = drl.delivery_line_id
            LEFT JOIN ${inventoryMovements} original
              ON original.id = im.reversal_of_movement_id
            WHERE im.workspace_id = ${workspaceId}::uuid
              AND (
                im.quantity_scaled = 0
                OR (im.source_type = 'inventory_adjustment'
                  AND (im.reason_code IS NULL OR nullif(btrim(im.reason), '') IS NULL))
                OR (im.source_type = 'purchase_receipt' AND pr.id IS NULL)
                OR (im.source_type = 'purchase_receipt_reversal' AND prr.id IS NULL)
                OR (im.source_type = 'delivery_dispatch'
                  AND (d.id IS NULL OR dl.id IS NULL
                    OR dl.product_id <> im.product_id OR dl.unit <> im.unit
                    OR -dl.quantity_scaled <> im.quantity_scaled))
                OR (im.source_type = 'delivery_return'
                  AND (dr.id IS NULL OR drl.delivery_line_id IS NULL
                    OR return_dl.id IS NULL
                    OR return_dl.product_id <> im.product_id
                    OR return_dl.unit <> im.unit
                    OR drl.quantity_scaled <> im.quantity_scaled
                    OR original.id IS NULL
                    OR original.source_type <> 'delivery_dispatch'
                    OR original.source_id <> dr.delivery_id
                    OR original.source_line_id <> drl.delivery_line_id))
              )
          ),
          inventory_anomalies AS (
            SELECT product_id, unit FROM inventory_projection_anomalies
            UNION SELECT product_id, unit FROM inventory_source_anomalies
          )
          SELECT
            (SELECT count(*)::int FROM ${suppliers}
              WHERE workspace_id = ${workspaceId}::uuid) supplier_count,
            (SELECT count(*)::int FROM supplier_anomalies) anomalous_suppliers,
            (SELECT count(*)::int FROM inventory_anomalies) anomalous_inventory_keys
        `);
        const goods = goodsRows[0] as
          | {
              supplier_count?: number;
              anomalous_suppliers?: number;
              anomalous_inventory_keys?: number;
            }
          | undefined;
        const supplierCount = Number(goods?.supplier_count ?? 0);
        const anomalousSuppliers = Number(goods?.anomalous_suppliers ?? 0);
        const anomalousInventoryKeys = Number(goods?.anomalous_inventory_keys ?? 0);
        return {
          workspaceId,
          healthyCustomers: customerCount - anomalousCustomers,
          anomalousCustomers,
          missingSources,
          duplicateSources,
          projectionDrift,
          healthySuppliers: supplierCount - anomalousSuppliers,
          anomalousSuppliers,
          anomalousInventoryKeys,
          status:
            anomalousCustomers === 0 && anomalousSuppliers === 0 && anomalousInventoryKeys === 0
              ? ("healthy" as const)
              : ("attention" as const),
        };
      },
      async backupPayload(workspaceId: string) {
        const workspace = await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1);
        if (workspace[0] === undefined) return null;
        const [
          membershipRows,
          customerRows,
          productRows,
          saleRows,
          saleLineRows,
          saleVoidRows,
          paymentRows,
          reversalRows,
          entryRows,
          auditRows,
          receiptRows,
          supplierRows,
          supplierPaymentRows,
          supplierPaymentReversalRows,
          supplierEntryRows,
          purchaseRows,
          purchaseLineRows,
          purchaseVoidRows,
          purchaseReceiptRows,
          purchaseReceiptLineRows,
          purchaseReceiptReversalRows,
          inventoryMovementRows,
          deliveryRows,
          deliveryLineRows,
          deliveryReturnRows,
          deliveryReturnLineRows,
          documentRows,
          documentShareRows,
        ] = await Promise.all([
          tx
            .select()
            .from(workspaceMemberships)
            .where(eq(workspaceMemberships.workspaceId, workspaceId)),
          tx.select().from(customers).where(eq(customers.workspaceId, workspaceId)),
          tx.select().from(products).where(eq(products.workspaceId, workspaceId)),
          tx.select().from(sales).where(eq(sales.workspaceId, workspaceId)),
          tx.select().from(saleLines).where(eq(saleLines.workspaceId, workspaceId)),
          tx.select().from(saleVoids).where(eq(saleVoids.workspaceId, workspaceId)),
          tx.select().from(payments).where(eq(payments.workspaceId, workspaceId)),
          tx.select().from(paymentReversals).where(eq(paymentReversals.workspaceId, workspaceId)),
          tx
            .select()
            .from(customerAccountEntries)
            .where(eq(customerAccountEntries.workspaceId, workspaceId)),
          tx.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId)),
          tx
            .select()
            .from(commandReceipts)
            .where(
              and(
                eq(commandReceipts.workspaceId, workspaceId),
                /*
                 * An export receipt contains the exported document as its
                 * idempotent result. Including it in the next export recursively
                 * embeds the previous backup and makes every generation larger.
                 * The audit row remains part of the logical backup; only this
                 * transport receipt is excluded.
                 */
                ne(commandReceipts.commandType, "ExportWorkspaceBackup"),
              ),
            ),
          tx.select().from(suppliers).where(eq(suppliers.workspaceId, workspaceId)),
          tx.select().from(supplierPayments).where(eq(supplierPayments.workspaceId, workspaceId)),
          tx
            .select()
            .from(supplierPaymentReversals)
            .where(eq(supplierPaymentReversals.workspaceId, workspaceId)),
          tx
            .select()
            .from(supplierAccountEntries)
            .where(eq(supplierAccountEntries.workspaceId, workspaceId)),
          tx.select().from(purchases).where(eq(purchases.workspaceId, workspaceId)),
          tx.select().from(purchaseLines).where(eq(purchaseLines.workspaceId, workspaceId)),
          tx.select().from(purchaseVoids).where(eq(purchaseVoids.workspaceId, workspaceId)),
          tx.select().from(purchaseReceipts).where(eq(purchaseReceipts.workspaceId, workspaceId)),
          tx
            .select()
            .from(purchaseReceiptLines)
            .where(eq(purchaseReceiptLines.workspaceId, workspaceId)),
          tx
            .select()
            .from(purchaseReceiptReversals)
            .where(eq(purchaseReceiptReversals.workspaceId, workspaceId)),
          tx
            .select()
            .from(inventoryMovements)
            .where(eq(inventoryMovements.workspaceId, workspaceId)),
          tx.select().from(deliveries).where(eq(deliveries.workspaceId, workspaceId)),
          tx.select().from(deliveryLines).where(eq(deliveryLines.workspaceId, workspaceId)),
          tx.select().from(deliveryReturns).where(eq(deliveryReturns.workspaceId, workspaceId)),
          tx
            .select({ line: deliveryReturnLines })
            .from(deliveryReturnLines)
            .innerJoin(deliveryReturns, eq(deliveryReturns.id, deliveryReturnLines.returnId))
            .where(eq(deliveryReturns.workspaceId, workspaceId)),
          tx.select().from(documents).where(eq(documents.workspaceId, workspaceId)),
          tx.select().from(documentShares).where(eq(documentShares.workspaceId, workspaceId)),
        ]);
        const plain = (value: unknown): Record<string, unknown> =>
          JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
        const list = (values: readonly unknown[]) => values.map(plain);
        return {
          workspace: plain(workspace[0]),
          memberships: list(membershipRows),
          customers: list(customerRows),
          products: list(productRows),
          sales: list(saleRows),
          saleLines: list(saleLineRows),
          saleVoids: list(saleVoidRows),
          payments: list(paymentRows),
          paymentReversals: list(reversalRows),
          accountEntries: list(entryRows),
          audit: list(auditRows),
          commandReceipts: list(receiptRows),
          suppliers: list(supplierRows),
          supplierPayments: list(supplierPaymentRows),
          supplierPaymentReversals: list(supplierPaymentReversalRows),
          supplierAccountEntries: list(supplierEntryRows),
          purchases: list(purchaseRows),
          purchaseLines: list(purchaseLineRows),
          purchaseVoids: list(purchaseVoidRows),
          receipts: list(purchaseReceiptRows),
          receiptLines: list(purchaseReceiptLineRows),
          receiptReversals: list(purchaseReceiptReversalRows),
          inventoryMovements: list(inventoryMovementRows),
          deliveries: list(deliveryRows),
          deliveryLines: list(deliveryLineRows),
          deliveryReturns: list(deliveryReturnRows),
          deliveryReturnLines: list(deliveryReturnLineRows.map((row) => row.line)),
          documents: list(documentRows),
          documentShares: list(documentShareRows),
        };
      },
    },

    auditReads: {
      async timeline(args: {
        workspaceId: string;
        aggregateType: "customer" | "sale" | "payment" | "debt" | null;
        aggregateId: string | null;
        actorId: string | null;
        from: string | null;
        to: string | null;
        page: Page;
      }) {
        const { workspaceId, aggregateType, aggregateId, actorId, from, to, page } = args;

        const filters: SQL[] = [eq(auditLogs.workspaceId, workspaceId)];
        if (aggregateType !== null) filters.push(eq(auditLogs.aggregateType, aggregateType));
        if (aggregateId !== null) filters.push(eq(auditLogs.aggregateId, aggregateId));
        if (actorId !== null) filters.push(eq(auditLogs.actorId, actorId));
        if (from !== null) filters.push(gte(auditLogs.recordedAt, fromIso(from as never)));
        if (to !== null) filters.push(lte(auditLogs.recordedAt, fromIso(to as never)));
        if (page.after !== null) {
          filters.push(
            sql`(${auditLogs.recordedAt}, ${auditLogs.id}) < (${page.after.sortValue}::timestamptz, ${page.after.id}::uuid)`,
          );
        }

        // Ordered by *recording* time, not business time: an audit trail answers
        // "what happened in what order, as far as this system knew", and a
        // back-dated entry belongs where it was written down, not where it claims
        // to belong (docs/07-data/time-semantics.md).
        const rows = await tx
          .select({
            id: auditLogs.id,
            workspaceId: auditLogs.workspaceId,
            actorId: auditLogs.actorId,
            actorDisplayName: actors.displayName,
            commandId: auditLogs.commandId,
            action: auditLogs.action,
            aggregateType: auditLogs.aggregateType,
            aggregateId: auditLogs.aggregateId,
            transactionTime: auditLogs.transactionTime,
            recordedAt: auditLogs.recordedAt,
            before: auditLogs.before,
            after: auditLogs.after,
            reason: auditLogs.reason,
            rejectionCode: auditLogs.rejectionCode,
            replacesSaleId: sales.replacesSaleId,
          })
          .from(auditLogs)
          .innerJoin(actors, eq(actors.id, auditLogs.actorId))
          // Only meaningful for sale records; null everywhere else, which is what
          // makes `correction` null for a payment or an adjustment.
          .leftJoin(sales, eq(sales.id, auditLogs.aggregateId))
          .where(and(...filters))
          .orderBy(desc(auditLogs.recordedAt), desc(auditLogs.id))
          .limit(fetchLimit(page));

        return paged(
          rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            actorId: row.actorId,
            actorDisplayName: row.actorDisplayName,
            commandId: row.commandId,
            action: row.action,
            aggregateType: row.aggregateType,
            aggregateId: row.aggregateId,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            before: row.before as Record<string, unknown> | null,
            after: row.after as Record<string, unknown> | null,
            reason: row.reason,
            rejectionCode: row.rejectionCode,
            correction: auditCorrection(row),
          })),
          page,
          (row) => ({ sortValue: row.recordedAt, id: row.id }),
        );
      },
    },
  };
}

function paymentSelect(tx: Tx) {
  return tx
    .select({
      id: payments.id,
      workspaceId: payments.workspaceId,
      customerId: payments.customerId,
      customerDisplayName: customers.displayName,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      method: payments.method,
      status: payments.status,
      reversedAmountMinor: payments.reversedAmountMinor,
      payerName: payments.payerName,
      note: payments.note,
      version: payments.version,
      transactionTime: payments.transactionTime,
      recordedAt: payments.recordedAt,
    })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId));
}

function toPaymentSummary(row: {
  id: string;
  workspaceId: string;
  customerId: string;
  customerDisplayName: string;
  amountMinor: number;
  currency: "VND";
  method: "cash" | "bank_transfer" | "other";
  status: "recorded" | "partially_reversed" | "reversed";
  reversedAmountMinor: number;
  payerName: string | null;
  note: string | null;
  version: number;
  transactionTime: Date;
  recordedAt: Date;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    customerId: row.customerId,
    customerDisplayName: row.customerDisplayName,
    amount: money(row.amountMinor, row.currency),
    method: row.method,
    status: row.status,
    reversedAmount: money(row.reversedAmountMinor, row.currency),
    payerName: row.payerName,
    note: row.note,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
  };
}

/**
 * A short human label per source kind, so the timeline names what moved the
 * money rather than showing a uuid (UC-ACCOUNT-001).
 */
function sourceLabel(row: {
  sourceType: string;
  saleTotalMinor: number | null;
  voidReasonCode: string | null;
  paymentMethod: string | null;
  reversalAmountMinor: number | null;
  reasonCode: string | null;
}): string {
  switch (row.sourceType) {
    case "sale_posting":
      return row.saleTotalMinor === null ? "Sale" : `Sale · ${row.saleTotalMinor}`;
    case "sale_void":
      return row.voidReasonCode === null ? "Sale void" : `Sale void · ${row.voidReasonCode}`;
    case "payment":
      return row.paymentMethod === null ? "Payment" : `Payment · ${row.paymentMethod}`;
    case "payment_reversal":
      return row.reversalAmountMinor === null
        ? "Payment reversal"
        : `Payment reversal · ${row.reversalAmountMinor}`;
    case "manual_adjustment":
      return row.reasonCode === null ? "Adjustment" : `Adjustment · ${row.reasonCode}`;
    default:
      return row.sourceType;
  }
}

/**
 * Navigation identity is resolved beside the source label. In particular a
 * void/reversal source id is the immutable compensation record, not the Sale or
 * Payment detail the worker needs to inspect.
 */
function sourceDocument(row: {
  sourceType: string;
  sourceId: string;
  voidSaleId: string | null;
  reversalPaymentId: string | null;
}): { type: "sale" | "payment" | "adjustment"; id: string } {
  switch (row.sourceType) {
    case "sale_posting":
      return { type: "sale", id: row.sourceId };
    case "sale_void":
      return { type: "sale", id: row.voidSaleId ?? row.sourceId };
    case "payment":
      return { type: "payment", id: row.sourceId };
    case "payment_reversal":
      return { type: "payment", id: row.reversalPaymentId ?? row.sourceId };
    case "manual_adjustment":
      return { type: "adjustment", id: row.sourceId };
    default:
      return { type: "adjustment", id: row.sourceId };
  }
}

/**
 * How this action relates to another (UC-AUDIT-001). A void names the sale it
 * undid; a posting on a replacement names the sale it supersedes. Everything else
 * is null — a payment corrects nothing.
 */
function auditCorrection(row: {
  action: string;
  aggregateType: string;
  aggregateId: string;
  replacesSaleId: string | null;
}): { relation: "voids_sale" | "replaces_sale"; targetSaleId: string } | null {
  if (row.aggregateType !== "sale") {
    return null;
  }
  if (row.action === "sale.voided") {
    return { relation: "voids_sale", targetSaleId: row.aggregateId };
  }
  if (row.replacesSaleId !== null) {
    return { relation: "replaces_sale", targetSaleId: row.replacesSaleId };
  }
  return null;
}

export type ReadRepositories = ReturnType<typeof createReadRepositories>;
