import { and, eq, ne } from "drizzle-orm";
import { auditLogs, commandReceipts } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function readBackupControlPlane(tx: Tx, workspaceId: string) {
  const [auditRows, receiptRows] = await Promise.all([
    tx
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.workspaceId, workspaceId),
          ne(auditLogs.action, "workspace.backup_exported"),
        ),
      ),
    tx
      .select()
      .from(commandReceipts)
      .where(
        and(
          eq(commandReceipts.workspaceId, workspaceId),
          ne(commandReceipts.commandType, "ExportWorkspaceBackup"),
        ),
      ),
  ]);
  return { auditRows, receiptRows };
}
