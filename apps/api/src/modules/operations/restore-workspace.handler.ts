import type {
  RestoreWorkspaceBackupCommand,
  WorkspaceRestoreResultDto,
  WorkspaceBackupV17,
} from "@vuarau/domain-contracts";
import {
  defaultWorkspaceOperationalProfile,
  restoreWorkspaceBackupCommandSchema,
  workspacePolicyDtoSchema,
  workspaceOperationalProfileDtoSchema,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { hashPayload } from "../../infrastructure/hash.ts";
import { backupDigest } from "./operations.queries.ts";

function validReferences(command: RestoreWorkspaceBackupCommand): boolean {
  const payload = v17Payload(command);
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
  const operationalProfile =
    "operationalProfile" in payload
      ? payload.operationalProfile
      : defaultWorkspaceOperationalProfile(source);
  if (
    !workspaceOperationalProfileDtoSchema.safeParse({
      ...operationalProfile,
      workspaceId: source,
    }).success
  ) {
    return false;
  }
  const customers = new Set(payload.customers.map((row) => row["id"]));
  const products = new Set(payload.products.map((row) => row["id"]));
  const customerOrders = new Set(payload.customerOrders.map((row) => row["id"]));
  const supplyCommitments = new Set(payload.supplyCommitments.map((row) => row["id"]));
  const qualityGrades = new Set(
    "qualityGrades" in payload ? payload.qualityGrades.map((row) => row["id"]) : [],
  );
  const hasGrade = (value: unknown) => value == null || qualityGrades.has(value);
  const sales = new Set(payload.sales.map((row) => row["id"]));
  const suppliers = new Set(
    "suppliers" in payload ? payload.suppliers.map((row) => row["id"]) : [],
  );
  const purchases = new Set(
    "purchases" in payload ? payload.purchases.map((row) => row["id"]) : [],
  );
  const purchaseLines = new Set(
    "purchaseLines" in payload
      ? payload.purchaseLines.map((row) => row["id"] ?? row["lineId"])
      : [],
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
  const cashAccounts = new Set(
    "cashAccounts" in payload ? payload.cashAccounts.map((row) => row["id"]) : [],
  );
  const expenses = new Set("expenses" in payload ? payload.expenses.map((row) => row["id"]) : []);
  const expenseReversals = new Set(
    "expenseReversals" in payload ? payload.expenseReversals.map((row) => row["id"]) : [],
  );
  const cashTransfers = new Set(
    "cashTransfers" in payload ? payload.cashTransfers.map((row) => row["id"]) : [],
  );
  const cashTransferReversals = new Set(
    "cashTransferReversals" in payload ? payload.cashTransferReversals.map((row) => row["id"]) : [],
  );
  const cashAdjustments = new Set(
    "cashAdjustments" in payload ? payload.cashAdjustments.map((row) => row["id"]) : [],
  );
  const cashMovements = new Set(
    "cashMovements" in payload ? payload.cashMovements.map((row) => row["id"]) : [],
  );
  const customerPayments = new Set(payload.payments.map((row) => row["id"]));
  const customerPaymentReversals = new Set(payload.paymentReversals.map((row) => row["id"]));
  const qualityIssueRows = "qualityIssueCodes" in payload ? payload.qualityIssueCodes : [];
  const goodsArrivalRows = "goodsArrivals" in payload ? payload.goodsArrivals : [];
  const goodsArrivalLineRows = "goodsArrivalLines" in payload ? payload.goodsArrivalLines : [];
  const goodsArrivalReversalRows =
    "goodsArrivalReversals" in payload ? payload.goodsArrivalReversals : [];
  const qualityInspectionRows = "qualityInspections" in payload ? payload.qualityInspections : [];
  const qualityInspectionIssueRows =
    "qualityInspectionIssues" in payload ? payload.qualityInspectionIssues : [];
  const qualityInspectionReversalRows =
    "qualityInspectionReversals" in payload ? payload.qualityInspectionReversals : [];
  const qualityDispositionRows =
    "qualityDispositions" in payload ? payload.qualityDispositions : [];
  const qualityDispositionAllocationRows =
    "qualityDispositionAllocations" in payload ? payload.qualityDispositionAllocations : [];
  const qualityDispositionReversalRows =
    "qualityDispositionReversals" in payload ? payload.qualityDispositionReversals : [];
  const costObservationRows = "costObservations" in payload ? payload.costObservations : [];
  const reconciliationObservationRows =
    "reconciliationObservations" in payload ? payload.reconciliationObservations : [];
  const debtObservationRows = "debtObservations" in payload ? payload.debtObservations : [];
  const workspacePolicyRows = "workspacePolicies" in payload ? payload.workspacePolicies : [];
  const supplyCommitmentObservationRows =
    "supplyCommitmentObservations" in payload ? payload.supplyCommitmentObservations : [];
  const supplierObservationRows =
    "supplierObservations" in payload ? payload.supplierObservations : [];
  const demandObservationRows = "demandObservations" in payload ? payload.demandObservations : [];
  const qualityIssueCodes = new Set(qualityIssueRows.map((row) => row["id"]));
  const goodsArrivals = new Set(goodsArrivalRows.map((row) => row["id"]));
  const goodsArrivalLines = new Set(goodsArrivalLineRows.map((row) => row["id"]));
  const qualityInspections = new Set(qualityInspectionRows.map((row) => row["id"]));
  const qualityDispositions = new Set(qualityDispositionRows.map((row) => row["id"]));
  const qualityDispositionReversals = new Set(
    qualityDispositionReversalRows.map((row) => row["id"]),
  );
  const allocationById = new Map(
    qualityDispositionAllocationRows.map((row) => [row["id"], row] as const),
  );
  const costObservationIds = new Set(costObservationRows.map((row) => row["id"]));
  const reconciliationObservationIds = new Set(
    reconciliationObservationRows.map((row) => row["id"]),
  );
  const debtObservationIds = new Set(debtObservationRows.map((row) => row["id"]));
  const supplyCommitmentObservationIds = new Set(
    supplyCommitmentObservationRows.map((row) => row["id"]),
  );
  const supplierObservationIds = new Set(supplierObservationRows.map((row) => row["id"]));
  const demandObservationIds = new Set(demandObservationRows.map((row) => row["id"]));
  const workspacePoliciesValid = workspacePolicyRows.every(
    (row) => workspacePolicyDtoSchema.safeParse({ ...row, workspaceId: source }).success,
  );
  return (
    (!("priceRules" in payload) ||
      payload.priceRules.every(
        (row) =>
          products.has(row["productId"]) &&
          hasGrade(row["qualityGradeId"]) &&
          (row["customerId"] == null || customers.has(row["customerId"])),
      )) &&
    payload.sales.every((row) => customers.has(row["customerId"])) &&
    payload.customerOrders.every(
      (row) =>
        (row["customerId"] == null || customers.has(row["customerId"])) &&
        (row["replacesCustomerOrderId"] == null ||
          customerOrders.has(row["replacesCustomerOrderId"])),
    ) &&
    payload.customerOrderLines.every(
      (row) =>
        customerOrders.has(row["customerOrderId"]) &&
        (row["productId"] == null || products.has(row["productId"])),
    ) &&
    payload.supplyCommitments.every(
      (row) =>
        suppliers.has(row["supplierId"]) &&
        (row["replacesSupplyCommitmentId"] == null ||
          supplyCommitments.has(row["replacesSupplyCommitmentId"])),
    ) &&
    payload.supplyCommitmentLines.every(
      (row) =>
        supplyCommitments.has(row["supplyCommitmentId"]) &&
        (row["productId"] == null || products.has(row["productId"])) &&
        hasGrade(row["qualityGradeId"]),
    ) &&
    payload.saleLines.every(
      (row) =>
        sales.has(row["saleId"]) &&
        (row["productId"] == null || products.has(row["productId"])) &&
        hasGrade(row["qualityGradeId"]),
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
          products.has(row["productId"]) &&
          hasGrade(row["qualityGradeId"]),
      )) &&
    (!("receiptReversals" in payload) ||
      payload.receiptReversals.every((row) => receipts.has(row["receiptId"]))) &&
    goodsArrivalRows.every(
      (row) =>
        suppliers.has(row["supplierId"]) &&
        (row["purchaseId"] == null || purchases.has(row["purchaseId"])),
    ) &&
    goodsArrivalLineRows.every((row) => {
      if (!goodsArrivals.has(row["arrivalId"]) || !products.has(row["productId"])) return false;
      const purchaseId = row["purchaseId"];
      const purchaseLineId = row["purchaseLineId"];
      return purchaseId == null && purchaseLineId == null
        ? true
        : purchases.has(purchaseId) && purchaseLines.has(purchaseLineId);
    }) &&
    goodsArrivalReversalRows.every((row) => goodsArrivals.has(row["arrivalId"])) &&
    qualityInspectionRows.every((row) => goodsArrivalLines.has(row["arrivalLineId"])) &&
    qualityInspectionIssueRows.every(
      (row) =>
        qualityInspections.has(row["inspectionId"]) &&
        qualityIssueCodes.has(row["qualityIssueCodeId"]),
    ) &&
    qualityInspectionReversalRows.every((row) => qualityInspections.has(row["inspectionId"])) &&
    qualityDispositionRows.every((row) => {
      if (row["sourceType"] === "arrival_line") {
        return (
          goodsArrivalLines.has(row["sourceArrivalLineId"]) &&
          row["sourceQuarantineAllocationId"] == null
        );
      }
      if (row["sourceType"] === "quarantine_allocation") {
        const source = allocationById.get(row["sourceQuarantineAllocationId"]);
        return (
          row["sourceArrivalLineId"] == null &&
          source !== undefined &&
          source["outcome"] === "quarantined"
        );
      }
      return false;
    }) &&
    qualityDispositionAllocationRows.every(
      (row) =>
        qualityDispositions.has(row["dispositionId"]) &&
        (row["qualityGradeId"] == null || hasGrade(row["qualityGradeId"])),
    ) &&
    qualityDispositionReversalRows.every((row) => qualityDispositions.has(row["dispositionId"])) &&
    costObservationRows.every(
      (row) =>
        (row["productId"] == null || products.has(row["productId"])) &&
        hasGrade(row["qualityGradeId"]) &&
        (row["caseKind"] === "correction"
          ? row["relatedObservationId"] != null &&
            costObservationIds.has(row["relatedObservationId"])
          : row["relatedObservationId"] == null),
    ) &&
    reconciliationObservationRows.every(
      (row) =>
        (row["productId"] == null || products.has(row["productId"])) &&
        hasGrade(row["qualityGradeId"]) &&
        (row["caseKind"] === "correction"
          ? row["relatedObservationId"] != null &&
            reconciliationObservationIds.has(row["relatedObservationId"])
          : row["relatedObservationId"] == null),
    ) &&
    debtObservationRows.every(
      (row) =>
        (row["customerId"] == null || customers.has(row["customerId"])) &&
        (row["caseKind"] === "correction"
          ? row["relatedObservationId"] != null &&
            debtObservationIds.has(row["relatedObservationId"])
          : row["relatedObservationId"] == null),
    ) &&
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
        if (!products.has(row["productId"]) || !hasGrade(row["qualityGradeId"])) return false;
        if (row["sourceType"] === "purchase_receipt") return receipts.has(row["sourceId"]);
        if (row["sourceType"] === "purchase_receipt_reversal")
          return receiptReversals.has(row["sourceId"]);
        if (row["sourceType"] === "delivery_dispatch")
          return deliveries.has(row["sourceId"]) && deliveryLines.has(row["sourceLineId"]);
        if (row["sourceType"] === "delivery_return")
          return deliveryReturns.has(row["sourceId"]) && deliveryLines.has(row["sourceLineId"]);
        if (row["sourceType"] === "quality_disposition") {
          const allocation = allocationById.get(row["sourceLineId"]);
          return (
            qualityDispositions.has(row["sourceId"]) &&
            allocation !== undefined &&
            allocation["dispositionId"] === row["sourceId"] &&
            allocation["outcome"] === "accepted"
          );
        }
        if (row["sourceType"] === "quality_disposition_reversal") {
          const allocation = allocationById.get(row["sourceLineId"]);
          return (
            qualityDispositionReversals.has(row["sourceId"]) &&
            allocation !== undefined &&
            allocation["outcome"] === "accepted"
          );
        }
        return (
          row["sourceType"] === "inventory_adjustment" ||
          row["sourceType"] === "inventory_reclassification"
        );
      })) &&
    (!("deliveries" in payload) || payload.deliveries.every((row) => sales.has(row["saleId"]))) &&
    (!("deliveryLines" in payload) ||
      payload.deliveryLines.every(
        (row) =>
          deliveries.has(row["deliveryId"]) &&
          products.has(row["productId"]) &&
          hasGrade(row["qualityGradeId"]) &&
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
      })) &&
    payload.payments.every(
      (row) => row["cashAccountId"] == null || cashAccounts.has(row["cashAccountId"]),
    ) &&
    (!("supplierPayments" in payload) ||
      payload.supplierPayments.every(
        (row) => row["cashAccountId"] == null || cashAccounts.has(row["cashAccountId"]),
      )) &&
    (!("expenses" in payload) ||
      payload.expenses.every((row) => cashAccounts.has(row["cashAccountId"]))) &&
    (!("expenseReversals" in payload) ||
      payload.expenseReversals.every((row) => expenses.has(row["expenseId"]))) &&
    (!("cashTransfers" in payload) ||
      payload.cashTransfers.every(
        (row) =>
          cashAccounts.has(row["fromCashAccountId"]) &&
          cashAccounts.has(row["toCashAccountId"]) &&
          row["fromCashAccountId"] !== row["toCashAccountId"],
      )) &&
    (!("cashTransferReversals" in payload) ||
      payload.cashTransferReversals.every((row) => cashTransfers.has(row["transferId"]))) &&
    (!("cashAdjustments" in payload) ||
      payload.cashAdjustments.every((row) => cashAccounts.has(row["cashAccountId"]))) &&
    workspacePoliciesValid &&
    supplyCommitmentObservationRows.every(
      (row) =>
        (row["supplierId"] == null || suppliers.has(row["supplierId"])) &&
        (row["productId"] == null || products.has(row["productId"])) &&
        (row["qualityGradeId"] == null || qualityGrades.has(row["qualityGradeId"])) &&
        (row["relatedObservationId"] == null ||
          supplyCommitmentObservationIds.has(row["relatedObservationId"])),
    ) &&
    supplierObservationRows.every(
      (row) =>
        (row["supplierId"] == null || suppliers.has(row["supplierId"])) &&
        (row["productId"] == null || products.has(row["productId"])) &&
        (row["qualityGradeId"] == null || qualityGrades.has(row["qualityGradeId"])) &&
        (row["caseKind"] === "correction"
          ? row["relatedObservationId"] != null &&
            supplierObservationIds.has(row["relatedObservationId"])
          : row["relatedObservationId"] == null),
    ) &&
    demandObservationRows.every(
      (row) =>
        (row["customerId"] == null || customers.has(row["customerId"])) &&
        (row["productId"] == null || products.has(row["productId"])) &&
        (row["qualityGradeId"] == null || qualityGrades.has(row["qualityGradeId"])) &&
        (row["caseKind"] === "correction"
          ? row["relatedObservationId"] != null &&
            demandObservationIds.has(row["relatedObservationId"])
          : row["relatedObservationId"] == null),
    ) &&
    (!("cashMovements" in payload) ||
      payload.cashMovements.every((row) => {
        if (!cashAccounts.has(row["cashAccountId"])) return false;
        if (
          row["reversalOfMovementId"] != null &&
          !cashMovements.has(row["reversalOfMovementId"])
        ) {
          return false;
        }
        if (row["sourceType"] === "customer_payment") return customerPayments.has(row["sourceId"]);
        if (row["sourceType"] === "customer_payment_reversal")
          return customerPaymentReversals.has(row["sourceId"]);
        if (row["sourceType"] === "supplier_payment") return supplierPayments.has(row["sourceId"]);
        if (row["sourceType"] === "supplier_payment_reversal")
          return supplierPaymentReversals.has(row["sourceId"]);
        if (row["sourceType"] === "expense") return expenses.has(row["sourceId"]);
        if (row["sourceType"] === "expense_reversal") return expenseReversals.has(row["sourceId"]);
        if (row["sourceType"] === "cash_transfer_out" || row["sourceType"] === "cash_transfer_in")
          return cashTransfers.has(row["sourceId"]);
        if (
          row["sourceType"] === "cash_transfer_reversal_out" ||
          row["sourceType"] === "cash_transfer_reversal_in"
        )
          return cashTransferReversals.has(row["sourceId"]);
        return row["sourceType"] === "cash_adjustment" && cashAdjustments.has(row["sourceId"]);
      }))
  );
}

