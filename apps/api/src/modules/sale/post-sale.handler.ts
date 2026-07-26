import type { PostSaleCommand, SaleDto } from "@vuarau/domain-contracts";
import { postSaleCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decidePostSale, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyAccountEffects } from "../shared/account-effects.ts";
import { toSaleDto } from "../shared/mappers.ts";

/**
 * UC-SALE-002 — the moment a customer starts owing money.
 *
 * The sale transition, the account entry, the balance, the audit record and the
 * command receipt all commit together or not at all (BR-COMMAND-005).
 */
export function postSale(ctx: CommandContext, input: unknown): Promise<DomainResult<SaleDto>> {
  return runCommand<PostSaleCommand, SaleDto>({
    commandType: "PostSale",
    schema: postSaleCommandSchema,
    input,
    ctx,
    requiredPermission: "sale.post",
    execute: async ({ command, repos, recordedAt }) => {
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, command.payload.saleId);
      if (sale === null) {
        return err("SALE_NOT_FOUND", "No such sale in this workspace.", {
          saleId: command.payload.saleId,
        });
      }

      const decision = decidePostSale({ command, sale, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const posted = decision.value.aggregate;

      // Belt and braces (ADR-0009): the domain compared versions against the row we
      // read, and this compares again at write time. The row lock makes the race
      // unlikely; this makes a lost update impossible.
      const updated = await repos.sales.post(posted, sale.version);
      if (!updated) {
        return err("SALE_VERSION_CONFLICT", "Sale was modified by someone else.", {
          saleId: sale.id,
          expectedVersion: command.expectedVersion,
          actualVersion: sale.version,
        });
      }

      await applyAccountEffects(repos, decision.value.accountEntries, sale.currency);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toSaleDto(posted, recordedAt));
    },
  });
}
