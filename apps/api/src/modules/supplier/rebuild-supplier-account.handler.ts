import type {
  RebuildSupplierAccountCommand,
  SupplierAccountBalanceDto,
} from "@vuarau/domain-contracts";
import { rebuildSupplierAccountCommandSchema } from "@vuarau/domain-contracts";
import { classifySupplierBalance, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { rebuildSupplierAccountBalance } from "./supplier-account-effects.ts";

export const rebuildSupplierAccount = (ctx: CommandContext, input: unknown) =>
  runCommand<RebuildSupplierAccountCommand, SupplierAccountBalanceDto>({
    commandType: "RebuildSupplierAccount",
    schema: rebuildSupplierAccountCommandSchema,
    input,
    ctx,
    requiredPermission: "supplier.account.rebuild",
    execute: async ({ command, repos, recordedAt }) => {
      if (
        (await repos.suppliers.findById(command.workspaceId, command.payload.supplierId)) === null
      )
        return err("SUPPLIER_NOT_FOUND", "No such supplier.");
      const diagnostics = await repos.supplierAccountReads.integrity(
        command.workspaceId,
        command.payload.supplierId,
      );
      if (diagnostics.length > 0)
        return err(
          "SUPPLIER_ACCOUNT_RECONCILIATION_REBUILD_UNSAFE",
          "Canonical supplier ledger is not safe to rebuild.",
          { diagnostics },
        );
      const before = await repos.supplierAccountBalances.get(
        command.workspaceId,
        command.payload.supplierId,
      );
      const rebuilt = await rebuildSupplierAccountBalance(
        repos,
        command.workspaceId,
        command.payload.supplierId,
        "VND",
        recordedAt,
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "supplier_account",
        aggregateId: command.payload.supplierId,
        action: "supplier_account.projection_rebuilt",
        transactionTime: command.occurredAt,
        recordedAt,
        before: before === null ? null : { entryCount: before.entryCount },
        after: { entryCount: rebuilt.entryCount },
        reason: null,
      });
      return ok({
        ...rebuilt,
        classification: classifySupplierBalance(rebuilt.balance.amountMinor),
      });
    },
  });
