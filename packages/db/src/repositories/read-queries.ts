import type { Tx } from "./shared/types.ts";
import { createCustomerReadRepositories } from "./read/customer.ts";
import { createProductReadRepositories } from "./read/product.ts";
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

export function createReadRepositories(tx: Tx) {
  return {
    ...createCustomerReadRepositories(tx),
    ...createProductReadRepositories(tx),
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
  };
}

export type ReadRepositories = ReturnType<typeof createReadRepositories>;
