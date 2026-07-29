import { z } from "zod";
import {
  accountTimelineInputSchema,
  accountReconciliationInputSchema,
  addWorkspaceMemberCommandSchema,
  accountAdjustmentGetInputSchema,
  adjustCustomerDebtCommandSchema,
  auditTimelineInputSchema,
  createCustomerCommandSchema,
  changeWorkspaceMemberRoleCommandSchema,
  createSaleDraftCommandSchema,
  deactivateCustomerCommandSchema,
  duplicateCustomerInputSchema,
  discardSaleDraftCommandSchema,
  customerIdSchema,
  getCustomerInputSchema,
  recentCustomersInputSchema,
  getPaymentInputSchema,
  getSaleInputSchema,
  saleCaptureContextInputSchema,
  saleDetailInputSchema,
  listPaymentsInputSchema,
  listSalesInputSchema,
  postSaleCommandSchema,
  recordCustomerPaymentCommandSchema,
  reverseCustomerPaymentCommandSchema,
  rebuildAccountProjectionCommandSchema,
  reactivateWorkspaceMemberCommandSchema,
  reactivateCustomerCommandSchema,
  revokeWorkspaceMembershipCommandSchema,
  searchCustomersInputSchema,
  updateCustomerCommandSchema,
  updateSaleDraftCommandSchema,
  voidSaleCommandSchema,
  workspaceIdSchema,
  workspaceDetailInputSchema,
  createProductCommandSchema,
  updateProductCommandSchema,
  deactivateProductCommandSchema,
  reactivateProductCommandSchema,
  productSearchInputSchema,
  productGetInputSchema,
  validateWorkspaceBackupInputSchema,
  workspaceIntegrityInputSchema,
  restoreWorkspaceBackupCommandSchema,
  exportWorkspaceBackupCommandSchema,
  createSupplierCommandSchema,
  updateSupplierCommandSchema,
  deactivateSupplierCommandSchema,
  reactivateSupplierCommandSchema,
  recordSupplierPaymentCommandSchema,
  reverseSupplierPaymentCommandSchema,
  adjustSupplierAccountCommandSchema,
  supplierSearchInputSchema,
  supplierGetInputSchema,
  supplierAccountInputSchema,
  supplierAccountTimelineInputSchema,
  supplierPaymentGetInputSchema,
  supplierAdjustmentGetInputSchema,
  createPurchaseDraftCommandSchema,
  updatePurchaseDraftCommandSchema,
  discardPurchaseDraftCommandSchema,
  confirmPurchaseCommandSchema,
  voidPurchaseCommandSchema,
  purchaseGetInputSchema,
  purchaseListInputSchema,
  recordPurchaseReceiptCommandSchema,
  reversePurchaseReceiptCommandSchema,
  adjustInventoryCommandSchema,
  receiptGetInputSchema,
  purchaseReceiptsInputSchema,
  inventoryBalanceInputSchema,
  inventoryTimelineInputSchema,
  inventoryAdjustmentGetInputSchema,
  rebuildSupplierAccountCommandSchema,
  inventoryReconciliationInputSchema,
  rebuildInventoryCommandSchema,
  createDeliveryDraftCommandSchema,
  updateDeliveryDraftCommandSchema,
  cancelDeliveryDraftCommandSchema,
  dispatchDeliveryCommandSchema,
  markDeliveryDeliveredCommandSchema,
  recordDeliveryReturnCommandSchema,
  deliveryGetInputSchema,
  deliveryListInputSchema,
  saleFulfilmentInputSchema,
  generateDocumentCommandSchema,
  createDocumentShareCommandSchema,
  revokeDocumentShareCommandSchema,
  documentGetInputSchema,
  documentSourceInputSchema,
  reportInputSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "./trpc.ts";
import { createCustomer } from "../../modules/customer/create-customer.handler.ts";
import {
  deactivateCustomer,
  reactivateCustomer,
  updateCustomer,
} from "../../modules/customer/update-customer.handler.ts";
import { discardSaleDraft, updateSaleDraft } from "../../modules/sale/edit-sale-draft.handler.ts";
import { revokeWorkspaceMembership } from "../../modules/session/revoke-membership.handler.ts";
import {
  addWorkspaceMember,
  changeWorkspaceMemberRole,
  reactivateWorkspaceMember,
} from "../../modules/session/manage-membership.handler.ts";
import { createSaleDraft } from "../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../modules/sale/post-sale.handler.ts";
import { voidSale } from "../../modules/sale/void-sale.handler.ts";
import { recordCustomerPayment } from "../../modules/payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../../modules/payment/reverse-payment.handler.ts";
import { adjustCustomerDebt } from "../../modules/account/adjust-debt.handler.ts";
import {
  exportAccountReconciliationEvidence,
  getCustomerAccountBalance,
  getCustomerAccountTimeline,
  getAccountAdjustmentDetail,
  getAccountReconciliation,
} from "../../modules/account/account.queries.ts";
import { rebuildAccountProjection } from "../../modules/account/rebuild-account-projection.handler.ts";
import {
  getCustomer,
  findPossibleDuplicateCustomers,
  recentCustomers,
  searchCustomers,
} from "../../modules/customer/customer.queries.ts";
import {
  captureContext,
  getSale,
  getSaleDetail,
  listSales,
} from "../../modules/sale/sale.queries.ts";
import { getPayment, listPayments } from "../../modules/payment/payment.queries.ts";
import { getAuditTimeline } from "../../modules/audit/audit.queries.ts";
import {
  getSession,
  getWorkspaceDetail,
  listActorWorkspaces,
} from "../../modules/session/session.queries.ts";
import {
  createProduct,
  deactivateProduct,
  reactivateProduct,
  updateProduct,
} from "../../modules/product/product.handlers.ts";
import { getProduct, searchProducts } from "../../modules/product/product.queries.ts";
import {
  exportWorkspaceBackup,
  getWorkspaceIntegrity,
  validateWorkspaceBackup,
} from "../../modules/operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../../modules/operations/restore-workspace.handler.ts";
import {
  adjustSupplierAccount,
  createSupplier,
  deactivateSupplier,
  reactivateSupplier,
  recordSupplierPayment,
  reverseSupplierPayment,
  updateSupplier,
} from "../../modules/supplier/supplier.handlers.ts";
import {
  getSupplier,
  getSupplierBalance,
  getSupplierPayment,
  getSupplierAdjustment,
  getSupplierTimeline,
  searchSuppliers,
  getSupplierReconciliation,
} from "../../modules/supplier/supplier.queries.ts";
import { rebuildSupplierAccount } from "../../modules/supplier/rebuild-supplier-account.handler.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
  discardPurchaseDraft,
  updatePurchaseDraft,
  voidPurchase,
} from "../../modules/purchase/purchase.handlers.ts";
import { getPurchase, listPurchases } from "../../modules/purchase/purchase.queries.ts";
import {
  adjustInventory,
  recordPurchaseReceipt,
  reversePurchaseReceipt,
} from "../../modules/inventory/inventory.handlers.ts";
import {
  getInventoryBalances,
  getInventoryTimeline,
  getInventoryAdjustment,
  getReceipt,
  getInventoryReconciliation,
  getPurchaseReceivingSummary,
  listPurchaseReceipts,
} from "../../modules/inventory/inventory.queries.ts";
import { rebuildInventory } from "../../modules/inventory/rebuild-inventory.handler.ts";
import {
  cancelDeliveryDraft,
  createDeliveryDraft,
  dispatchDelivery,
  markDeliveryDelivered,
  recordDeliveryReturn,
  updateDeliveryDraft,
} from "../../modules/delivery/delivery.handlers.ts";
import {
  getDelivery,
  getSaleFulfilment,
  listDeliveries,
} from "../../modules/delivery/delivery.queries.ts";
import {
  createDocumentShare,
  generateDocument,
  revokeDocumentShare,
} from "../../modules/document/document.handlers.ts";
import { getDocument, listDocumentsForSource } from "../../modules/document/document.queries.ts";
import {
  getOperationalReport,
  getOperationalReportCsv,
} from "../../modules/report/report.queries.ts";

