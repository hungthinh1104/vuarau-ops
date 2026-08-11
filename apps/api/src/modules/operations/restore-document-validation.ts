import type { WorkspaceBackupV19 } from "@vuarau/domain-contracts";
import { hashPayload } from "../../infrastructure/hash.ts";

type BackupPayload = WorkspaceBackupV19["payload"];
type BackupSet = ReadonlySet<unknown>;

export function validDocumentAndCashReferences(
  payload: BackupPayload,
  references: readonly [BackupSet, BackupSet, BackupSet, BackupSet, BackupSet],
): boolean {
  const [customers, sales, purchases, deliveries, documents] = references;
  return (
    (!("documents" in payload) ||
      payload.documents.every((row) => {
        if (hashPayload(row["snapshot"]) !== row["digest"]) return false;
        if (row["sourceType"] === "sale") return sales.has(row["sourceId"]);
        if (row["sourceType"] === "customer") return customers.has(row["sourceId"]);
        if (row["sourceType"] === "purchase") return purchases.has(row["sourceId"]);
        if (row["sourceType"] === "delivery") return deliveries.has(row["sourceId"]);
        return false;
      })) &&
    (!("documentShares" in payload) ||
      payload.documentShares.every((row) => documents.has(row["documentId"]))) &&
    (!("cashAccounts" in payload) ||
      payload.cashAccounts.every((row) => {
        const custodian = row["custodianActorId"];
        return row["kind"] === "employee_holding"
          ? typeof custodian === "string"
          : custodian == null;
      }))
  );
}