function v17Payload(command: RestoreWorkspaceBackupCommand): WorkspaceBackupV17["payload"] {
  const payload = command.payload.backup.payload;
  const operationalProfile =
    "operationalProfile" in payload
      ? payload.operationalProfile
      : defaultWorkspaceOperationalProfile(command.payload.backup.sourceWorkspaceId);
  return {
    ...payload,
    operationalProfile,
    cashAccounts: "cashAccounts" in payload ? payload.cashAccounts : [],
    expenses: "expenses" in payload ? payload.expenses : [],
    expenseReversals: "expenseReversals" in payload ? payload.expenseReversals : [],
    cashTransfers: "cashTransfers" in payload ? payload.cashTransfers : [],
    cashTransferReversals: "cashTransferReversals" in payload ? payload.cashTransferReversals : [],
    cashAdjustments: "cashAdjustments" in payload ? payload.cashAdjustments : [],
    cashMovements: "cashMovements" in payload ? payload.cashMovements : [],
    qualityGrades: "qualityGrades" in payload ? payload.qualityGrades : [],
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
    qualityIssueCodes: "qualityIssueCodes" in payload ? payload.qualityIssueCodes : [],
    goodsArrivals: "goodsArrivals" in payload ? payload.goodsArrivals : [],
    goodsArrivalLines: "goodsArrivalLines" in payload ? payload.goodsArrivalLines : [],
    goodsArrivalReversals: "goodsArrivalReversals" in payload ? payload.goodsArrivalReversals : [],
    qualityInspections: "qualityInspections" in payload ? payload.qualityInspections : [],
    qualityInspectionIssues:
      "qualityInspectionIssues" in payload ? payload.qualityInspectionIssues : [],
    qualityInspectionReversals:
      "qualityInspectionReversals" in payload ? payload.qualityInspectionReversals : [],
    qualityDispositions: "qualityDispositions" in payload ? payload.qualityDispositions : [],
    qualityDispositionAllocations:
      "qualityDispositionAllocations" in payload ? payload.qualityDispositionAllocations : [],
    qualityDispositionReversals:
      "qualityDispositionReversals" in payload ? payload.qualityDispositionReversals : [],
    priceRules: "priceRules" in payload ? payload.priceRules : [],
    costObservations: "costObservations" in payload ? payload.costObservations : [],
    reconciliationObservations:
      "reconciliationObservations" in payload ? payload.reconciliationObservations : [],
    debtObservations: "debtObservations" in payload ? payload.debtObservations : [],
    workspacePolicies: "workspacePolicies" in payload ? payload.workspacePolicies : [],
    supplyCommitmentObservations:
      "supplyCommitmentObservations" in payload ? payload.supplyCommitmentObservations : [],
    supplierObservations: "supplierObservations" in payload ? payload.supplierObservations : [],
    demandObservations: "demandObservations" in payload ? payload.demandObservations : [],
    customerOrders: "customerOrders" in payload ? payload.customerOrders : [],
    customerOrderLines: "customerOrderLines" in payload ? payload.customerOrderLines : [],
    supplyCommitments: "supplyCommitments" in payload ? payload.supplyCommitments : [],
    supplyCommitmentLines: "supplyCommitmentLines" in payload ? payload.supplyCommitmentLines : [],
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
        v17Payload(command),
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
          v17Payload(command).suppliers.map((row) =>
            repos.supplierAccountReads.integrity(
              command.workspaceId,
              String(row["id"]) as Parameters<typeof repos.supplierAccountReads.integrity>[1],
            ),
          ),
        )
      ).flat();
      const inventoryKeys = new Map<
        string,
        { productId: string; qualityGradeId: string | null; unit: string }
      >();
      for (const movement of v17Payload(command).inventoryMovements) {
        const qualityGradeId =
          movement["qualityGradeId"] === null || movement["qualityGradeId"] === undefined
            ? null
            : String(movement["qualityGradeId"]);
        inventoryKeys.set(
          `${String(movement["productId"])}:${qualityGradeId ?? "legacy"}:${String(movement["unit"])}`,
          {
            productId: String(movement["productId"]),
            qualityGradeId,
            unit: String(movement["unit"]),
          },
        );
      }
      const inventoryDiagnostics = (
        await Promise.all(
          [...inventoryKeys.values()].map(({ productId, qualityGradeId, unit }) =>
            repos.inventoryReads.integrity(
              command.workspaceId,
              productId as Parameters<typeof repos.inventoryReads.integrity>[1],
              qualityGradeId as Parameters<typeof repos.inventoryReads.integrity>[2],
              unit as Parameters<typeof repos.inventoryReads.integrity>[3],
            ),
          ),
        )
      ).flat();
      const cashDiagnostics = (
        await Promise.all(
          v17Payload(command).cashAccounts.map((row) =>
            repos.cashReads.reconciliation(
              command.workspaceId,
              String(row["id"]) as Parameters<typeof repos.cashReads.reconciliation>[1],
            ),
          ),
        )
      ).filter((result) => result.status !== "consistent");
      if (
        supplierDiagnostics.length > 0 ||
        inventoryDiagnostics.length > 0 ||
        cashDiagnostics.length > 0
      ) {
        return err("BACKUP_INTEGRITY_ERROR", "Restored operational ledgers did not reconcile.", {
          supplierDiagnostics,
          inventoryDiagnostics,
          cashDiagnostics,
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
