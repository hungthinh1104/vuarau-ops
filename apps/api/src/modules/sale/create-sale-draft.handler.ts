import type { CreateSaleDraftCommand, SaleDto } from "@vuarau/domain-contracts";
import { createSaleDraftCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideCreateSaleDraft, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { toSaleDto } from "../shared/mappers.ts";

/**
 * UC-SALE-001 — a draft sale.
 *
 * Note what this handler does **not** do: touch the account. A draft has no
 * financial effect at all (BR-SALE-010), and the absence of `applyAccountEffects`
 * here is the whole of that rule's implementation. TC-SALE-014 asserts it
 * directly rather than trusting that nobody adds a call later.
 */
export function createSaleDraft(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<SaleDto>> {
  return runCommand<CreateSaleDraftCommand, SaleDto>({
    commandType: "CreateSaleDraft",
    schema: createSaleDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "sale.create",
    execute: async ({ command, repos, recordedAt }) => {
      // The customer must exist *in this workspace*. Knowing the id is not enough.
      const customer = await repos.customers.findById(
        command.workspaceId,
        command.payload.customerId,
      );
      if (customer === null) {
        return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
          customerId: command.payload.customerId,
        });
      }

      // A replacement must name a sale that exists here (BR-SALE-016). A dangling
      // link would leave a correction chain nobody can follow, which is the one
      // thing the link exists to prevent.
      if (command.payload.replacesSaleId !== null) {
        const replaced = await repos.sales.findByIdForUpdate(
          command.workspaceId,
          command.payload.replacesSaleId,
        );
        if (replaced === null) {
          return err("SALE_NOT_FOUND", "The sale this one replaces does not exist here.", {
            saleId: command.payload.replacesSaleId,
          });
        }
      }

      const decision = decideCreateSaleDraft({ command, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const sale = decision.value.aggregate;
      await repos.sales.insert(sale);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toSaleDto(sale, recordedAt));
    },
  });
}