/**
 * Twelve mutations, one per business command. No `update`, no `patch`, and no
 * procedure that takes a status as an argument (ADR-0002).
 *
 * Every procedure — read or write — requires a verified identity. There is no
 * `publicProcedure` in this router on purpose: a depot's account book has no
 * public surface, and an unauthenticated read was a P0 leak before Milestone 1.
 *
 * `rebuildCustomerAccountBalance` is deliberately absent: it is an operator's
 * maintenance tool, not something a UI should be able to trigger.
 */
/**
 * The read surface a first UI needs, added alongside the commands rather than in
 * a separate namespace: a screen that lists sales and posts one is talking about
 * the same thing, and splitting `sale.list` from `sale.post` across two routers
 * would only make the client assemble what the model already joins.
 *
 * Every read is authorized exactly like a command, through the same
 * `authorizeWorkspaceAccess` (BR-AUTH-001). Reads were the hole before
 * Milestone 1 and the shape of that mistake is one query at a time.
 */
const sessionRouter = router({
  me: authenticatedProcedure
    .input(z.object({ workspaceId: workspaceIdSchema }))
    .query(async ({ ctx, input }) => unwrap(await getSession(ctx, input.workspaceId))),

  /**
   * The depots this caller may act in — asked before `me`, because a client
   * cannot ask "what may I do here" until it knows what "here" can be.
   *
   * **The input is empty on purpose.** An `actorId` field would be a field to
   * tamper with; the answer comes from the verified token instead (BR-AUTH-008).
   *
   * `strictObject` rather than `object`: a caller who sends `{ actorId }` is told
   * so. A silently dropped field is a field somebody eventually believes in, and
   * "I asked for their workspaces and got mine" is the sort of surprise that ends
   * with a client writing its own filter.
   */
  workspaces: authenticatedProcedure
    .input(z.strictObject({}))
    .query(async ({ ctx }) => unwrap(await listActorWorkspaces(ctx))),

  /**
   * Revocation takes effect on the **next request**: membership is re-read on
   * every command and every query, so there is no session to expire.
   */
  revokeMembership: commandProcedure
    .input(revokeWorkspaceMembershipCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await revokeWorkspaceMembership(ctx, input))),

  workspace: authenticatedProcedure
    .input(workspaceDetailInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getWorkspaceDetail(ctx, input.workspaceId))),

  addMember: commandProcedure
    .input(addWorkspaceMemberCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await addWorkspaceMember(ctx, input))),

  changeMemberRole: commandProcedure
    .input(changeWorkspaceMemberRoleCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await changeWorkspaceMemberRole(ctx, input))),

  reactivateMember: commandProcedure
    .input(reactivateWorkspaceMemberCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateWorkspaceMember(ctx, input))),
});

