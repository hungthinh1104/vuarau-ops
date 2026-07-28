import type {
  DiscardSaleDraftCommand,
  SaleDto,
  UpdateSaleDraftCommand,
} from "@vuarau/domain-contracts";
import {
  discardSaleDraftCommandSchema,
  updateSaleDraftCommandSchema,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideDiscardSaleDraft, decideUpdateSaleDraft, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { toSaleDto } from "../shared/mappers.ts";

/**
 * UC-SALE-001, the edit and discard halves.
 *
 * Neither calls `applyAccountEffects`, and that absence is the implementation of
 * BR-SALE-010: a draft moves no money however many times it is edited, and
 * discarding one moves none either. TC-SALE-019 and TC-SALE-020 assert it
 * directly rather than trusting nobody adds a call later.
 *
 * Both take `sale.create` rather than a permission of their own. Editing a draft
 * is part of writing it down; whoever may start one may finish or abandon it.
 */
export function updateSaleDraft(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<SaleDto>> {
  return runCommand<UpdateSaleDraftCommand, SaleDto>({
    commandType: "UpdateSaleDraft",
    schema: updateSaleDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "sale.create",
    execute: async ({ command, repos, recordedAt }) => {
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
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, command.payload.saleId);
      if (sale === null) {
        return err("SALE_NOT_FOUND", "No such sale in this workspace.", {
          saleId: command.payload.saleId,
        });
      }

      const decision = decideUpdateSaleDraft({ command, sale, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const written = await repos.sales.updateDraft(decision.value.aggregate, sale.version, {
        replaceLines: true,
      });
      if (!written) {
        return err("SALE_VERSION_CONFLICT", "Sale was modified by someone else.", {
          saleId: sale.id,
          expectedVersion: command.expectedVersion,
          actualVersion: sale.version,
        });
      }

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

export function discardSaleDraft(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<SaleDto>> {
  return runCommand<DiscardSaleDraftCommand, SaleDto>({
    commandType: "DiscardSaleDraft",
    schema: discardSaleDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "sale.create",
    execute: async ({ command, repos, recordedAt }) => {
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, command.payload.saleId);
      if (sale === null) {
        return err("SALE_NOT_FOUND", "No such sale in this workspace.", {
          saleId: command.payload.saleId,
        });
      }

      const decision = decideDiscardSaleDraft({ command, sale, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      // `replaceLines: false` — the row stays and so do its lines. What somebody
      // had entered before thinking better of it is part of what is kept
      // (BR-SALE-018).
      const written = await repos.sales.updateDraft(decision.value.aggregate, sale.version, {
        replaceLines: false,
      });
      if (!written) {
        return err("SALE_VERSION_CONFLICT", "Sale was modified by someone else.", {
          saleId: sale.id,
          expectedVersion: command.expectedVersion,
          actualVersion: sale.version,
        });
      }

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
