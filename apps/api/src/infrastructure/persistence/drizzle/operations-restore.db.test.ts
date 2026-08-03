import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type {
  ProductId,
  QualityGradeId,
  CostObservationId,
  ReconciliationObservationId,
  PurchaseId,
  PurchaseLineId,
  PurchaseReceiptId,
  PriceRuleId,
  SaleId,
  SaleLineId,
  SupplierId,
  SupplierPaymentId,
  WorkspaceBackupV18,
  WorkspacePolicyVersionId,
  DeliveryId,
  DeliveryLineId,
  DocumentId,
  DocumentShareId,
  StocktakeSessionId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { createProduct } from "../../../modules/product/product.handlers.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { getSale } from "../../../modules/sale/sale.queries.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import {
  backupDigest,
  exportWorkspaceBackup,
  getWorkspaceIntegrity,
} from "../../../modules/operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../../../modules/operations/restore-workspace.handler.ts";
import {
  getAccountReconciliation,
  getCustomerDebtAging,
} from "../../../modules/account/account.queries.ts";
import {
  createSupplier,
  recordSupplierPayment,
} from "../../../modules/supplier/supplier.handlers.ts";
import { getSupplierReconciliation } from "../../../modules/supplier/supplier.queries.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
} from "../../../modules/purchase/purchase.handlers.ts";
import { recordPurchaseReceipt } from "../../../modules/inventory/inventory.handlers.ts";
import { recordPriceRule } from "../../../modules/pricing/pricing.handlers.ts";
import { getInventoryReconciliation } from "../../../modules/inventory/inventory.queries.ts";
import {
  approveStocktake,
  recordStocktakeCount,
  startStocktake,
} from "../../../modules/inventory/stocktake.handlers.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
} from "../../../modules/delivery/delivery.handlers.ts";
import {
  createDocumentShare,
  generateDocument,
} from "../../../modules/document/document.handlers.ts";
import {
  recordCostObservation,
  recordReconciliationObservation,
} from "../../../modules/evidence/evidence.handlers.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import { getWorkspacePolicy } from "../../../modules/policy/policy.queries.ts";

