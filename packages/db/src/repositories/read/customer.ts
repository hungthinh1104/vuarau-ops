import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { customerAccountBalances, customers, saleVoids, sales } from "../../schema/index.ts";
import { classifyBalance } from "@vuarau/domain-kernel";
import { money, toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createCustomerReadRepositories = (tx: Tx) => ({
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
});
