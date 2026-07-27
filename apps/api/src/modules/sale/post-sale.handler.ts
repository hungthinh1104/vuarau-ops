import type { PostSaleCommand, SaleDto } from "@vuarau/domain-contracts";
import { postSaleCommandSchema, roleHasPermission } from "@vuarau/domain-contracts";
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
    // A correction replacement is posted by its void-authorized correcting
    // actor. An ordinary sale still requires the normal sales-post permission.
    requiredPermission: "sale.read",
    execute: async ({ command, repos, recordedAt, membership }) => {
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, command.payload.saleId);
      if (sale === null) {
        return err("SALE_NOT_FOUND", "No such sale in this workspace.", {
          saleId: command.payload.saleId,
        });
      }

      if (sale.replacesSaleId === null) {
        if (!roleHasPermission(membership.role, "sale.post")) {
          return err("PERMISSION_DENIED", "Your role cannot post a sale.", {
            workspaceId: command.workspaceId,
            permission: "sale.post",
            role: membership.role,
          });
        }
      } else {
        if (!roleHasPermission(membership.role, "sale.void")) {
          return err("PERMISSION_DENIED", "Your role cannot post a correction replacement.", {
            workspaceId: command.workspaceId,
            permission: "sale.void",
            role: membership.role,
          });
        }
        const source = await repos.sales.findByIdForUpdate(
          command.workspaceId,
          sale.replacesSaleId,
        );
        if (source === null || source.voidRecord === null) {
          return err("SALE_REPLACEMENT_NOT_VOIDED", "A replacement must follow a committed void.", {
            saleId: sale.replacesSaleId,
          });
        }
        if (source.voidRecord.actorId !== command.actorId) {
          return err(
            "SALE_REPLACEMENT_ACTOR_MISMATCH",
            "Only the actor who voided this sale can post its replacement.",
            { saleId: source.id, voidActorId: source.voidRecord.actorId },
          );
        }
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
