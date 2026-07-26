import type { SaleDto, VoidSaleCommand } from "@vuarau/domain-contracts";
import { voidSaleCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideVoidSale, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyAccountEffects } from "../shared/account-effects.ts";
import { toSaleDto } from "../shared/mappers.ts";

/**
 * UC-SALE-004 — undoing a posted sale (ADR-0012).
 *
 * The correction path for a wrong sale, and deliberately **not**
 * `AdjustCustomerDebt`: an adjustment would leave the wrong sale document
 * standing while quietly patching the balance, so the document and the balance
 * would tell different stories (BR-ACCOUNT-010).
 *
 * Nothing here updates the original sale or its posting entry. The void record
 * and the compensating entry are appended beside them, and the sale's financial
 * state is derived from the pair (BR-SALE-008, BR-ACCOUNT-005).
 */
export function voidSale(ctx: CommandContext, input: unknown): Promise<DomainResult<SaleDto>> {
  return runCommand<VoidSaleCommand, SaleDto>({
    commandType: "VoidSale",
    schema: voidSaleCommandSchema,
    input,
    ctx,
    // Not `sale.post`. Somebody who can both create and erase a sale can make a
    // load disappear with nothing missing from the balance (BR-AUTH-004).
    requiredPermission: "sale.void",
    execute: async ({ command, repos, recordedAt }) => {
      // `FOR UPDATE` on the sale is what serialises two concurrent voids, even
      // though the write lands in a different table (BR-SALE-013).
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, command.payload.saleId);
      if (sale === null) {
        return err("SALE_NOT_FOUND", "No such sale in this workspace.", {
          saleId: command.payload.saleId,
        });
      }

      const decision = decideVoidSale({ command, sale, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      // Ordered so the structural guard fires **before** any money moves:
      // `UNIQUE (sale_id)` refuses a second void even when the row lock and the
      // domain check were both somehow bypassed (BR-SALE-013).
      //
      // A losing race is a business answer, not a crash. Two people spotting the
      // same wrong sale within seconds is ordinary in a depot, and the loser
      // deserves `SALE_ALREADY_VOIDED` rather than a 500 — the same code the
      // domain check would have produced a moment earlier.
      const claimed = await repos.sales.insertVoid(
        decision.value.voidRecord,
        command.actorId,
        command.commandId,
      );
      if (!claimed) {
        return err("SALE_ALREADY_VOIDED", "This sale has already been voided.", {
          saleId: sale.id,
        });
      }

      await applyAccountEffects(repos, decision.value.accountEntries, sale.currency);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toSaleDto(decision.value.aggregate, recordedAt));
    },
  });
}
