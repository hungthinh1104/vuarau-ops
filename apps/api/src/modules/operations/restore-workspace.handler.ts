import type {
  RestoreWorkspaceBackupCommand,
  WorkspaceRestoreResultDto,
  WorkspaceBackupV3,
} from "@vuarau/domain-contracts";
import { restoreWorkspaceBackupCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { backupDigest } from "./operations.queries.ts";

function validReferences(command: RestoreWorkspaceBackupCommand): boolean {
  const { payload } = command.payload.backup;
  const source = command.payload.backup.sourceWorkspaceId;
  const rows = Object.entries(payload).flatMap(([, value]) =>
    Array.isArray(value) ? value : [value],
  );
  if (
    rows.some(
      (row) =>
        "workspaceId" in row &&
        typeof row["workspaceId"] === "string" &&
        row["workspaceId"] !== source,
    )
  )
    return false;
  const customers = new Set(payload.customers.map((row) => row["id"]));
  const products = new Set(payload.products.map((row) => row["id"]));
  const sales = new Set(payload.sales.map((row) => row["id"]));
  const suppliers = new Set(
    "suppliers" in payload ? payload.suppliers.map((row) => row["id"]) : [],
  );
  const purchases = new Set(
    "purchases" in payload ? payload.purchases.map((row) => row["id"]) : [],
  );
  const purchaseLines = new Set(
    "purchaseLines" in payload ? payload.purchaseLines.map((row) => row["id"]) : [],
  );
  const receipts = new Set("receipts" in payload ? payload.receipts.map((row) => row["id"]) : []);
  const supplierPayments = new Set(
    "supplierPayments" in payload ? payload.supplierPayments.map((row) => row["id"]) : [],
  );
  const supplierPaymentReversals = new Set(
    "supplierPaymentReversals" in payload
      ? payload.supplierPaymentReversals.map((row) => row["id"])
      : [],
  );
  const purchaseVoids = new Set(
    "purchaseVoids" in payload ? payload.purchaseVoids.map((row) => row["id"]) : [],
  );
  const receiptReversals = new Set(
    "receiptReversals" in payload ? payload.receiptReversals.map((row) => row["id"]) : [],
  );
  const deliveries = new Set(
    "deliveries" in payload ? payload.deliveries.map((row) => row["id"]) : [],
  );
  const deliveryLines = new Set(
    "deliveryLines" in payload ? payload.deliveryLines.map((row) => row["id"]) : [],
  );
  const deliveryReturns = new Set(
    "deliveryReturns" in payload ? payload.deliveryReturns.map((row) => row["id"]) : [],
  );
  const documents = new Set(
    "documents" in payload ? payload.documents.map((row) => row["id"]) : [],
  );
  return (
    payload.sales.every((row) => customers.has(row["customerId"])) &&
    payload.saleLines.every(
      (row) =>
        sales.has(row["saleId"]) && (row["productId"] == null || products.has(row["productId"])),
    ) &&
    payload.accountEntries.every((row) => customers.has(row["customerId"])) &&
    (!("purchases" in payload) ||
      payload.purchases.every((row) => suppliers.has(row["supplierId"]))) &&
    (!("supplierPayments" in payload) ||
      payload.supplierPayments.every((row) => suppliers.has(row["supplierId"]))) &&
    (!("supplierPaymentReversals" in payload) ||
      payload.supplierPaymentReversals.every((row) =>
        supplierPayments.has(row["supplierPaymentId"] ?? row["supplier_payment_id"]),
      )) &&
    (!("purchaseLines" in payload) ||
      payload.purchaseLines.every(
        (row) => purchases.has(row["purchaseId"]) && products.has(row["productId"]),
      )) &&
    (!("receipts" in payload) ||
      payload.receipts.every((row) => purchases.has(row["purchaseId"]))) &&
    (!("purchaseVoids" in payload) ||
      payload.purchaseVoids.every((row) => purchases.has(row["purchaseId"]))) &&
    (!("receiptLines" in payload) ||
      payload.receiptLines.every(
        (row) =>
          receipts.has(row["receiptId"]) &&
          purchaseLines.has(row["purchaseLineId"]) &&
          products.has(row["productId"]),
      )) &&
    (!("receiptReversals" in payload) ||
      payload.receiptReversals.every((row) => receipts.has(row["receiptId"]))) &&
    (!("supplierAccountEntries" in payload) ||
      payload.supplierAccountEntries.every((row) => {
        if (!suppliers.has(row["supplierId"])) return false;
        if (row["sourceType"] === "supplier_payment") return supplierPayments.has(row["sourceId"]);
        if (row["sourceType"] === "supplier_payment_reversal")
          return supplierPaymentReversals.has(row["sourceId"]);
        if (row["sourceType"] === "purchase_confirmation") return purchases.has(row["sourceId"]);
        if (row["sourceType"] === "purchase_void") return purchaseVoids.has(row["sourceId"]);
        return row["sourceType"] === "manual_adjustment";
      })) &&
    (!("inventoryMovements" in payload) ||
      payload.inventoryMovements.every((row) => {
        if (!products.has(row["productId"])) return false;
        if (row["sourceType"] === "purchase_receipt") return receipts.has(row["sourceId"]);
        if (row["sourceType"] === "purchase_receipt_reversal")
          return receiptReversals.has(row["sourceId"]);
        if (row["sourceType"] === "delivery_dispatch")
          return deliveries.has(row["sourceId"]) && deliveryLines.has(row["sourceLineId"]);
        if (row["sourceType"] === "delivery_return")
          return deliveryReturns.has(row["sourceId"]) && deliveryLines.has(row["sourceLineId"]);
        return row["sourceType"] === "inventory_adjustment";
      })) &&
    (!("deliveries" in payload) || payload.deliveries.every((row) => sales.has(row["saleId"]))) &&
    (!("deliveryLines" in payload) ||
      payload.deliveryLines.every(
        (row) =>
          deliveries.has(row["deliveryId"]) &&
          products.has(row["productId"]) &&
          payload.saleLines.some((saleLine) => saleLine["id"] === row["saleLineId"]),
      )) &&
    (!("deliveryReturns" in payload) ||
      payload.deliveryReturns.every((row) => deliveries.has(row["deliveryId"]))) &&
    (!("deliveryReturnLines" in payload) ||
      payload.deliveryReturnLines.every(
        (row) => deliveryReturns.has(row["returnId"]) && deliveryLines.has(row["deliveryLineId"]),
      )) &&
    (!("documents" in payload) ||
      payload.documents.every((row) => {
        if (row["sourceType"] === "sale") return sales.has(row["sourceId"]);
        if (row["sourceType"] === "customer") return customers.has(row["sourceId"]);
        if (row["sourceType"] === "purchase") return purchases.has(row["sourceId"]);
        if (row["sourceType"] === "delivery") return deliveries.has(row["sourceId"]);
        return false;
      })) &&
    (!("documentShares" in payload) ||
      payload.documentShares.every((row) => documents.has(row["documentId"])))
  );
}

function v3Payload(command: RestoreWorkspaceBackupCommand): WorkspaceBackupV3["payload"] {
  const payload = command.payload.backup.payload;
  return {
    ...payload,
    suppliers: "suppliers" in payload ? payload.suppliers : [],
    supplierPayments: "supplierPayments" in payload ? payload.supplierPayments : [],
    supplierPaymentReversals:
      "supplierPaymentReversals" in payload ? payload.supplierPaymentReversals : [],
    supplierAccountEntries:
      "supplierAccountEntries" in payload ? payload.supplierAccountEntries : [],
    purchases: "purchases" in payload ? payload.purchases : [],
    purchaseLines: "purchaseLines" in payload ? payload.purchaseLines : [],
    purchaseVoids: "purchaseVoids" in payload ? payload.purchaseVoids : [],
    receipts: "receipts" in payload ? payload.receipts : [],
    receiptLines: "receiptLines" in payload ? payload.receiptLines : [],
    receiptReversals: "receiptReversals" in payload ? payload.receiptReversals : [],
    inventoryMovements: "inventoryMovements" in payload ? payload.inventoryMovements : [],
    deliveries: "deliveries" in payload ? payload.deliveries : [],
    deliveryLines: "deliveryLines" in payload ? payload.deliveryLines : [],
    deliveryReturns: "deliveryReturns" in payload ? payload.deliveryReturns : [],
    deliveryReturnLines: "deliveryReturnLines" in payload ? payload.deliveryReturnLines : [],
    documents: "documents" in payload ? payload.documents : [],
    documentShares: "documentShares" in payload ? payload.documentShares : [],
  };
}

export function restoreWorkspaceBackup(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<WorkspaceRestoreResultDto>> {
  return runCommand<RestoreWorkspaceBackupCommand, WorkspaceRestoreResultDto>({
    commandType: "RestoreWorkspaceBackup",
    schema: restoreWorkspaceBackupCommandSchema,
    input,
    ctx,
    requiredPermission: "workspace.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const backup = command.payload.backup;
      if (backupDigest(backup.payload) !== backup.digest) {
        return err("BACKUP_DIGEST_INVALID", "Backup checksum does not match its payload.");
      }
      if (!validReferences(command)) {
        return err("BACKUP_INTEGRITY_ERROR", "Backup references are incomplete or cross-scoped.");
      }
      const restored = await repos.operations.restoreBackup(
        command.workspaceId,
        v3Payload(command),
      );
      if (restored.kind === "unsafe_target") {
        return err("BACKUP_UNSAFE_TARGET", "Restore requires an empty recovery workspace.", {
          reason: restored.reason,
        });
      }
      if (restored.kind !== "restored") {
        return err("BACKUP_INTEGRITY_ERROR", "Backup could not be restored safely.", {
          reason: restored.reason,
        });
      }
      const integrity = await repos.operationsReads.integrity(command.workspaceId);
      if (integrity.status !== "healthy") {
        return err("BACKUP_INTEGRITY_ERROR", "Restored workspace did not reconcile.", {
          integrity,
        });
      }
      const supplierDiagnostics = (
        await Promise.all(
          v3Payload(command).suppliers.map((row) =>
            repos.supplierAccountReads.integrity(
              command.workspaceId,
              String(row["id"]) as Parameters<typeof repos.supplierAccountReads.integrity>[1],
            ),
          ),
        )
      ).flat();
      const inventoryKeys = new Map<string, { productId: string; unit: string }>();
      for (const movement of v3Payload(command).inventoryMovements) {
        inventoryKeys.set(`${String(movement["productId"])}:${String(movement["unit"])}`, {
          productId: String(movement["productId"]),
          unit: String(movement["unit"]),
        });
      }
      const inventoryDiagnostics = (
        await Promise.all(
          [...inventoryKeys.values()].map(({ productId, unit }) =>
            repos.inventoryReads.integrity(
              command.workspaceId,
              productId as Parameters<typeof repos.inventoryReads.integrity>[1],
              unit as Parameters<typeof repos.inventoryReads.integrity>[2],
            ),
          ),
        )
      ).flat();
      if (supplierDiagnostics.length > 0 || inventoryDiagnostics.length > 0) {
        return err("BACKUP_INTEGRITY_ERROR", "Restored Goods Truth did not reconcile.", {
          supplierDiagnostics,
          inventoryDiagnostics,
        });
      }
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "workspace",
        aggregateId: command.workspaceId,
        action: "workspace.backup_restored",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { digest: backup.digest, restoredCounts: restored.counts },
        reason: command.payload.reason,
      });
      return ok({
        workspaceId: command.workspaceId,
        digest: backup.digest,
        restoredCounts: restored.counts,
        integrity,
      });
    },
  });
}