const customerRouter = router({
  create: commandProcedure
    .input(createCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createCustomer(ctx, input))),

  update: commandProcedure
    .input(updateCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateCustomer(ctx, input))),

  deactivate: commandProcedure
    .input(deactivateCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateCustomer(ctx, input))),

  reactivate: commandProcedure
    .input(reactivateCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateCustomer(ctx, input))),

  search: authenticatedProcedure
    .input(searchCustomersInputSchema)
    .query(async ({ ctx, input }) => unwrap(await searchCustomers(ctx, input))),

  get: authenticatedProcedure
    .input(getCustomerInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCustomer(ctx, input))),

  recent: authenticatedProcedure
    .input(recentCustomersInputSchema)
    .query(async ({ ctx, input }) => unwrap(await recentCustomers(ctx, input))),

  duplicates: authenticatedProcedure
    .input(duplicateCustomerInputSchema)
    .query(async ({ ctx, input }) => unwrap(await findPossibleDuplicateCustomers(ctx, input))),
});

const saleRouter = router({
  createDraft: commandProcedure
    .input(createSaleDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createSaleDraft(ctx, input))),

  updateDraft: commandProcedure
    .input(updateSaleDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateSaleDraft(ctx, input))),

  discardDraft: commandProcedure
    .input(discardSaleDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await discardSaleDraft(ctx, input))),

  post: commandProcedure
    .input(postSaleCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await postSale(ctx, input))),

  void: commandProcedure
    .input(voidSaleCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await voidSale(ctx, input))),

  get: authenticatedProcedure
    .input(getSaleInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSale(ctx, input))),

  list: authenticatedProcedure
    .input(listSalesInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listSales(ctx, input))),

  captureContext: authenticatedProcedure
    .input(saleCaptureContextInputSchema)
    .query(async ({ ctx, input }) => unwrap(await captureContext(ctx, input))),

  detail: authenticatedProcedure
    .input(saleDetailInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSaleDetail(ctx, input))),
});

const paymentRouter = router({
  record: commandProcedure
    .input(recordCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordCustomerPayment(ctx, input))),

  reverse: commandProcedure
    .input(reverseCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseCustomerPayment(ctx, input))),

  get: authenticatedProcedure
    .input(getPaymentInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getPayment(ctx, input))),

  list: authenticatedProcedure
    .input(listPaymentsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listPayments(ctx, input))),
});

/**
 * Reading an account and adjusting one live in different namespaces on purpose:
 * `account.*` is the record, `debt.adjust` is the one command that moves it by
 * hand. Keeping the sharpest command visibly separate from the ordinary reads is
 * worth the small asymmetry (ADR-0013, retained terminology).
 */
