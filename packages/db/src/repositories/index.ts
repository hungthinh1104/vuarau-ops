import type { CurrencyCode } from "@vuarau/domain-contracts";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { createWorkspaceWriteRepositories } from "./write/workspace.ts";
import { createCustomerWriteRepositories } from "./write/customer.ts";
import { createProductWriteRepositories } from "./write/product.ts";
import { createSupplierWriteRepositories } from "./write/supplier.ts";
import { createPurchaseWriteRepositories } from "./write/purchase.ts";
import { createInventoryWriteRepositories } from "./write/inventory.ts";
import { createDeliveryWriteRepositories } from "./write/delivery.ts";
import { createDocumentWriteRepositories } from "./write/document.ts";
import { createOperationsWriteRepositories } from "./write/operations.ts";
import { createSaleWriteRepositories } from "./write/sale.ts";
import { createPaymentWriteRepositories } from "./write/payment.ts";
import { createAccountWriteRepositories } from "./write/account.ts";
import { createAuditWriteRepositories } from "./write/audit.ts";
import { createReceiptWriteRepositories } from "./write/receipt.ts";

type Tx = PgTransaction<never, never, never>;
export type IdMinter = { newId(): string };

export function createRepositories(tx: Tx, ids: IdMinter) {
  return {
    ...createWorkspaceWriteRepositories(tx),
    ...createCustomerWriteRepositories(tx),
    ...createProductWriteRepositories(tx),
    ...createSupplierWriteRepositories(tx, ids),
    ...createPurchaseWriteRepositories(tx),
    ...createInventoryWriteRepositories(tx, ids),
    ...createDeliveryWriteRepositories(tx),
    ...createDocumentWriteRepositories(tx),
    ...createOperationsWriteRepositories(tx),
    ...createSaleWriteRepositories(tx),
    ...createPaymentWriteRepositories(tx),
    ...createAccountWriteRepositories(tx, ids),
    ...createAuditWriteRepositories(tx, ids),
    ...createReceiptWriteRepositories(tx),
  };
}

export type { CurrencyCode };
