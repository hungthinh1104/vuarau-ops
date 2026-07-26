import type { AdjustCustomerDebtCommand, CustomerDebtSummaryDto } from "@vuanha/domain-contracts";
import { adjustCustomerDebtCommandSchema } from "@vuanha/domain-contracts";
import type { DomainResult } from "@vuanha/domain-kernel";
import { decideAdjustDebt, err, ok } from "@vuanha/domain-kernel";
import type { CommandDeps } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyLedgerEffects, emptyDebtSummary } from "../shared/debt-effects.ts";

/**
 * UC-DEBT-001 — the only command that moves money with no underlying document.
 *
 * Any workspace member may call it today (ASM-007), which is knowingly too
 * permissive. Until roles exist, the mitigation is attribution: actor, command,
 * reason code and reason text all land on the ledger entry itself.
 */
export function adjustCustomerDebt(
  deps: CommandDeps,
  input: unknown,
): Promise<DomainResult<CustomerDebtSummaryDto>> {
  return runCommand<AdjustCustomerDebtCommand, CustomerDebtSummaryDto>({
    commandType: "AdjustCustomerDebt",
    schema: adjustCustomerDebtCommandSchema,
    input,
    deps,
    execute: async ({ command, repos, recordedAt }) => {
      const customer = await repos.customers.findById(
        command.workspaceId,
        command.payload.customerId,
      );
      if (customer === null) {
        return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
          customerId: command.payload.customerId,
        });
      }

      const decision = decideAdjustDebt({ command, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const currency = command.payload.amount.currency;
      await applyLedgerEffects(repos, decision.value.ledgerEntries, currency);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      const summary = await repos.debtSummaries.get(
        command.workspaceId,
        command.payload.customerId,
      );
      return ok(
        summary ??
          emptyDebtSummary(command.workspaceId, command.payload.customerId, currency, recordedAt),
      );
    },
  });
}