const accountRouter = router({
  adjustment: authenticatedProcedure
    .input(accountAdjustmentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getAccountAdjustmentDetail(ctx, input))),
  balance: authenticatedProcedure
    .input(z.object({ workspaceId: workspaceIdSchema, customerId: customerIdSchema }))
    .query(async ({ ctx, input }) =>
      unwrap(await getCustomerAccountBalance(ctx, input.workspaceId, input.customerId)),
    ),

  /**
   * The only published way to read the ledger.
   *
   * There was a second one, `account.entries`, which returned every entry a
   * customer had with no cursor and no upper bound. It was convenient for a test
   * and wrong as an API: a customer three years into a relationship with the
   * depot is an unbounded response, and the surface most worth bounding is the
   * one that answers "what does this person owe".
   *
   * Raw entries are still reachable where a bound would be wrong — the balance
   * rebuild and a future export need every entry by definition — but through the
   * repository port inside the server, not through a procedure a browser can call
   * (BR-READ-002).
   */
  timeline: authenticatedProcedure
    .input(accountTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCustomerAccountTimeline(ctx, input))),

  reconciliation: authenticatedProcedure
    .input(accountReconciliationInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getAccountReconciliation(ctx, input))),

  reconciliationEvidence: authenticatedProcedure
    .input(accountReconciliationInputSchema)
    .query(async ({ ctx, input }) => unwrap(await exportAccountReconciliationEvidence(ctx, input))),

  rebuildProjection: commandProcedure
    .input(rebuildAccountProjectionCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await rebuildAccountProjection(ctx, input))),
});

const auditRouter = router({
  timeline: authenticatedProcedure
    .input(auditTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getAuditTimeline(ctx, input))),
});

const debtRouter = router({
  adjust: commandProcedure
    .input(adjustCustomerDebtCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustCustomerDebt(ctx, input))),
});

const productRouter = router({
  create: commandProcedure
    .input(createProductCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createProduct(ctx, input))),
  update: commandProcedure
    .input(updateProductCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateProduct(ctx, input))),
  deactivate: commandProcedure
    .input(deactivateProductCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateProduct(ctx, input))),
  reactivate: commandProcedure
    .input(reactivateProductCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateProduct(ctx, input))),
  search: authenticatedProcedure
    .input(productSearchInputSchema)
    .query(async ({ ctx, input }) => unwrap(await searchProducts(ctx, input))),
  get: authenticatedProcedure
    .input(productGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getProduct(ctx, input))),
});

const supplierRouter = router({
  create: commandProcedure
    .input(createSupplierCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createSupplier(ctx, input))),
  update: commandProcedure
    .input(updateSupplierCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateSupplier(ctx, input))),
  deactivate: commandProcedure
    .input(deactivateSupplierCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateSupplier(ctx, input))),
  reactivate: commandProcedure
    .input(reactivateSupplierCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateSupplier(ctx, input))),
  search: authenticatedProcedure
    .input(supplierSearchInputSchema)
    .query(async ({ ctx, input }) => unwrap(await searchSuppliers(ctx, input))),
  get: authenticatedProcedure
    .input(supplierGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplier(ctx, input))),
  getPayment: authenticatedProcedure
    .input(supplierPaymentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierPayment(ctx, input))),
  getAdjustment: authenticatedProcedure
    .input(supplierAdjustmentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierAdjustment(ctx, input))),
  recordPayment: commandProcedure
    .input(recordSupplierPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordSupplierPayment(ctx, input))),
  reversePayment: commandProcedure
    .input(reverseSupplierPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseSupplierPayment(ctx, input))),
  adjustAccount: commandProcedure
    .input(adjustSupplierAccountCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustSupplierAccount(ctx, input))),
  balance: authenticatedProcedure
    .input(supplierAccountInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierBalance(ctx, input))),
  timeline: authenticatedProcedure
    .input(supplierAccountTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierTimeline(ctx, input))),
  reconciliation: authenticatedProcedure
    .input(supplierAccountInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierReconciliation(ctx, input))),
  evidence: authenticatedProcedure
    .input(supplierAccountInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierReconciliation(ctx, input))),
  rebuildAccount: commandProcedure
    .input(rebuildSupplierAccountCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await rebuildSupplierAccount(ctx, input))),
});

const purchaseRouter = router({
  createDraft: commandProcedure
    .input(createPurchaseDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createPurchaseDraft(ctx, input))),
  updateDraft: commandProcedure
    .input(updatePurchaseDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updatePurchaseDraft(ctx, input))),
  discardDraft: commandProcedure
    .input(discardPurchaseDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await discardPurchaseDraft(ctx, input))),
  confirm: commandProcedure
    .input(confirmPurchaseCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await confirmPurchase(ctx, input))),
  void: commandProcedure
    .input(voidPurchaseCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await voidPurchase(ctx, input))),
  get: authenticatedProcedure
    .input(purchaseGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getPurchase(ctx, input))),
  list: authenticatedProcedure
    .input(purchaseListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listPurchases(ctx, input))),
});

