import type { CreateSaleDraftCommand, SaleDto } from "@vuarau/domain-contracts";
import { createSaleDraftCommandSchema, roleHasPermission } from "@vuarau/domain-contracts";
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
    // Both ordinary sale entry and a correction continuation need read access to
    // identify their customer. Their mutation permissions diverge below:
    // `sale.create` for a new sale, `sale.void` for a replacement.
    requiredPermission: "sale.read",
    execute: async ({ command, repos, recordedAt, membership }) => {
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
      for (const line of command.payload.lines) {
        if (
          line.productId !== null &&
          (await repos.products.findById(command.workspaceId, line.productId)) === null
        ) {
          return err("PRODUCT_NOT_FOUND", "A referenced product is not in this workspace.", {
            productId: line.productId,
          });
        }
      }

      if (
        command.payload.replacesSaleId === null &&
        !roleHasPermission(membership.role, "sale.create")
      ) {
        return err("PERMISSION_DENIED", "Your role cannot create a sale draft.", {
          workspaceId: command.workspaceId,
          permission: "sale.create",
          role: membership.role,
        });
      }

      // A replacement is not a user-controlled cross-link. It is the second
      // half of a correction already committed by VoidSale (BR-SALE-016): the
      // original must be posted and voided, by this same void-authorized actor.
      // This keeps a crafted /sales/new?replacesSaleId=... URL from creating a
      // second financial sale beside an active original.
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

        if (replaced.status !== "posted") {
          return err("SALE_NOT_POSTED", "Only a posted sale can be replaced.", {
            saleId: replaced.id,
          });
        }
        if (replaced.voidRecord === null) {
          return err("SALE_REPLACEMENT_NOT_VOIDED", "A replacement must follow a committed void.", {
            saleId: replaced.id,
          });
        }
        if (!roleHasPermission(membership.role, "sale.void")) {
          return err("PERMISSION_DENIED", "Your role cannot continue a sale correction.", {
            workspaceId: command.workspaceId,
            permission: "sale.void",
            role: membership.role,
          });
        }
        if (replaced.voidRecord.actorId !== command.actorId) {
          return err(
            "SALE_REPLACEMENT_ACTOR_MISMATCH",
            "Only the actor who voided this sale can create its replacement.",
            { saleId: replaced.id, voidActorId: replaced.voidRecord.actorId },
          );
        }
        if (replaced.currency !== command.payload.currency) {
          return err(
            "SALE_REPLACEMENT_CURRENCY_MISMATCH",
            "A replacement must use the original sale currency.",
            { saleId: replaced.id, currency: replaced.currency },
          );
        }
        if (
          replaced.voidRecord.reasonCode === "wrong_customer" &&
          replaced.customerId === command.payload.customerId
        ) {
          return err(
            "SALE_REPLACEMENT_CUSTOMER_UNCHANGED",
            "A wrong-customer correction must select a different customer.",
            { saleId: replaced.id, customerId: replaced.customerId },
          );
        }
        const replacedBySaleId = await repos.saleReads.replacedBy(command.workspaceId, replaced.id);
        if (replacedBySaleId !== null) {
          return err(
            "SALE_REPLACEMENT_ALREADY_EXISTS",
            "This voided sale already has a replacement.",
            { saleId: replaced.id, replacedBySaleId },
          );
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
