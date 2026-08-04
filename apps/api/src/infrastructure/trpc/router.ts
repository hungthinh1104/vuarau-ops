import { router } from "./trpc.ts";
import { sessionRouter } from "./routers/session.ts";
import { customerRouter, accountRouter, debtRouter } from "./routers/customer.ts";
import { saleRouter } from "./routers/sale.ts";
import { paymentRouter } from "./routers/payment.ts";
import { productRouter } from "./routers/product.ts";
import { qualityRouter } from "./routers/quality.ts";
import { supplierRouter } from "./routers/supplier.ts";
import { purchaseRouter } from "./routers/purchase.ts";
import { receivingRouter, inventoryRouter } from "./routers/inventory.ts";
import { deliveryRouter } from "./routers/delivery.ts";
import { documentRouter } from "./routers/document.ts";
import { reportRouter } from "./routers/report.ts";
import { dashboardRouter } from "./routers/dashboard.ts";
import { operationsRouter, auditRouter } from "./routers/operations.ts";
import { cashRouter } from "./routers/cash.ts";
import { intakeRouter } from "./routers/intake.ts";
import { pricingRouter } from "./routers/pricing.ts";
import { evidenceRouter } from "./routers/evidence.ts";
import { policyRouter } from "./routers/policy.ts";
import { customerOrderRouter } from "./routers/customer-order.ts";
import { supplyCommitmentRouter } from "./routers/supply-commitment.ts";

export const appRouter = router({
  session: sessionRouter,
  customer: customerRouter,
  sale: saleRouter,
  payment: paymentRouter,
  account: accountRouter,
  audit: auditRouter,
  debt: debtRouter,
  product: productRouter,
  quality: qualityRouter,
  supplier: supplierRouter,
  purchase: purchaseRouter,
  receiving: receivingRouter,
  inventory: inventoryRouter,
  delivery: deliveryRouter,
  document: documentRouter,
  report: reportRouter,
  dashboard: dashboardRouter,
  operations: operationsRouter,
  cash: cashRouter,
  intake: intakeRouter,
  pricing: pricingRouter,
  evidence: evidenceRouter,
  policy: policyRouter,
  customerOrder: customerOrderRouter,
  supplyCommitment: supplyCommitmentRouter,
});

export type AppRouter = typeof appRouter;
