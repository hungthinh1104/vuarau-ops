import type {
  AdjustCustomerDebtCommand,
  CustomerAccountBalanceDto,
} from "@vuarau/domain-contracts";
import { adjustCustomerDebtCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideAdjustDebt, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyAccountEffects, emptyAccountBalance } from "../shared/account-effects.ts";
import { accountCapabilities } from "../shared/authorization.ts";
import { toAccountBalanceDto } from "../shared/mappers.ts";

/**
 * UC-ACCOUNT-002 — the only command that moves money with no underlying document.
 *
 * Requires the `debt.adjust` permission, which only `owner` and `accountant`
 * carry (BR-AUTH-006). Before Milestone 1 any workspace member could call this —
 * that was ASM-007, the largest hole left by the bootstrap.
 *
 * Attribution is unchanged and still mandatory: actor, command, reason code and
 * reason text all land on the ledger entry itself.
 */
export function adjustCustomerDebt(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<CustomerAccountBalanceDto>> {
  return runCommand<AdjustCustomerDebtCommand, CustomerAccountBalanceDto>({
    commandType: "AdjustCustomerDebt",
    schema: adjustCustomerDebtCommandSchema,
    input,
    ctx,
    requiredPermission: "debt.adjust",
    execute: async ({ command, repos, recordedAt, membership }) => {
      const customer = await repos.customers.findByIdForUpdate(
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
      await applyAccountEffects(repos, decision.value.accountEntries, currency);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      const summary = await repos.accountBalances.get(
        command.workspaceId,
        command.payload.customerId,
      );
      return ok(
        toAccountBalanceDto(
          summary ??
            emptyAccountBalance(
              command.workspaceId,
              command.payload.customerId,
              currency,
              recordedAt,
            ),
          accountCapabilities(membership.roles),
        ),
      );
    },
  });
}
