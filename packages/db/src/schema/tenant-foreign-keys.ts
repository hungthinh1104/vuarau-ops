import { foreignKey, type PgColumn } from "drizzle-orm/pg-core";
import { commandReceipts } from "./command.ts";

type TenantCommandColumns = {
  readonly workspaceId: PgColumn;
  readonly commandId: PgColumn;
};

/** Every command effect must remain linked to a receipt in the same workspace. */
export function workspaceCommandForeignKey(
  table: TenantCommandColumns,
  name: string,
) {
  return foreignKey({
    columns: [table.workspaceId, table.commandId],
    foreignColumns: [commandReceipts.workspaceId, commandReceipts.commandId],
    name,
  });
}
