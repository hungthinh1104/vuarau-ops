import type {
  GetSaleInput,
  IsoInstant,
  SaleDueState,
  ListSalesInput,
  Page,
  SaleDto,
  SaleSummaryDto,
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
