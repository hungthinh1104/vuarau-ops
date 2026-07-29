import type {
  Page,
  SupplierAccountEntryDto,
  SupplierDto,
  SupplierId,
  SupplierPaymentId,
  SupplierSearchInput,
  Cursor,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import { classifySupplierBalance, zeroMoney, addMoney } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export const searchSuppliers = (ctx: CommandContext, input: SupplierSearchInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supplier.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.supplierReads.search({
          workspaceId: input.workspaceId,
          query: input.query,
          isActive: input.isActive,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  }) as Promise<DomainResult<Page<SupplierDto>>>;

export async function getSupplier(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; supplierId: SupplierId },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supplier.read",
    execute: ({ repos }) => repos.supplierReads.get(input.workspaceId, input.supplierId),
  });
  if (!result.ok) return result;
  return result.value === null ? err("SUPPLIER_NOT_FOUND", "No such supplier.") : ok(result.value);
}

export const getSupplierBalance = (
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; supplierId: SupplierId },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supplier.account.read",
    execute: ({ repos }) => repos.supplierAccountReads.balance(input.workspaceId, input.supplierId),
  });

export async function getSupplierPayment(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; supplierPaymentId: SupplierPaymentId },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supplier.account.read",
    execute: ({ repos }) =>
      repos.supplierAccountReads.payment(input.workspaceId, input.supplierPaymentId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("SUPPLIER_PAYMENT_NOT_FOUND", "No such supplier payment.")
    : ok(result.value);
}

export async function getSupplierAdjustment(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; adjustmentId: string },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supplier.account.read",
    execute: ({ repos }) =>
      repos.supplierAccountEntries.findBySource(
        input.workspaceId,
        "manual_adjustment",
        input.adjustmentId,
      ),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("SUPPLIER_NOT_FOUND", "No such supplier account adjustment.")
    : ok(result.value);
}

export const getSupplierTimeline = (
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; supplierId: SupplierId; cursor: Cursor | null; limit: number },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supplier.account.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.supplierAccountReads.timeline({
          workspaceId: input.workspaceId,
          supplierId: input.supplierId,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  }) as Promise<DomainResult<Page<SupplierAccountEntryDto>>>;

export const getSupplierReconciliation = (
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; supplierId: SupplierId },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supplier.account.read",
    execute: async ({ repos }) => {
      const supplier = await repos.suppliers.findById(input.workspaceId, input.supplierId);
      if (supplier === null) {
        return {
          status: "not_found" as const,
          supplierId: input.supplierId,
          projected: null,
          canonical: null,
          diagnostics: ["supplier_not_found"],
        };
      }
      const [entries, projected, integrity] = await Promise.all([
        repos.supplierAccountEntries.listBySupplier(input.workspaceId, input.supplierId),
        repos.supplierAccountReads.balance(input.workspaceId, input.supplierId),
        repos.supplierAccountReads.integrity(input.workspaceId, input.supplierId),
      ]);
      let balance = zeroMoney("VND");
      let last: SupplierAccountEntryDto["transactionTime"] | null = null;
      for (const entry of entries) {
        balance = addMoney(balance, entry.amount);
        if (last === null || entry.transactionTime > last) last = entry.transactionTime;
      }
      const canonical = {
        workspaceId: input.workspaceId,
        supplierId: input.supplierId,
        balance,
        classification: classifySupplierBalance(balance.amountMinor),
        entryCount: entries.length,
        lastEntryTransactionTime: last,
        updatedAt: entries[entries.length - 1]?.recordedAt ?? supplier.updatedAt,
      };
      if (integrity.length > 0) {
        return {
          status: "integrity_failure" as const,
          supplierId: input.supplierId,
          projected,
          canonical,
          diagnostics: [...integrity],
        };
      }
      const diagnostics = [
        ...(projected === null ? ["projection_missing"] : []),
        ...(projected !== null && projected.balance.amountMinor !== balance.amountMinor
          ? ["balance_drift"]
          : []),
        ...(projected !== null && projected.entryCount !== entries.length
          ? ["entry_count_drift"]
          : []),
        ...(projected !== null && projected.lastEntryTransactionTime !== last
          ? ["latest_transaction_drift"]
          : []),
      ];
      return {
        status: diagnostics.length === 0 ? ("consistent" as const) : ("inconsistent" as const),
        supplierId: input.supplierId,
        projected,
        canonical,
        diagnostics,
      };
    },
  });
