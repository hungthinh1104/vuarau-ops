import type { IdGenerator } from "../../clock.ts";
import type { Repositories } from "../ports.ts";
import type { Store } from "./store.ts";
import { createAccountRepositories } from "./repositories/account.ts";
import { createAuditRepositories } from "./repositories/audit.ts";
import { createCashRepositories } from "./repositories/cash.ts";
import { createCustomerRepositories } from "./repositories/customer.ts";
import { createDeliveryRepositories } from "./repositories/delivery.ts";
import { createDocumentRepositories } from "./repositories/document.ts";
import { createIntakeRepositories } from "./repositories/intake.ts";
import { createInventoryRepositories } from "./repositories/inventory.ts";
import { createOperationsRepositories } from "./repositories/operations.ts";
import { createCostObservationRepositories } from "./repositories/cost-observation.ts";
import { createReconciliationObservationRepositories } from "./repositories/reconciliation-observation.ts";
import { createDebtObservationRepositories } from "./repositories/debt-observation.ts";
import { createSupplyCommitmentObservationRepositories } from "./repositories/supply-commitment-observation.ts";
import { createSupplierObservationRepositories } from "./repositories/supplier-observation.ts";
import { createDemandObservationRepositories } from "./repositories/demand-observation.ts";
import { createWorkspacePolicyRepositories } from "./repositories/policy.ts";
import { createPaymentRepositories } from "./repositories/payment.ts";
import { createProductRepositories } from "./repositories/product.ts";
import { createPriceRuleRepositories } from "./repositories/pricing.ts";
import { createPurchaseRepositories } from "./repositories/purchase.ts";
import { createCustomerOrderRepositories } from "./repositories/customer-order.ts";
import { createSupplyCommitmentRepositories } from "./repositories/supply-commitment.ts";
import { createQualityGradeRepositories } from "./repositories/quality.ts";
import { createReceiptRepositories } from "./repositories/receipt.ts";
import { createSaleRepositories } from "./repositories/sale.ts";
import { createSupplierRepositories } from "./repositories/supplier.ts";
import { createWorkspaceRepositories } from "./repositories/workspace.ts";
import { createAccountReads } from "./reads/account.ts";
import { createAuditReads } from "./reads/audit.ts";
import { createCashReads } from "./reads/cash.ts";
import { createCustomerReads } from "./reads/customer.ts";
import { createDeliveryReads } from "./reads/delivery.ts";
import { createDocumentReads } from "./reads/document.ts";
import { createIntakeReads } from "./reads/intake.ts";
import { createInventoryReads } from "./reads/inventory.ts";
import { createOperationsReads } from "./reads/operations.ts";
import { createCostObservationReads } from "./reads/cost-observation.ts";
import { createReconciliationObservationReads } from "./reads/reconciliation-observation.ts";
import { createDebtObservationReads } from "./reads/debt-observation.ts";
import { createSupplyCommitmentObservationReads } from "./reads/supply-commitment-observation.ts";
import { createSupplierObservationReads } from "./reads/supplier-observation.ts";
import { createDemandObservationReads } from "./reads/demand-observation.ts";
import { createWorkspacePolicyReads } from "./reads/policy.ts";
import { createPaymentReads } from "./reads/payment.ts";
import { createProductReads } from "./reads/product.ts";
import { createPriceRuleReads } from "./reads/pricing.ts";
import { createPurchaseReads } from "./reads/purchase.ts";
import { createCustomerOrderReads } from "./reads/customer-order.ts";
import { createSupplyCommitmentReads } from "./reads/supply-commitment.ts";
import { createQualityGradeReads } from "./reads/quality.ts";
import { createReportReads } from "./reads/report.ts";
import { createSaleReads } from "./reads/sale.ts";
import { createSupplierReads } from "./reads/supplier.ts";

export const createInMemoryRepositories = (store: Store, ids: IdGenerator): Repositories => ({
  ...createWorkspaceRepositories(store),
  ...createCustomerRepositories(store),
  ...createProductRepositories(store),
  ...createPriceRuleRepositories(store),
  ...createQualityGradeRepositories(store),
  ...createSupplierRepositories(store, ids),
  ...createPurchaseRepositories(store),
  ...createCustomerOrderRepositories(store),
  ...createSupplyCommitmentRepositories(store),
  ...createInventoryRepositories(store, ids),
  ...createDeliveryRepositories(store),
  ...createDocumentRepositories(store),
  ...createOperationsRepositories(store),
  ...createCostObservationRepositories(store),
  ...createReconciliationObservationRepositories(store),
  ...createDebtObservationRepositories(store),
  ...createSupplyCommitmentObservationRepositories(store),
  ...createSupplierObservationRepositories(store),
  ...createDemandObservationRepositories(store),
  ...createWorkspacePolicyRepositories(store),
  ...createCashRepositories(store, ids),
  ...createIntakeRepositories(store),
  ...createSaleRepositories(store),
  ...createPaymentRepositories(store),
  ...createAccountRepositories(store, ids),
  ...createAuditRepositories(store, ids),
  ...createReceiptRepositories(store),
  ...createCustomerReads(store),
  ...createProductReads(store),
  ...createPriceRuleReads(store),
  ...createQualityGradeReads(store),
  ...createSupplierReads(store),
  ...createPurchaseReads(store),
  ...createCustomerOrderReads(store),
  ...createSupplyCommitmentReads(store),
  ...createInventoryReads(store),
  ...createDeliveryReads(store),
  ...createDocumentReads(store),
  ...createReportReads(store),
  ...createSaleReads(store),
  ...createPaymentReads(store),
  ...createAccountReads(store),
  ...createOperationsReads(store),
  ...createCostObservationReads(store),
  ...createReconciliationObservationReads(store),
  ...createDebtObservationReads(store),
  ...createSupplyCommitmentObservationReads(store),
  ...createSupplierObservationReads(store),
  ...createDemandObservationReads(store),
  ...createWorkspacePolicyReads(store),
  ...createCashReads(store),
  ...createIntakeReads(store),
  ...createAuditReads(store),
});
