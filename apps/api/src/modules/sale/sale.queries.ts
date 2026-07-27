import type {
  GetSaleInput,
  IsoInstant,
  SaleDueState,
  ListSalesInput,
  Page,
  SaleDto,
  SaleSummaryDto,
  SaleCaptureContextDto,
  SaleCaptureContextInput,
  SaleReceiptDto,
  SaleReceiptInput,
} from "@vuarau/domain-contracts";
import type { DomainResult, SaleState } from "@vuarau/domain-kernel";
import { err, saleDueState, saleSummaryCapabilities } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";
import { toSaleDto } from "../shared/mappers.ts";

/** UC-SALE-003. */

/**
 * `saleDueState` takes a sale; a summary row is not one, and the only field it
 * reads is `dueAt`. Narrowed here rather than by fabricating an aggregate, so a
 * later field added to `SaleState` cannot silently change what a list computes.
 */
function dueStateOf(dueAt: IsoInstant | null, asOf: IsoInstant): SaleDueState {
  return saleDueState({ dueAt } as Pick<SaleState, "dueAt"> as SaleState, asOf);
}

export async function getSale(
  ctx: CommandContext,
  input: GetSaleInput,
): Promise<DomainResult<SaleDto & { replacedBySaleId: string | null }>> {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "sale.read",
    execute: async ({ repos, asOf }) => {
      const sale = await repos.saleReads.get(input.workspaceId, input.saleId);
      if (sale === null) {
        return null;
      }
      // Two reads, not one per row: this endpoint returns a single sale, and the
      // forward half of the correction chain is a second indexed lookup rather
      // than a column on an immutable row (BR-SALE-016).
      const replacedBySaleId = await repos.saleReads.replacedBy(input.workspaceId, input.saleId);
      return { ...toSaleDto(sale, asOf), replacedBySaleId };
    },
  });

  if (!result.ok) {
    return result;
  }
  if (result.value === null) {
    return err("SALE_NOT_FOUND", "No such sale in this workspace.", { saleId: input.saleId });
  }
  return { ok: true, value: result.value };
}

export function listSales(
  ctx: CommandContext,
  input: ListSalesInput,
): Promise<DomainResult<Page<SaleSummaryDto>>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "sale.read",
    execute: async ({ repos, asOf }) => {
      const result = await repos.saleReads.list({
        workspaceId: input.workspaceId,
        customerId: input.customerId,
        status: input.status,
        voided: input.financialState === null ? null : input.financialState === "voided",
        from: input.from,
        to: input.to,
        page: toPageQuery(input),
      });

      return toPage(result, (row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        customerId: row.customerId,
        customerDisplayName: row.customerDisplayName,
        status: row.status,
        // Both derived, never stored (state catalog). `dueState` needs the
        // reading clock, which is why `asOf` is threaded this far.
        financialState: row.status === "posted" ? (row.isVoided ? "voided" : "active") : null,
        dueState: dueStateOf(row.dueAt, asOf),
        totalAmount: row.totalAmount,
        lineCount: row.lineCount,
        version: row.version,
        transactionTime: row.transactionTime,
        recordedAt: row.recordedAt,
        postedAt: row.postedAt,
        discardedAt: row.discardedAt,
        dueAt: row.dueAt,
        replacesSaleId: row.replacesSaleId,
        replacedBySaleId: row.replacedBySaleId,
        // Computed from the summary's own facts through the same functions the
        // command guards use, so a greyed-out button in a list and a refusal
        // cannot disagree (ADR-0003).
        capabilities: saleSummaryCapabilities({
          saleId: row.id,
          status: row.status,
          lineCount: row.lineCount,
          isVoided: row.isVoided,
        }),
      }));
    },
  });
}

/** Names may be suggested workspace-wide; prices are returned only for this customer. */
export function captureContext(
  ctx: CommandContext,
  input: SaleCaptureContextInput,
): Promise<DomainResult<SaleCaptureContextDto>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "sale.read",
    execute: async ({ repos }) => {
      const found = await repos.saleReads.captureContext(input);
      return {
        customerHistory: [...found.customerHistory],
        workspaceHistory: found.workspaceHistory.map((row) => ({ ...row, lastUnitPrice: null })),
      };
    },
  });
}

/** A posted sale view is derived from the sale and ledger, never a new aggregate. */
export async function getSaleReceipt(
  ctx: CommandContext,
  input: SaleReceiptInput,
): Promise<DomainResult<SaleReceiptDto>> {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "sale.read",
    execute: async ({ repos, asOf }) => {
      const sale = await repos.saleReads.get(input.workspaceId, input.saleId);
      if (sale === null) return null;
      const customer = await repos.customerReads.get(input.workspaceId, sale.customerId);
      if (customer === null) return null;
      const replacedBySaleId = await repos.saleReads.replacedBy(input.workspaceId, sale.id);
      const entries = await repos.accountReads.timeline({
        workspaceId: input.workspaceId,
        customerId: sale.customerId,
        from: null,
        to: null,
        page: { after: null, limit: 200 },
      });
      const entry = entries.rows.find(
        (row) => row.source.type === "sale_posting" && row.source.id === sale.id,
      );
      const accountEffect =
        entry === undefined
          ? null
          : {
              balanceBefore: {
                ...entry.runningBalance,
                amountMinor: entry.runningBalance.amountMinor - entry.amount.amountMinor,
              },
              change: entry.amount,
              balanceAfter: entry.runningBalance,
              classificationAfter:
                entry.runningBalance.amountMinor > 0
                  ? ("receivable" as const)
                  : entry.runningBalance.amountMinor < 0
                    ? ("customer_credit" as const)
                    : ("settled" as const),
              accountEntryId: entry.id,
            };
      return {
        sale: toSaleDto(sale, asOf),
        displayReference: `Bông ${sale.id.slice(0, 8).toUpperCase()}`,
        customer: {
          id: customer.customer.id,
          displayName: customer.customer.displayName,
          phone: customer.customer.phone,
        },
        workspace: { id: input.workspaceId, name: "" },
        accountEffect,
        correction: { voidRecord: toSaleDto(sale, asOf).voidRecord, replacedBySaleId },
      };
    },
  });
  if (!result.ok) return result;
  if (result.value === null)
    return err("SALE_NOT_FOUND", "No such sale in this workspace.", { saleId: input.saleId });
  return { ok: true, value: result.value };
}
