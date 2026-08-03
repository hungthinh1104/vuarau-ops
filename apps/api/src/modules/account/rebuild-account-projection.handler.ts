import type {
  RebuildAccountProjectionCommand,
  RebuildAccountProjectionResultDto,
} from "@vuarau/domain-contracts";
import { DEFAULT_CURRENCY, rebuildAccountProjectionCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import type { CustomerAccountBalance } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { rebuildCustomerAccountBalance } from "../shared/account-effects.ts";
import { isProjectionOnlyDrift, loadAccountReconciliation } from "./reconciliation.ts";

function projectionEvidence(balance: CustomerAccountBalance) {
  return {
    balance: balance.balance,
    entryCount: balance.entryCount,
    lastEntryTransactionTime: balance.lastEntryTransactionTime,
    updatedAt: balance.updatedAt,
  };
}

export function rebuildAccountProjection(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<RebuildAccountProjectionResultDto>> {
  return runCommand<RebuildAccountProjectionCommand, RebuildAccountProjectionResultDto>({
    commandType: "RebuildAccountProjection",
    schema: rebuildAccountProjectionCommandSchema,
    input,
    ctx,
    requiredPermission: "debt.adjust",
    execute: async ({ command, repos, recordedAt, membership }) => {
      const before = await loadAccountReconciliation({
        repos,
        workspaceId: command.workspaceId,
        customerId: command.payload.customerId,
        roles: membership.roles,
      });
      if (before.kind === "not_found") {
        return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
          customerId: command.payload.customerId,
        });
      }
      if (before.kind === "integrity_failure") {
        return err(
          "ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE",
          "The ledger is not safe to rebuild from.",
          { diagnostics: before.diagnostics.map((item) => item.code) },
        );
      }
      if (before.kind === "inconsistent" && !isProjectionOnlyDrift(before)) {
        return err(
          "ACCOUNT_RECONCILIATION_REBUILD_UNSAFE",
          "Only projection drift can be repaired by a projection rebuild.",
          { diagnostics: before.diagnostics.map((item) => item.code) },
        );
      }

      const currency =
        before.projection?.balance.currency ?? before.ledger.balance.currency ?? DEFAULT_CURRENCY;
      const rebuilt = await rebuildCustomerAccountBalance(
        repos,
        command.workspaceId,
        command.payload.customerId,
        currency,
        recordedAt,
      );

      await repos.audit.append({
        aggregateType: "debt",
        aggregateId: command.payload.customerId,
        action: "account.projection_rebuilt",
        transactionTime: command.occurredAt,
        recordedAt,
        before:
          before.projection === null
            ? null
            : {
                balanceMinor: before.projection.balance.amountMinor,
                entryCount: before.projection.entryCount,
              },
        after: {
          balanceMinor: rebuilt.balance.amountMinor,
          entryCount: rebuilt.entryCount,
        },
        reason: command.payload.reason,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      const reconciliation = await loadAccountReconciliation({
        repos,
        workspaceId: command.workspaceId,
        customerId: command.payload.customerId,
        roles: membership.roles,
      });
      if (reconciliation.kind !== "consistent") {
        return err(
          "ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE",
          "The rebuilt projection did not reconcile with the ledger.",
          { result: reconciliation.kind },
        );
      }

      return ok({
        customerId: command.payload.customerId,
        before: before.projection,
        after: projectionEvidence(rebuilt),
        reconciliation,
      });
    },
  });
}
