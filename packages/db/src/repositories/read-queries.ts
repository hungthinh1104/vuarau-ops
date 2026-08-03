import type { Tx } from "./shared/types.ts";
import { createCustomerReadRepositories } from "./read/customer.ts";
import { createProductReadRepositories } from "./read/product.ts";
import { createPriceRuleReadRepositories } from "./read/pricing.ts";
import { createQualityGradeReadRepositories } from "./read/quality.ts";
import { createSupplierReadRepositories } from "./read/supplier.ts";
import { createPurchaseReadRepositories } from "./read/purchase.ts";
import { createInventoryReadRepositories } from "./read/inventory.ts";
import { createDeliveryReadRepositories } from "./read/delivery.ts";
import { createDocumentReadRepositories } from "./read/document.ts";
import { createReportReadRepositories } from "./read/report.ts";
import { createSaleReadRepositories } from "./read/sale.ts";
import { createPaymentReadRepositories } from "./read/payment.ts";
import { createAccountReadRepositories } from "./read/account.ts";
import { createOperationsReadRepositories } from "./read/operations.ts";
import { createAuditReadRepositories } from "./read/audit.ts";
import { createCashReadRepositories } from "./read/cash.ts";
import { createIntakeReadRepositories } from "./read/intake.ts";
import { createCostObservationReadRepositories } from "./read/cost-observation.ts";
import { createReconciliationObservationReadRepositories } from "./read/reconciliation-observation.ts";
import { createDebtObservationReadRepositories } from "./read/debt-observation.ts";

export function createReadRepositories(tx: Tx) {
  return {
    ...createCustomerReadRepositories(tx),
    ...createProductReadRepositories(tx),
    ...createPriceRuleReadRepositories(tx),
    ...createQualityGradeReadRepositories(tx),
    ...createSupplierReadRepositories(tx),
    ...createPurchaseReadRepositories(tx),
    ...createInventoryReadRepositories(tx),
    ...createDeliveryReadRepositories(tx),
    ...createDocumentReadRepositories(tx),
    ...createReportReadRepositories(tx),
    ...createSaleReadRepositories(tx),
    ...createPaymentReadRepositories(tx),
    ...createAccountReadRepositories(tx),
    ...createOperationsReadRepositories(tx),
    ...createAuditReadRepositories(tx),
    ...createCashReadRepositories(tx),
    ...createIntakeReadRepositories(tx),
    ...createCostObservationReadRepositories(tx),
    ...createReconciliationObservationReadRepositories(tx),
    ...createDebtObservationReadRepositories(tx),
  };
}

export type ReadRepositories = ReturnType<typeof createReadRepositories>;
