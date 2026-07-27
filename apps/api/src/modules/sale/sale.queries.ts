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
  SaleDetailDto,
  SaleDetailInput,
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

/** A Sale detail view is derived from the Sale and its ledger effect. */
export async function getSaleDetail(
  ctx: CommandContext,
  input: SaleDetailInput,
): Promise<DomainResult<SaleDetailDto>> {
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
      // This is an indexed source lookup, not a page of the customer's timeline.
      // An old sale must remain readable after a customer has hundreds of entries.
      const entry = await repos.accountEntries.findBySource(
        input.workspaceId,
        "sale_posting",
        sale.id,
      );
      if (sale.status === "posted" && entry === null) return { integrityFailure: true };
      const workspaceName = await repos.workspaces.findName(input.workspaceId);
      if (workspaceName === null) return null;
      const allEntries =
        entry === null
          ? []
          : [
              ...(await repos.accountEntries.listByCustomer(input.workspaceId, sale.customerId)),
            ].sort(
              (left, right) =>
                left.transactionTime.localeCompare(right.transactionTime) ||
                left.id.localeCompare(right.id),
            );
      const balanceAfter =
        entry === null
          ? null
          : allEntries
              .slice(0, allEntries.findIndex((row) => row.id === entry.id) + 1)
              .reduce((sum, row) => sum + row.amount.amountMinor, 0);
      const accountEffect =
        entry === null || balanceAfter === null
          ? null
          : {
              balanceBefore: {
                ...entry.amount,
                amountMinor: balanceAfter - entry.amount.amountMinor,
              },
              change: entry.amount,
              balanceAfter: { ...entry.amount, amountMinor: balanceAfter },
              classificationAfter:
                balanceAfter > 0
                  ? ("receivable" as const)
                  : balanceAfter < 0
                    ? ("customer_credit" as const)
                    : ("settled" as const),
              accountEntryId: entry.id,
            };
      return {
        sale: toSaleDto(sale, asOf),
        displayReference: `Mã đơn ${sale.id.slice(0, 8).toUpperCase()}`,
        customer: {
          id: customer.customer.id,
          displayName: customer.customer.displayName,
          phone: customer.customer.phone,
        },
        workspace: { id: input.workspaceId, name: workspaceName },
        accountEffect,
        correction: { voidRecord: toSaleDto(sale, asOf).voidRecord, replacedBySaleId },
      };
    },
  });
  if (!result.ok) return result;
  if (result.value !== null && "integrityFailure" in result.value) {
    return err("SALE_POSTING_ENTRY_MISSING", "Posted sale has no sale_posting account entry.", {
      saleId: input.saleId,
    });
  }
  if (result.value === null)
    return err("SALE_NOT_FOUND", "No such sale in this workspace.", { saleId: input.saleId });
  return { ok: true, value: result.value };
}