describe.skipIf(skipWithoutDatabase())("M14 PostgreSQL logical recovery", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: new Date().toISOString(),
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`operations-restore-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
  });

  afterEach(async () => {
    await ctx.close();
  });

  async function prepareCanonicalBackup(): Promise<WorkspaceBackupV18> {
    const productId = crypto.randomUUID() as ProductId;
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;
    const termsPolicyVersionId = crypto.randomUUID() as WorkspacePolicyVersionId;
    const allocationPolicyVersionId = crypto.randomUUID() as WorkspacePolicyVersionId;
    const creditPolicyVersionId = crypto.randomUUID() as WorkspacePolicyVersionId;
    const policyEffectiveFrom = "2020-01-01T00:00:00.000Z";
    const termsDraft = await createWorkspacePolicyDraft(context(), {
      ...command("recovery-terms-policy-draft"),
      payload: {
        policyVersionId: termsPolicyVersionId,
        policyKind: "payment_terms_aging",
        version: 1,
        effectiveFrom: policyEffectiveFrom,
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: {
            defaultTermDays: 7,
            defaultTermLabel: "7 ngày",
            customerTerms: [],
            graceDays: 0,
            agingBuckets: [
              { code: "1-30", label: "1–30 ngày", minDaysOverdue: 1, maxDaysOverdue: 30 },
            ],
            creditControl: "information_only",
          },
        },
        evidenceReferences: [],
        reason: "Policy điều khoản phục hồi có lineage.",
      },
    });
    expect(termsDraft.ok).toBe(true);
    if (termsDraft.ok) {
      const termsApproval = await approveWorkspacePolicy(context(), {
        ...command("recovery-terms-policy-approve"),
        payload: {
          policyVersionId: termsPolicyVersionId,
          evidenceReferences: ["field://recovery/debt-terms-001"],
          reason: "Duyệt policy điều khoản phục hồi.",
        },
      });
      expect(termsApproval.ok).toBe(true);
    }
    const allocationDraft = await createWorkspacePolicyDraft(context(), {
      ...command("recovery-allocation-policy-draft"),
      payload: {
        policyVersionId: allocationPolicyVersionId,
        policyKind: "payment_allocation",
        version: 1,
        effectiveFrom: policyEffectiveFrom,
        effectiveTo: null,
        definition: { contractVersion: 1, parameters: { strategy: "oldest_due_first" } },
        evidenceReferences: [],
        reason: "Policy phân bổ phục hồi có lineage.",
      },
    });
    expect(allocationDraft.ok).toBe(true);
    if (allocationDraft.ok) {
      const allocationApproval = await approveWorkspacePolicy(context(), {
        ...command("recovery-allocation-policy-approve"),
        payload: {
          policyVersionId: allocationPolicyVersionId,
          evidenceReferences: ["field://recovery/debt-allocation-001"],
          reason: "Duyệt policy phân bổ phục hồi.",
        },
      });
      expect(allocationApproval.ok).toBe(true);
    }
    const creditDraft = await createWorkspacePolicyDraft(context(), {
      ...command("recovery-credit-policy-draft"),
      payload: {
        policyVersionId: creditPolicyVersionId,
        policyKind: "credit_limit",
        version: 1,
        effectiveFrom: policyEffectiveFrom,
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: {
            mode: "information_only",
            limit: { amountMinor: 1_000_000, currency: "VND" },
          },
        },
        evidenceReferences: [],
        reason: "Policy credit phục hồi có lineage.",
      },
    });
    expect(creditDraft.ok).toBe(true);
    if (creditDraft.ok) {
      const creditApproval = await approveWorkspacePolicy(context(), {
        ...command("recovery-credit-policy-approve"),
        payload: {
          policyVersionId: creditPolicyVersionId,
          evidenceReferences: ["field://recovery/credit-limit-001"],
          reason: "Duyệt policy credit phục hồi.",
        },
      });
      expect(creditApproval.ok).toBe(true);
    }
    const product = await createProduct(context(), {
      ...command("recovery-product"),
      payload: {
        productId,
        displayName: "Cải ngọt phục hồi",
        aliases: ["cai ngot"],
        preferredUnit: "kg",
      },
    });
    expect(product.ok).toBe(true);
    const priceRule = await recordPriceRule(context(), {
      ...command("recovery-price-rule"),
      payload: {
        priceRuleId: crypto.randomUUID() as PriceRuleId,
        productId,
        qualityGradeId: ctx.qualityGradeId,
        customerId: ctx.customerId,
        unit: "kg",
        kind: "customer",
        priority: 10,
        minimumQuantityScaled: 1_000,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        baseUnitPrice: { amountMinor: 20_000, currency: "VND" },
        discountPerUnit: { amountMinor: 500, currency: "VND" },
        feePerUnit: { amountMinor: 0, currency: "VND" },
        reason: "Giá phục hồi có truy nguyên",
      },
    });
    expect(priceRule.ok).toBe(true);
    const draft = await createSaleDraft(context(), {
      ...command("recovery-sale-draft"),
      payload: {
        saleId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: saleLineId,
            productId,
            productName: "Cải ngọt phục hồi",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 2_000, unit: "kg" },
            unitPrice: { amountMinor: 20_000, currency: "VND" },
          },
        ],
        note: "Sale canonical trước phục hồi",
        dueAt: null,
        replacesSaleId: null,
      },
    });
    expect(draft.ok).toBe(true);
    const posted = await postSale(context(), {
      ...command("recovery-sale-post"),
      expectedVersion: 1,
      payload: { saleId },
    });
    expect(posted.ok).toBe(true);
    if (posted.ok) {
      expect(posted.value).toMatchObject({
        paymentTermsPolicyVersionId: termsPolicyVersionId,
        paymentTermsSource: "workspace_policy",
        creditLimitPolicyVersionId: creditPolicyVersionId,
      });
    }
    const payment = await recordCustomerPayment(context(), {
      ...command("recovery-payment"),
      payload: {
        paymentId: crypto.randomUUID(),
        customerId: ctx.customerId,
        amount: { amountMinor: 10_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: "Thanh toán trước phục hồi",
      },
    });
    expect(payment.ok).toBe(true);

    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    expect(
      (
        await createSupplier(context(), {
          ...command("recovery-supplier"),
          payload: {
            supplierId,
            displayName: "Nhà vườn phục hồi",
            phone: "0909000999",
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    const reconciliationObservationId = crypto.randomUUID() as ReconciliationObservationId;
    expect(
      (
        await recordReconciliationObservation(context(), {
          ...command("recovery-reconciliation-observation"),
          payload: {
            reconciliationObservationId,
            kind: "inventory_count",
            caseKind: "normal",
            description: "Đếm thực tế tại khu sơ chế cuối ca.",
            participantWording: "Người kiểm đếm ghi nhận số lượng trên phiếu hiện trường.",
            facts: {
              expectedAmount: null,
              observedAmount: null,
              expectedQuantity: { valueScaled: 10_000, unit: "kg" },
              observedQuantity: { valueScaled: 9_500, unit: "kg" },
              itemCount: 3,
              productId,
              qualityGradeId: null,
              scopeReference: "stocktake://recovery/001",
            },
            evidenceReferences: ["photo://recovery/stocktake-001"],
            relatedObservationId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createPurchaseDraft(context(), {
          ...command("recovery-purchase"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId,
                productName: "Cải ngọt snapshot",
                quantity: { valueScaled: 10_000, unit: "kg" },
                unitPrice: { amountMinor: 5_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesPurchaseId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await confirmPurchase(context(), {
          ...command("recovery-purchase-confirm"),
          expectedVersion: 1,
          payload: { purchaseId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordSupplierPayment(context(), {
          ...command("recovery-supplier-payment"),
          payload: {
            supplierPaymentId: crypto.randomUUID() as SupplierPaymentId,
            supplierId,
            amount: { amountMinor: 20_000, currency: "VND" },
            method: "cash",
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordPurchaseReceipt(context(), {
          ...command("recovery-receipt"),
          payload: {
            receiptId: crypto.randomUUID() as PurchaseReceiptId,
            purchaseId,
            lines: [
              {
                receiptLineId: crypto.randomUUID(),
                purchaseLineId,
                productId,
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 10_000, unit: "kg" },
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    // Prove the projection is derived during recovery, never exported as truth.
    await ctx.overwriteAccountProjection({
      balanceMinor: 999_999,
      entryCount: 999,
      lastEntryTransactionTime: new Date(),
    });
    const deliveryId = crypto.randomUUID() as DeliveryId;
    const deliveryLineId = crypto.randomUUID() as DeliveryLineId;
    expect(
      (
        await createDeliveryDraft(context(), {
          ...command("recovery-delivery"),
          payload: {
            deliveryId,
            saleId,
            lines: [
              {
                deliveryLineId,
                saleLineId,
                productId,
                qualityGradeId: ctx.qualityGradeId,
                quantity: { valueScaled: 1_000, unit: "kg" },
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await dispatchDelivery(context(), {
          ...command("recovery-dispatch"),
          expectedVersion: 1,
          payload: { deliveryId },
        })
      ).ok,
    ).toBe(true);
    const documentId = crypto.randomUUID() as DocumentId;
    expect(
      (
        await generateDocument(context(), {
          ...command("recovery-document"),
          payload: {
            documentId,
            documentType: "delivery_note",
            sourceType: "delivery",
            sourceId: deliveryId,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createDocumentShare(context(), {
          ...command("recovery-share"),
          payload: {
            shareId: crypto.randomUUID() as DocumentShareId,
            documentId,
            expiresAt: null,
          },
        })
      ).ok,
    ).toBe(true);
    const costObservationId = crypto.randomUUID() as CostObservationId;
    expect(
      (
        await recordCostObservation(context(), {
          ...command("recovery-cost-observation"),
          payload: {
            costObservationId,
            kind: "spoilage",
            caseKind: "normal",
            description: "Một sọt bị dập trong lúc vận chuyển.",
            participantWording: "Người nhận hàng ghi nhận sọt bị dập.",
            facts: {
              amount: { amountMinor: 125_000, currency: "VND" },
              quantity: { valueScaled: 2_500, unit: "kg" },
              productId: null,
              qualityGradeId: null,
              sourceReference: "note://recovery/cost-001",
            },
            evidenceReferences: ["photo://recovery/cost-001"],
            relatedObservationId: null,
          },
        })
      ).ok,
    ).toBe(true);
    const policyDraft = await createWorkspacePolicyDraft(context(), {
      ...command("recovery-policy-draft"),
      payload: {
        policyVersionId: crypto.randomUUID(),
        policyKind: "inventory_valuation",
        version: 1,
        effectiveFrom: "2026-08-01T00:00:00.000Z",
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: { strategy: "moving_weighted_average" },
        },
        evidenceReferences: [],
        reason: "Policy bản nháp phục hồi.",
      },
    });
    expect(policyDraft.ok).toBe(true);
    if (policyDraft.ok) {
      const policyApproval = await approveWorkspacePolicy(context(), {
        ...command("recovery-policy-approve"),
        payload: {
          policyVersionId: policyDraft.value.id,
          evidenceReferences: ["field://recovery/policy-001"],
          reason: "Policy có evidence phục hồi.",
        },
      });
      expect(policyApproval.ok).toBe(true);
    }
    const stocktakePolicyVersionId = crypto.randomUUID() as WorkspacePolicyVersionId;
    const stocktakePolicy = await createWorkspacePolicyDraft(context(), {
      ...command("recovery-stocktake-policy-draft"),
      payload: {
        policyVersionId: stocktakePolicyVersionId,
        policyKind: "stocktake_variance",
        version: 1,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: { strategy: "absolute_count", allowReopen: true },
        },
        evidenceReferences: [],
        reason: "Policy kiểm kê cho diễn tập phục hồi.",
      },
    });
    expect(stocktakePolicy.ok).toBe(true);
    const stocktakePolicyApproval = await approveWorkspacePolicy(context(), {
      ...command("recovery-stocktake-policy-approve"),
      payload: {
        policyVersionId: stocktakePolicyVersionId,
        evidenceReferences: ["field://recovery/stocktake-001"],
        reason: "Duyệt policy kiểm kê cho diễn tập phục hồi.",
      },
    });
    expect(stocktakePolicyApproval.ok).toBe(true);
    const stocktakeSessionId = crypto.randomUUID() as StocktakeSessionId;
    const stocktakeStarted = await startStocktake(context(), {
      ...command("recovery-stocktake-start"),
      payload: {
        stocktakeSessionId,
        asOf: "2026-08-03T00:00:00.000Z",
        scopeReference: `product:${productId}`,
        note: "Phiên kiểm kê dùng để diễn tập backup/restore.",
        evidenceReferences: ["photo://recovery/stocktake-001"],
      },
    });
    expect(stocktakeStarted.ok).toBe(true);
    const stocktakeCount = await recordStocktakeCount(context(), {
      ...command("recovery-stocktake-count"),
      payload: {
        stocktakeCountId: crypto.randomUUID(),
        stocktakeSessionId,
        productId,
        qualityGradeId: ctx.qualityGradeId,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 1_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: ["photo://recovery/stocktake-001"],
      },
    });
    expect(stocktakeCount.ok).toBe(true);
    const stocktakeApproved = await approveStocktake(context(), {
      ...command("recovery-stocktake-approve"),
      payload: {
        stocktakeSessionId,
        expectedVersion: 2,
        evidenceReferences: ["review://recovery/stocktake-001"],
        reason: "Chốt phiên kiểm kê cho diễn tập phục hồi.",
      },
    });
    expect(stocktakeApproved.ok).toBe(true);
    const exported = await exportWorkspaceBackup(context(), {
      ...command("recovery-export"),
      payload: {},
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error("backup export unexpectedly failed");
    return exported.value;
  }

  async function emptyRecoveryWorkspace(): Promise<void> {
    /*
     * This is disaster-recovery test arrangement, not a product mutation. The
     * production append-only triggers correctly forbid deleting ledger history;
     * a fresh recovery database simply would not contain these rows. Disabling
     * triggers on this one transaction creates that empty-database condition
     * without weakening the runtime restore path.
     */
    await ctx.database.sql.begin(async (sql) => {
      await sql`set local session_replication_role = replica`;
      await sql`delete from customer_account_balances
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from customer_account_entries
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from payment_reversals where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from payments where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from document_shares where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from documents where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from inventory_balances where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from stocktake_counts where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from stocktake_sessions where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from inventory_movements where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from quality_disposition_reversals
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from quality_disposition_allocations
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from quality_dispositions
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from quality_inspection_reversals
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from quality_inspection_issues
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from quality_inspections
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from goods_arrival_reversals
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from goods_arrival_lines
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from goods_arrivals
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from quality_issue_codes
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from delivery_return_lines
        where return_id in (
          select id from delivery_returns where workspace_id = ${ctx.workspaceId}::uuid
        )`;
      await sql`delete from delivery_returns where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from delivery_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from deliveries where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sale_voids where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sale_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from sales where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from products where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from quality_grades where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from customers where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from audit_logs where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from reconciliation_observations
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from workspace_policies
        where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from cost_observations where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from command_receipts where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_receipt_reversals where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_receipt_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_receipts where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from price_rules where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_account_balances where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_account_entries where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_payment_reversals where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from supplier_payments where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_voids where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchase_lines where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from purchases where workspace_id = ${ctx.workspaceId}::uuid`;
      await sql`delete from suppliers where workspace_id = ${ctx.workspaceId}::uuid`;
    });
  }

  async function canonicalCounts() {
    const rows = await ctx.database.sql`
      select
        (select count(*)::int from customers where workspace_id = ${ctx.workspaceId}::uuid)
          as customers,
        (select count(*)::int from products where workspace_id = ${ctx.workspaceId}::uuid)
          as products,
        (select count(*)::int from quality_grades where workspace_id = ${ctx.workspaceId}::uuid)
          as quality_grades,
        (select count(*)::int from quality_issue_codes where workspace_id = ${ctx.workspaceId}::uuid)
          as quality_issue_codes,
        (select count(*)::int from goods_arrivals where workspace_id = ${ctx.workspaceId}::uuid)
          as goods_arrivals,
        (select count(*)::int from goods_arrival_lines where workspace_id = ${ctx.workspaceId}::uuid)
          as goods_arrival_lines,
        (select count(*)::int from quality_inspections where workspace_id = ${ctx.workspaceId}::uuid)
          as quality_inspections,
        (select count(*)::int from quality_dispositions where workspace_id = ${ctx.workspaceId}::uuid)
          as quality_dispositions,
        (select count(*)::int from quality_disposition_allocations
          where workspace_id = ${ctx.workspaceId}::uuid) as quality_disposition_allocations,
        (select count(*)::int from sales where workspace_id = ${ctx.workspaceId}::uuid)
          as sales,
        (select count(*)::int from sale_lines where workspace_id = ${ctx.workspaceId}::uuid)
          as sale_lines,
        (select count(*)::int from payments where workspace_id = ${ctx.workspaceId}::uuid)
          as payments,
        (select count(*)::int from customer_account_entries
          where workspace_id = ${ctx.workspaceId}::uuid) as account_entries,
        (select count(*)::int from audit_logs where workspace_id = ${ctx.workspaceId}::uuid)
          as audit,
        (select count(*)::int from command_receipts
          where workspace_id = ${ctx.workspaceId}::uuid) as command_receipts,
        (select count(*)::int from suppliers where workspace_id = ${ctx.workspaceId}::uuid)
          as suppliers,
        (select count(*)::int from purchases where workspace_id = ${ctx.workspaceId}::uuid)
          as purchases,
        (select count(*)::int from supplier_account_entries
          where workspace_id = ${ctx.workspaceId}::uuid) as supplier_account_entries,
        (select count(*)::int from purchase_receipts
          where workspace_id = ${ctx.workspaceId}::uuid) as receipts,
        (select count(*)::int from inventory_movements
          where workspace_id = ${ctx.workspaceId}::uuid) as inventory_movements,
        (select count(*)::int from stocktake_sessions
          where workspace_id = ${ctx.workspaceId}::uuid) as stocktake_sessions,
        (select count(*)::int from stocktake_counts
          where workspace_id = ${ctx.workspaceId}::uuid) as stocktake_counts,
        (select count(*)::int from deliveries
          where workspace_id = ${ctx.workspaceId}::uuid) as deliveries,
        (select count(*)::int from documents
          where workspace_id = ${ctx.workspaceId}::uuid) as documents,
        (select count(*)::int from document_shares
          where workspace_id = ${ctx.workspaceId}::uuid) as document_shares,
        (select count(*)::int from price_rules
          where workspace_id = ${ctx.workspaceId}::uuid) as price_rules,
        (select count(*)::int from cost_observations
          where workspace_id = ${ctx.workspaceId}::uuid) as cost_observations,
        (select count(*)::int from reconciliation_observations
          where workspace_id = ${ctx.workspaceId}::uuid) as reconciliation_observations,
        (select count(*)::int from workspace_policies
          where workspace_id = ${ctx.workspaceId}::uuid) as workspace_policies
    `;
    return rows[0] as Record<string, number>;
  }

  it("TC-CREDIT-004 / TC-POLICY-005 restores canonical history, credit lineage, rebuilds projections, and replays without duplicates", async () => {
    const backup = await prepareCanonicalBackup();
    expect(backup.payload.customers.length).toBeGreaterThan(0);
    expect(backup.payload.products.length).toBeGreaterThan(0);
    expect(backup.payload.sales.length).toBeGreaterThan(0);
    expect(backup.payload.payments.length).toBeGreaterThan(0);
    expect(backup.payload.accountEntries).toHaveLength(2);
    expect(backup.payload.audit.length).toBeGreaterThan(0);
    expect(backup.payload.commandReceipts.length).toBeGreaterThan(0);
    expect(backup.payload.priceRules).toHaveLength(1);
    expect(backup.payload.suppliers).toHaveLength(1);
    expect(backup.payload.purchases).toHaveLength(1);
    expect(backup.payload.supplierAccountEntries).toHaveLength(2);
    expect(backup.payload.receipts).toHaveLength(1);
    expect(backup.payload.inventoryMovements).toHaveLength(3);
    expect(backup.payload.deliveries).toHaveLength(1);
    expect(backup.payload.documents).toHaveLength(1);
    expect(backup.payload.documentShares).toHaveLength(1);
    expect(backup.payload.costObservations).toHaveLength(1);
    expect(backup.payload.reconciliationObservations).toHaveLength(1);
    expect(backup.payload.workspacePolicies).toHaveLength(5);
    expect(backup.payload.stocktakeSessions).toHaveLength(1);
    expect(backup.payload.stocktakeCounts).toHaveLength(1);
    const restoredTermsPolicyVersionId = backup.payload.workspacePolicies.find(
      (row) => row["policyKind"] === "payment_terms_aging",
    )?.["id"];
    expect(restoredTermsPolicyVersionId).toBeTypeOf("string");
    const restoredCreditPolicyVersionId = backup.payload.workspacePolicies.find(
      (row) => row["policyKind"] === "credit_limit",
    )?.["id"];
    expect(restoredCreditPolicyVersionId).toBeTypeOf("string");
    expect(backup.payload.sales).toContainEqual(
      expect.objectContaining({
        id: backup.payload.sales[0]?.["id"],
        paymentTermsPolicyVersionId: restoredTermsPolicyVersionId,
        paymentTermsSource: "workspace_policy",
        creditLimitPolicyVersionId: backup.payload.workspacePolicies.find(
          (row) => row["policyKind"] === "credit_limit",
        )?.["id"],
      }),
    );

    await emptyRecoveryWorkspace();
    expect(await canonicalCounts()).toMatchObject({
      customers: 0,
      products: 0,
      quality_grades: 0,
      quality_issue_codes: 0,
      goods_arrivals: 0,
      goods_arrival_lines: 0,
      quality_inspections: 0,
      quality_dispositions: 0,
      quality_disposition_allocations: 0,
      sales: 0,
      sale_lines: 0,
      payments: 0,
      account_entries: 0,
      audit: 0,
      command_receipts: 0,
      suppliers: 0,
      purchases: 0,
      supplier_account_entries: 0,
      receipts: 0,
      inventory_movements: 0,
      stocktake_sessions: 0,
      stocktake_counts: 0,
      deliveries: 0,
      documents: 0,
      document_shares: 0,
      price_rules: 0,
      cost_observations: 0,
      reconciliation_observations: 0,
      workspace_policies: 0,
    });

    const restoreCommand = {
      ...command("recovery-restore"),
      payload: { backup, reason: "Diễn tập phục hồi PostgreSQL" },
    };
    const restored = await restoreWorkspaceBackup(context(), restoreCommand);
    expect(restored.ok, JSON.stringify(restored)).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.integrity.status).toBe("healthy");
    expect(await canonicalCounts()).toMatchObject({
      customers: backup.payload.customers.length,
      products: backup.payload.products.length,
      quality_issue_codes: backup.payload.qualityIssueCodes.length,
      goods_arrivals: backup.payload.goodsArrivals.length,
      goods_arrival_lines: backup.payload.goodsArrivalLines.length,
      quality_inspections: backup.payload.qualityInspections.length,
      quality_dispositions: backup.payload.qualityDispositions.length,
      quality_disposition_allocations: backup.payload.qualityDispositionAllocations.length,
      sales: backup.payload.sales.length,
      sale_lines: backup.payload.saleLines.length,
      payments: backup.payload.payments.length,
      account_entries: backup.payload.accountEntries.length,
      audit: backup.payload.audit.length + 1,
      command_receipts: backup.payload.commandReceipts.length + 1,
      suppliers: backup.payload.suppliers.length,
      purchases: backup.payload.purchases.length,
      supplier_account_entries: backup.payload.supplierAccountEntries.length,
      receipts: backup.payload.receipts.length,
      inventory_movements: backup.payload.inventoryMovements.length,
      stocktake_sessions: backup.payload.stocktakeSessions.length,
      stocktake_counts: backup.payload.stocktakeCounts.length,
      deliveries: backup.payload.deliveries.length,
      documents: backup.payload.documents.length,
      document_shares: backup.payload.documentShares.length,
      price_rules: backup.payload.priceRules.length,
      cost_observations: backup.payload.costObservations.length,
      workspace_policies: backup.payload.workspacePolicies.length,
    });

    const restoredPolicy = await getWorkspacePolicy(context(), {
      workspaceId: ctx.workspaceId,
      policyVersionId: backup.payload.workspacePolicies[0]?.["id"] as WorkspacePolicyVersionId,
    });
    expect(restoredPolicy.ok).toBe(true);
    if (restoredPolicy.ok) expect(restoredPolicy.value.state).toBe("approved");

    const restoredAging = await getCustomerDebtAging(context(), {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      asOf: new Date().toISOString(),
    });
    expect(restoredAging.ok).toBe(true);
    if (restoredAging.ok && restoredAging.value.status === "available") {
      expect(restoredAging.value.rows[0]).toMatchObject({
        saleId: backup.payload.sales[0]?.["id"],
        termPolicyVersionId: restoredTermsPolicyVersionId,
        termSource: "workspace_policy",
      });
    }
    const restoredSale = await getSale(context(), {
      workspaceId: ctx.workspaceId,
      saleId: backup.payload.sales[0]?.["id"] as SaleId,
    });
    expect(restoredSale.ok).toBe(true);
    if (restoredSale.ok) {
      expect(restoredSale.value.creditLimitPolicyVersionId).toBe(restoredCreditPolicyVersionId);
    }

    const reconciliation = await getAccountReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
    });
    expect(reconciliation.ok).toBe(true);
    if (reconciliation.ok) {
      expect(reconciliation.value.kind).toBe("consistent");
      if (reconciliation.value.kind === "consistent") {
        expect(reconciliation.value.ledger.balance.amountMinor).toBe(30_000);
        expect(reconciliation.value.projection?.balance.amountMinor).toBe(30_000);
      }
    }
    const integrity = await getWorkspaceIntegrity(context(), ctx.workspaceId);
    expect(integrity.ok && integrity.value.status).toBe("healthy");
    const restoredSupplierId = backup.payload.suppliers[0]?.["id"] as SupplierId;
    const supplierReconciliation = await getSupplierReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      supplierId: restoredSupplierId,
    });
    expect(supplierReconciliation.ok && supplierReconciliation.value.status).toBe("consistent");
    const inventoryReconciliation = await getInventoryReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      productId: backup.payload.products[0]?.["id"] as ProductId,
      qualityGradeId: backup.payload.qualityGrades[0]?.["id"] as QualityGradeId,
      unit: "kg",
    });
    expect(inventoryReconciliation.ok && inventoryReconciliation.value.status).toBe("consistent");

    const beforeReplay = await canonicalCounts();
    const replay = await restoreWorkspaceBackup(context(), restoreCommand);
    expect(replay).toEqual(restored);
    expect(await canonicalCounts()).toEqual(beforeReplay);
  });

  it("rolls back every inserted row when canonical storage fails part-way", async () => {
    const backup = await prepareCanonicalBackup();
    await emptyRecoveryWorkspace();
    const duplicateCustomer = backup.payload.customers[0]!;
    const malformed: WorkspaceBackupV18 = {
      ...backup,
      payload: {
        ...backup.payload,
        customers: [...backup.payload.customers, duplicateCustomer],
      },
      digest: "",
    };
    const withDigest = { ...malformed, digest: backupDigest(malformed.payload) };

    await expect(
      restoreWorkspaceBackup(context(), {
        ...command("recovery-storage-failure"),
        payload: { backup: withDigest, reason: "Phải rollback toàn bộ" },
      }),
    ).rejects.toThrow();
    expect(await canonicalCounts()).toMatchObject({
      customers: 0,
      products: 0,
      sales: 0,
      sale_lines: 0,
      payments: 0,
      account_entries: 0,
      audit: 0,
      command_receipts: 0,
      suppliers: 0,
      purchases: 0,
      supplier_account_entries: 0,
      receipts: 0,
      inventory_movements: 0,
    });
  });

  it("rejects a mismatched document snapshot before restoring any canonical row", async () => {
    const backup = await prepareCanonicalBackup();
    await emptyRecoveryWorkspace();
    const document = backup.payload.documents[0]!;
    const payload = {
      ...backup.payload,
      documents: [
        {
          ...document,
          snapshot: { tampered: true },
        },
      ],
    };
    const tampered: WorkspaceBackupV18 = {
      ...backup,
      payload,
      digest: backupDigest(payload),
    };

    const restored = await restoreWorkspaceBackup(context(), {
      ...command("recovery-document-digest"),
      payload: { backup: tampered, reason: "Snapshot sai digest phải bị từ chối" },
    });
    expect(restored.ok).toBe(false);
    if (!restored.ok) expect(restored.error.code).toBe("BACKUP_INTEGRITY_ERROR");
    expect(await canonicalCounts()).toMatchObject({
      customers: 0,
      products: 0,
      sales: 0,
      sale_lines: 0,
      payments: 0,
      account_entries: 0,
      audit: 0,
      command_receipts: 0,
      suppliers: 0,
      purchases: 0,
      supplier_account_entries: 0,
      receipts: 0,
      inventory_movements: 0,
      deliveries: 0,
      documents: 0,
      document_shares: 0,
    });
  });
});