const receivingRouter = router({
  record: commandProcedure
    .input(recordPurchaseReceiptCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordPurchaseReceipt(ctx, input))),
  reverse: commandProcedure
    .input(reversePurchaseReceiptCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reversePurchaseReceipt(ctx, input))),
  get: authenticatedProcedure
    .input(receiptGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getReceipt(ctx, input))),
  listForPurchase: authenticatedProcedure
    .input(purchaseReceiptsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listPurchaseReceipts(ctx, input))),
  summaryForPurchase: authenticatedProcedure
    .input(purchaseReceiptsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getPurchaseReceivingSummary(ctx, input))),
});
const inventoryRouter = router({
  adjust: commandProcedure
    .input(adjustInventoryCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustInventory(ctx, input))),
  balances: authenticatedProcedure
    .input(inventoryBalanceInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryBalances(ctx, input))),
  getAdjustment: authenticatedProcedure
    .input(inventoryAdjustmentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryAdjustment(ctx, input))),
  timeline: authenticatedProcedure
    .input(inventoryTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryTimeline(ctx, input))),
  reconciliation: authenticatedProcedure
    .input(inventoryReconciliationInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryReconciliation(ctx, input))),
  evidence: authenticatedProcedure
    .input(inventoryReconciliationInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryReconciliation(ctx, input))),
  rebuild: commandProcedure
    .input(rebuildInventoryCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await rebuildInventory(ctx, input))),
});

const operationsRouter = router({
  integrity: authenticatedProcedure
    .input(workspaceIntegrityInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getWorkspaceIntegrity(ctx, input.workspaceId))),
  exportBackup: commandProcedure
    .input(exportWorkspaceBackupCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await exportWorkspaceBackup(ctx, input))),
  validateBackup: authenticatedProcedure
    .input(validateWorkspaceBackupInputSchema)
    .query(async ({ ctx, input }) =>
      unwrap(await validateWorkspaceBackup(ctx, input.workspaceId, input.backup)),
    ),
  restoreBackup: commandProcedure
    .input(restoreWorkspaceBackupCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await restoreWorkspaceBackup(ctx, input))),
});

const deliveryRouter = router({
  createDraft: commandProcedure
    .input(createDeliveryDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createDeliveryDraft(ctx, input))),
  updateDraft: commandProcedure
    .input(updateDeliveryDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateDeliveryDraft(ctx, input))),
  cancelDraft: commandProcedure
    .input(cancelDeliveryDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await cancelDeliveryDraft(ctx, input))),
  dispatch: commandProcedure
    .input(dispatchDeliveryCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await dispatchDelivery(ctx, input))),
  markDelivered: commandProcedure
    .input(markDeliveryDeliveredCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await markDeliveryDelivered(ctx, input))),
  recordReturn: commandProcedure
    .input(recordDeliveryReturnCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordDeliveryReturn(ctx, input))),
  get: authenticatedProcedure
    .input(deliveryGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getDelivery(ctx, input))),
  list: authenticatedProcedure
    .input(deliveryListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listDeliveries(ctx, input))),
  fulfilment: authenticatedProcedure
    .input(saleFulfilmentInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSaleFulfilment(ctx, input))),
});

const documentRouter = router({
  generate: commandProcedure
    .input(generateDocumentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await generateDocument(ctx, input))),
  share: commandProcedure
    .input(createDocumentShareCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createDocumentShare(ctx, input))),
  revokeShare: commandProcedure
    .input(revokeDocumentShareCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await revokeDocumentShare(ctx, input))),
  get: authenticatedProcedure
    .input(documentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getDocument(ctx, input))),
  listForSource: authenticatedProcedure
    .input(documentSourceInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listDocumentsForSource(ctx, input))),
});

const reportRouter = router({
  operational: authenticatedProcedure
    .input(reportInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationalReport(ctx, input))),
  csv: authenticatedProcedure
    .input(reportInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationalReportCsv(ctx, input))),
});

export const appRouter = router({
  session: sessionRouter,
  customer: customerRouter,
  sale: saleRouter,
  payment: paymentRouter,
  account: accountRouter,
  audit: auditRouter,
  debt: debtRouter,
  product: productRouter,
  supplier: supplierRouter,
  purchase: purchaseRouter,
  receiving: receivingRouter,
  inventory: inventoryRouter,
  delivery: deliveryRouter,
  document: documentRouter,
  report: reportRouter,
  operations: operationsRouter,
});

export type AppRouter = typeof appRouter;
