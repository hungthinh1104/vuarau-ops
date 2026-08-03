import type { CurrencyCode } from "@vuarau/domain-contracts";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { createWorkspaceWriteRepositories } from "./write/workspace.ts";
import { createCustomerWriteRepositories } from "./write/customer.ts";
import { createProductWriteRepositories } from "./write/product.ts";
import { createPriceRuleWriteRepositories } from "./write/pricing.ts";
import { createQualityGradeWriteRepositories } from "./write/quality.ts";
import { createSupplierWriteRepositories } from "./write/supplier.ts";
import { createPurchaseWriteRepositories } from "./write/purchase.ts";
import { createInventoryWriteRepositories } from "./write/inventory.ts";
import { createDeliveryWriteRepositories } from "./write/delivery.ts";
import { createDocumentWriteRepositories } from "./write/document.ts";
import { createOperationsWriteRepositories } from "./write/operations.ts";
import { createSaleWriteRepositories } from "./write/sale.ts";
import { createPaymentWriteRepositories } from "./write/payment.ts";
import { createPaymentAllocationWriteRepositories } from "./write/payment-allocation.ts";
import { createAccountWriteRepositories } from "./write/account.ts";
import { createAuditWriteRepositories } from "./write/audit.ts";
import { createReceiptWriteRepositories } from "./write/receipt.ts";
import { createCashWriteRepositories } from "./write/cash.ts";
import { createIntakeWriteRepositories } from "./write/intake.ts";
import { createCostObservationWriteRepositories } from "./write/cost-observation.ts";
import { createReconciliationObservationWriteRepositories } from "./write/reconciliation-observation.ts";
import { createDebtObservationWriteRepositories } from "./write/debt-observation.ts";
import { createSupplyCommitmentObservationWriteRepositories } from "./write/supply-commitment-observation.ts";
import { createWorkspacePolicyWriteRepositories } from "./write/policy.ts";
import { createWorkspacePolicyReadRepositories } from "./read/policy.ts";
import { createSupplyCommitmentObservationReadRepositories } from "./read/supply-commitment-observation.ts";
import { createSupplierObservationWriteRepositories } from "./write/supplier-observation.ts";
import { createSupplierObservationReadRepositories } from "./read/supplier-observation.ts";
import { createDemandObservationWriteRepositories } from "./write/demand-observation.ts";
import { createDemandObservationReadRepositories } from "./read/demand-observation.ts";
import { createCustomerOrderWriteRepositories } from "./write/customer-order.ts";
import { createSupplyCommitmentWriteRepositories } from "./write/supply-commitment.ts";
import { createSupplyCommitmentReadRepositories } from "./read/supply-commitment.ts";
import { createStocktakeReadRepositories } from "./read/stocktake.ts";
import { createStocktakeWriteRepositories } from "./write/stocktake.ts";
import { createCloseWriteRepositories } from "./write/close.ts";
import { createCloseReadRepositories } from "./read/close.ts";

type Tx = PgTransaction<never, never, never>;
export type IdMinter = { newId(): string };

export function createRepositories(tx: Tx, ids: IdMinter) {
  return {
    ...createWorkspaceWriteRepositories(tx),
    ...createCustomerWriteRepositories(tx),
    ...createProductWriteRepositories(tx),
    ...createPriceRuleWriteRepositories(tx),
    ...createQualityGradeWriteRepositories(tx),
    ...createSupplierWriteRepositories(tx, ids),
    ...createPurchaseWriteRepositories(tx),
    ...createInventoryWriteRepositories(tx, ids),
    ...createDeliveryWriteRepositories(tx),
    ...createDocumentWriteRepositories(tx),
    ...createOperationsWriteRepositories(tx),
    ...createSaleWriteRepositories(tx),
    ...createPaymentWriteRepositories(tx),
    ...createPaymentAllocationWriteRepositories(tx),
    ...createAccountWriteRepositories(tx, ids),
    ...createAuditWriteRepositories(tx, ids),
    ...createReceiptWriteRepositories(tx),
    ...createCashWriteRepositories(tx, ids),
    ...createIntakeWriteRepositories(tx),
    ...createCostObservationWriteRepositories(tx),
    ...createReconciliationObservationWriteRepositories(tx),
    ...createDebtObservationWriteRepositories(tx),
    ...createSupplyCommitmentObservationWriteRepositories(tx),
    ...createWorkspacePolicyWriteRepositories(tx),
    ...createWorkspacePolicyReadRepositories(tx),
    ...createSupplyCommitmentObservationReadRepositories(tx),
    ...createSupplierObservationWriteRepositories(tx),
    ...createDemandObservationWriteRepositories(tx),
    ...createSupplierObservationReadRepositories(tx),
    ...createDemandObservationReadRepositories(tx),
    ...createCustomerOrderWriteRepositories(tx),
    ...createSupplyCommitmentWriteRepositories(tx),
    ...createSupplyCommitmentReadRepositories(tx),
    ...createStocktakeWriteRepositories(tx),
    ...createStocktakeReadRepositories(tx),
    ...createCloseWriteRepositories(tx),
    ...createCloseReadRepositories(tx),
  };
}

export type { CurrencyCode };
