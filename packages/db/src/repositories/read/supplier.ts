import { and, asc, desc, eq, ilike, inArray, or, sql, SQL } from "drizzle-orm";
import {
  suppliers,
  supplierPayments,
  supplierPaymentReversals,
  supplierAccountEntries,
  supplierAccountBalances,
  purchases,
  purchaseVoids,
} from "../../schema/index.ts";
import { classifySupplierBalance } from "@vuarau/domain-kernel";
import { money, toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged, sourceDocument } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createSupplierReadRepositories = (tx: Tx) => ({
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
});
