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
import { createPaymentRepositories } from "./repositories/payment.ts";
import { createProductRepositories } from "./repositories/product.ts";
import { createPurchaseRepositories } from "./repositories/purchase.ts";
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
import { createPaymentReads } from "./reads/payment.ts";
import { createProductReads } from "./reads/product.ts";
import { createPurchaseReads } from "./reads/purchase.ts";
import { createQualityGradeReads } from "./reads/quality.ts";
import { createReportReads } from "./reads/report.ts";
import { createSaleReads } from "./reads/sale.ts";
import { createSupplierReads } from "./reads/supplier.ts";

export const createInMemoryRepositories = (store: Store, ids: IdGenerator): Repositories => ({
  ...createWorkspaceRepositories(store),
  ...createCustomerRepositories(store),
  ...createProductRepositories(store),
  ...createQualityGradeRepositories(store),
  ...createSupplierRepositories(store, ids),
  ...createPurchaseRepositories(store),
  ...createInventoryRepositories(store, ids),
  ...createDeliveryRepositories(store),
  ...createDocumentRepositories(store),
  ...createOperationsRepositories(store),
  ...createCashRepositories(store, ids),
  ...createIntakeRepositories(store),
  ...createSaleRepositories(store),
  ...createPaymentRepositories(store),
  ...createAccountRepositories(store, ids),
  ...createAuditRepositories(store, ids),
  ...createReceiptRepositories(store),
  ...createCustomerReads(store),
  ...createProductReads(store),
  ...createQualityGradeReads(store),
  ...createSupplierReads(store),
  ...createPurchaseReads(store),
  ...createInventoryReads(store),
  ...createDeliveryReads(store),
  ...createDocumentReads(store),
  ...createReportReads(store),
  ...createSaleReads(store),
  ...createPaymentReads(store),
  ...createAccountReads(store),
  ...createOperationsReads(store),
  ...createCashReads(store),
  ...createIntakeReads(store),
  ...createAuditReads(store),
});
