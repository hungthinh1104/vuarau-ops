import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  createDatabase,
  runMigrations,
  skipWithoutDatabase,
  actors,
  workspaces,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceOperationalProfiles,
  type DbTestContext,
} from "@vuarau/db";
import type {
  ActorId,
  DeliveryId,
  DeliveryLineId,
  DeliveryReturnId,
  GoodsArrivalId,
  GoodsArrivalLineId,
  PaymentId,
  PaymentReversalId,
  ProductId,
  PurchaseId,
  PurchaseLineId,
  PurchaseReceiptId,
  PurchaseReceiptLineId,
  QualityDispositionAllocationId,
  QualityDispositionId,
  QualityInspectionId,
  ReconciliationObservationId,
  SaleId,
  SaleLineId,
  SupplierId,
  SupplierPaymentId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
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
import {
  recordGoodsArrival,
  recordQualityDisposition,
  recordQualityInspection,
} from "../../../modules/intake/intake.handlers.ts";
import {
  getInventoryReconciliation,
  getProductCoverage,
  getPurchaseReceivingSummary,
} from "../../../modules/inventory/inventory.queries.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  markDeliveryDelivered,
  recordDeliveryReturn,
} from "../../../modules/delivery/delivery.handlers.ts";
import { getSaleFulfilment } from "../../../modules/delivery/delivery.queries.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../../../modules/payment/reverse-payment.handler.ts";
import {
  recordPaymentAllocation,
  reversePaymentAllocation,
} from "../../../modules/account/payment-allocation.handlers.ts";
import { recordReconciliationObservation } from "../../../modules/evidence/evidence.handlers.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import {
  getAccountReconciliation,
  getCustomerAccountBalance,
} from "../../../modules/account/account.queries.ts";
import { getOperationalReport } from "../../../modules/report/report.queries.ts";
import { getOperationsBoard } from "../../../modules/dashboard/dashboard.queries.ts";
import { recordOperationalClose } from "../../../modules/close/close.handlers.ts";
import { getOperationalCloseReadiness } from "../../../modules/close/close.queries.ts";
import {
  exportWorkspaceBackup,
  getWorkspaceIntegrity,
} from "../../../modules/operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../../../modules/operations/restore-workspace.handler.ts";

describe.skipIf(skipWithoutDatabase())("canonical synthetic depot day against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let sequence = 0;

  const context = (_workspaceId = ctx.workspaceId, actorId = ctx.actorId): CommandContext => ({
    deps,
    principal: { actorId, subject: ctx.subjectOf(actorId) },
  });

  const command = (label: string, workspaceId = ctx.workspaceId, actorId = ctx.actorId) => {
    sequence += 1;
    return {
      commandId: crypto.randomUUID(),
      idempotencyKey: `synthetic-day-${sequence}-${label}`,
      workspaceId,
      actorId,
      occurredAt: "2026-07-29T12:00:00.000Z",
    };
  };

  beforeEach(async () => {
    ctx = await createDbTestContext(`synthetic-day-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-29T12:00:00.000Z" as never },
    };
    sequence = 0;
  });

  afterEach(async () => ctx.close());

  it("TC-OPS-021 — keeps one workspace reconciled across the canonical money and goods loop", async () => {
    const productId = ctx.productIds[0] as ProductId;
    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    const receiptLine = () => crypto.randomUUID() as PurchaseReceiptLineId;
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;

    expect(
      (
        await createSupplier(context(), {
          ...command("supplier"),
          payload: { supplierId, displayName: "Nhà vườn synthetic", phone: null, note: null },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createPurchaseDraft(context(), {
          ...command("purchase-draft"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId,
                productName: "Cà chua",
                quantity: { valueScaled: 100_000, unit: "kg" },
                unitPrice: { amountMinor: 10_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesPurchaseId: null,
          },
        })
      ).ok,
    ).toBe(true);

    const confirm = {
      ...command("purchase-confirm"),
      expectedVersion: 1,
      payload: { purchaseId },
    };
    const confirmed = await confirmPurchase(context(), confirm);
    expect(confirmed.ok).toBe(true);
    expect(await confirmPurchase(context(), confirm)).toEqual(confirmed);

    const firstReceipt = await recordPurchaseReceipt(context(), {
      ...command("receipt-one"),
      payload: {
        receiptId: crypto.randomUUID() as PurchaseReceiptId,
        purchaseId,
        lines: [
          {
            receiptLineId: receiptLine(),
            purchaseLineId,
            productId,
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 60_000, unit: "kg" },
          },
        ],
        note: "Nhận đợt một",
      },
    });
    expect(firstReceipt.ok).toBe(true);
    const secondReceipt = await recordPurchaseReceipt(context(), {
      ...command("receipt-two"),
      payload: {
        receiptId: crypto.randomUUID() as PurchaseReceiptId,
        purchaseId,
        lines: [
          {
            receiptLineId: receiptLine(),
            purchaseLineId,
            productId,
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 40_000, unit: "kg" },
          },
        ],
        note: "Nhận đủ phần còn lại",
      },
    });
    expect(secondReceipt.ok).toBe(true);

    const receiving = await getPurchaseReceivingSummary(context(), {
      workspaceId: ctx.workspaceId,
      purchaseId,
    });
    expect(receiving.ok && receiving.value.lines[0]?.remaining.valueScaled).toBe(0);

    await ctx.database.sql`
      update workspace_operational_profiles
      set intake_mode = 'inspected_arrival', weighing_mode = 'gross_tare_net', version = 2
      where workspace_id = ${ctx.workspaceId}::uuid
    `;
    const inspectedSupplierId = crypto.randomUUID() as SupplierId;
    const inspectedPurchaseId = crypto.randomUUID() as PurchaseId;
    const inspectedPurchaseLineId = crypto.randomUUID() as PurchaseLineId;
    const inspectedArrivalId = crypto.randomUUID() as GoodsArrivalId;
    const inspectedArrivalLineId = crypto.randomUUID() as GoodsArrivalLineId;
    const inspectedInspectionId = crypto.randomUUID() as QualityInspectionId;
    const inspectedDispositionId = crypto.randomUUID() as QualityDispositionId;
    const quarantineAllocationId = crypto.randomUUID() as QualityDispositionAllocationId;
    expect(
      (
        await createSupplier(context(), {
          ...command("inspected-supplier"),
          payload: {
            supplierId: inspectedSupplierId,
            displayName: "Nhà vườn inspected",
            phone: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createPurchaseDraft(context(), {
          ...command("inspected-purchase-draft"),
          payload: {
            purchaseId: inspectedPurchaseId,
            supplierId: inspectedSupplierId,
            currency: "VND",
            lines: [
              {
                lineId: inspectedPurchaseLineId,
                productId: ctx.productIds[1],
                productName: "Rau muống",
                quantity: { valueScaled: 20_000, unit: "kg" },
                unitPrice: { amountMinor: 12_000, currency: "VND" },
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
          ...command("inspected-purchase-confirm"),
          expectedVersion: 1,
          payload: { purchaseId: inspectedPurchaseId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordGoodsArrival(context(), {
          ...command("inspected-arrival"),
          payload: {
            arrivalId: inspectedArrivalId,
            supplierId: inspectedSupplierId,
            purchaseId: inspectedPurchaseId,
            vehicleReference: "51C-SYNTHETIC",
            lines: [
              {
                arrivalLineId: inspectedArrivalLineId,
                purchaseLineId: inspectedPurchaseLineId,
                productId: ctx.productIds[1],
                productName: "Rau muống",
                arrivedQuantity: { valueScaled: 20_000, unit: "kg" },
                weighing: {
                  containerCount: 2,
                  grossWeight: { valueScaled: 21_000, unit: "kg" },
                  tareWeight: { valueScaled: 1_000, unit: "kg" },
                  netWeight: { valueScaled: 20_000, unit: "kg" },
                },
                supplierLotCode: "SYNTH-LOT-001",
                note: null,
              },
            ],
            note: null,
            evidenceReferences: ["photo://synthetic-arrival"],
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordQualityInspection(context(), {
          ...command("inspected-quality"),
          payload: {
            inspectionId: inspectedInspectionId,
            arrivalLineId: inspectedArrivalLineId,
            inspectedQuantity: { valueScaled: 20_000, unit: "kg" },
            issues: [],
            note: "Kiểm toàn bộ lô rau.",
            evidenceReferences: ["photo://synthetic-inspection"],
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordQualityDisposition(context(), {
          ...command("inspected-disposition"),
          payload: {
            dispositionId: inspectedDispositionId,
            source: { type: "arrival_line", arrivalLineId: inspectedArrivalLineId },
            allocations: [
              {
                allocationId: crypto.randomUUID() as QualityDispositionAllocationId,
                outcome: "accepted",
                quantity: { valueScaled: 15_000, unit: "kg" },
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                note: null,
              },
              {
                allocationId: quarantineAllocationId,
                outcome: "quarantined",
                quantity: { valueScaled: 5_000, unit: "kg" },
                qualityGradeId: null,
                qualityGradeName: null,
                note: "Chờ kiểm lại.",
              },
            ],
            note: "Phân loại lô nhập.",
            evidenceReferences: ["photo://synthetic-disposition"],
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordQualityDisposition(context(), {
          ...command("inspected-quarantine-resolution"),
          payload: {
            dispositionId: crypto.randomUUID(),
            source: { type: "quarantine_allocation", allocationId: quarantineAllocationId },
            allocations: [
              {
                allocationId: crypto.randomUUID() as QualityDispositionAllocationId,
                outcome: "rejected",
                quantity: { valueScaled: 5_000, unit: "kg" },
                qualityGradeId: null,
                qualityGradeName: null,
                note: "Không đạt sau kiểm lại.",
              },
            ],
            note: "Trả về kết quả kiểm lại.",
            evidenceReferences: ["photo://synthetic-rejection"],
          },
        })
      ).ok,
    ).toBe(true);
    const inspectedCoverage = await getProductCoverage(context(), {
      workspaceId: ctx.workspaceId,
      productIds: [ctx.productIds[1]],
    });
    expect(inspectedCoverage.ok && inspectedCoverage.value[0]?.quantities).toContainEqual(
      expect.objectContaining({
        unit: "kg",
        qualityGradeId: ctx.qualityGradeId,
        onHand: { valueScaled: 15_000, unit: "kg" },
      }),
    );

    expect(
      (
        await createSaleDraft(context(), {
          ...command("sale-draft"),
          payload: {
            saleId,
            customerId: ctx.customerId,
            currency: "VND",
            lines: [
              {
                lineId: saleLineId,
                productId,
                productName: "Cà chua",
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 30_000, unit: "kg" },
                unitPrice: { amountMinor: 20_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesSaleId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await postSale(context(), {
          ...command("sale-post"),
          expectedVersion: 1,
          payload: { saleId },
        })
      ).ok,
    ).toBe(true);

    const deliveries = [
      {
        id: crypto.randomUUID() as DeliveryId,
        lineId: crypto.randomUUID() as DeliveryLineId,
        quantity: 20_000,
      },
      {
        id: crypto.randomUUID() as DeliveryId,
        lineId: crypto.randomUUID() as DeliveryLineId,
        quantity: 10_000,
      },
    ];
    for (const [index, delivery] of deliveries.entries()) {
      expect(
        (
          await createDeliveryDraft(context(), {
            ...command(`delivery-draft-${index}`),
            payload: {
              deliveryId: delivery.id,
              saleId,
              lines: [
                {
                  deliveryLineId: delivery.lineId,
                  saleLineId,
                  productId,
                  qualityGradeId: ctx.qualityGradeId,
                  quantity: { valueScaled: delivery.quantity, unit: "kg" },
                },
              ],
              note: null,
            },
          })
        ).ok,
      ).toBe(true);
      const dispatch = {
        ...command(`delivery-dispatch-${index}`),
        expectedVersion: 1,
        payload: { deliveryId: delivery.id },
      };
      if (index === 0) {
        const staleDispatch = await dispatchDelivery(context(), {
          ...command("delivery-dispatch-stale"),
          expectedVersion: 99,
          payload: { deliveryId: delivery.id },
        });
        expect(staleDispatch.ok).toBe(false);
      }
      const dispatched = await dispatchDelivery(context(), dispatch);
      expect(dispatched.ok).toBe(true);
      if (index === 0) expect(await dispatchDelivery(context(), dispatch)).toEqual(dispatched);
      const delivered = {
        ...command(`delivery-delivered-${index}`),
        expectedVersion: 2,
        payload: { deliveryId: delivery.id },
      };
      expect((await markDeliveryDelivered(context(), delivered)).ok).toBe(true);
      if (index === 0) {
        const concurrentDelivery = await markDeliveryDelivered(context(), {
          ...command("delivery-delivered-conflict"),
          expectedVersion: 2,
          payload: { deliveryId: delivery.id },
        });
        expect(concurrentDelivery.ok).toBe(false);
      }
    }
    expect(
      (
        await recordDeliveryReturn(context(), {
          ...command("delivery-return"),
          payload: {
            returnId: crypto.randomUUID() as DeliveryReturnId,
            deliveryId: deliveries[0]!.id,
            lines: [
              {
                deliveryLineId: deliveries[0]!.lineId,
                quantity: { valueScaled: 5_000, unit: "kg" },
              },
            ],
            reason: "Khách trả một phần hàng",
          },
        })
      ).ok,
    ).toBe(true);

    const paymentId = crypto.randomUUID() as PaymentId;
    expect(
      (
        await recordCustomerPayment(context(), {
          ...command("customer-payment"),
          payload: {
            paymentId,
            customerId: ctx.customerId,
            amount: { amountMinor: 300_000, currency: "VND" },
            method: "cash",
            payerName: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    const allocationPolicyId = crypto.randomUUID();
    const allocationPolicy = await createWorkspacePolicyDraft(context(), {
      ...command("payment-allocation-policy-draft"),
      payload: {
        policyVersionId: allocationPolicyId,
        policyKind: "payment_allocation",
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition: { contractVersion: 1, parameters: { strategy: "manual" } },
        evidenceReferences: [],
        reason: "Cho phép đối soát khoản thu trong rehearsal.",
      },
    });
    expect(allocationPolicy.ok).toBe(true);
    if (!allocationPolicy.ok) return;
    expect(
      (
        await approveWorkspacePolicy(context(), {
          ...command("payment-allocation-policy-approve"),
          payload: {
            policyVersionId: allocationPolicy.value.id,
            evidenceReferences: ["rehearsal://payment-allocation"],
            reason: "Duyệt policy đối soát khoản thu.",
          },
        })
      ).ok,
    ).toBe(true);
    const allocationId = crypto.randomUUID();
    const rejectedAllocation = await recordPaymentAllocation(context(), {
      ...command("payment-allocation-recoverable-failure"),
      expectedVersion: 1,
      payload: {
        allocationId: crypto.randomUUID(),
        paymentId,
        saleId,
        amount: { amountMinor: 400_000, currency: "VND" },
        evidenceReferences: ["rehearsal://payment-allocation-rejected"],
      },
    });
    expect(rejectedAllocation.ok).toBe(false);
    expect(
      (
        await recordPaymentAllocation(context(), {
          ...command("payment-allocation"),
          expectedVersion: 1,
          payload: {
            allocationId,
            paymentId,
            saleId,
            amount: { amountMinor: 250_000, currency: "VND" },
            evidenceReferences: ["rehearsal://payment-allocation"],
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await reversePaymentAllocation(context(), {
          ...command("payment-allocation-reversal"),
          expectedVersion: 1,
          payload: {
            allocationId,
            reversalId: crypto.randomUUID(),
            amount: { amountMinor: 250_000, currency: "VND" },
            reason: "Hoàn tác phân bổ để kiểm tra vòng bù trừ.",
            evidenceReferences: ["rehearsal://payment-allocation-reversal"],
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await reverseCustomerPayment(context(), {
          ...command("customer-payment-reversal"),
          expectedVersion: 1,
          payload: {
            paymentId,
            reversalId: crypto.randomUUID() as PaymentReversalId,
            amount: { amountMinor: 50_000, currency: "VND" },
            cashAccountId: null,
            reason: "Điều chỉnh một phần khoản thu",
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordPaymentAllocation(context(), {
          ...command("payment-allocation-resolution"),
          expectedVersion: 2,
          payload: {
            allocationId: crypto.randomUUID(),
            paymentId,
            saleId,
            amount: { amountMinor: 250_000, currency: "VND" },
            evidenceReferences: ["rehearsal://payment-allocation-resolution"],
          },
        })
      ).ok,
    ).toBe(true);
    const supplierPaymentId = crypto.randomUUID() as SupplierPaymentId;
    expect(
      (
        await recordSupplierPayment(context(), {
          ...command("supplier-payment"),
          payload: {
            supplierPaymentId,
            supplierId,
            amount: { amountMinor: 400_000, currency: "VND" },
            method: "cash",
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    const fulfilment = await getSaleFulfilment(context(), { workspaceId: ctx.workspaceId, saleId });
    expect(fulfilment.ok && fulfilment.value.lines[0]).toMatchObject({
      netFulfilled: { valueScaled: 25_000, unit: "kg" },
      remaining: { valueScaled: 5_000, unit: "kg" },
    });
    const coverage = await getProductCoverage(context(), {
      workspaceId: ctx.workspaceId,
      productIds: [productId],
    });
    expect(coverage.ok && coverage.value[0]?.quantities).toEqual([
      expect.objectContaining({
        unit: "kg",
        qualityGradeId: null,
        qualityGradeName: null,
        onHand: { valueScaled: 0, unit: "kg" },
        inboundRemaining: { valueScaled: 0, unit: "kg" },
        outboundRemaining: { valueScaled: 0, unit: "kg" },
        availableAfterCommitments: { valueScaled: 0, unit: "kg" },
      }),
      expect.objectContaining({
        unit: "kg",
        qualityGradeId: ctx.qualityGradeId,
        qualityGradeName: "Loại 1",
        onHand: { valueScaled: 75_000, unit: "kg" },
        inboundRemaining: { valueScaled: 0, unit: "kg" },
        outboundRemaining: { valueScaled: 5_000, unit: "kg" },
        availableAfterCommitments: { valueScaled: 70_000, unit: "kg" },
      }),
    ]);
    expect(
      (
        await getInventoryReconciliation(context(), {
          workspaceId: ctx.workspaceId,
          productId,
          qualityGradeId: ctx.qualityGradeId,
          unit: "kg",
        })
      ).ok,
    ).toBe(true);
    expect((await getCustomerAccountBalance(context(), ctx.workspaceId, ctx.customerId)).ok).toBe(
      true,
    );
    expect(
      (
        await getAccountReconciliation(context(), {
          workspaceId: ctx.workspaceId,
          customerId: ctx.customerId,
        })
      ).ok,
    ).toBe(true);
    const supplierReconciliation = await getSupplierReconciliation(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
    });
    expect(supplierReconciliation.ok && supplierReconciliation.value.status).toBe("consistent");
    expect(
      (
        await getOperationalReport(context(), {
          workspaceId: ctx.workspaceId,
          reportType: "outstanding_delivery",
          businessDate: null,
          productId,
          unit: "kg",
          cursor: null,
          limit: 20,
        })
      ).ok,
    ).toBe(true);
    const board = await getOperationsBoard(context(), {
      workspaceId: ctx.workspaceId,
      filter: "all",
      sort: "updated_desc",
      search: "",
      cursor: null,
      limit: 20,
    });
    expect(board.ok && board.value.page.items.some((row) => row.id === saleId)).toBe(true);

    const closePolicyId = crypto.randomUUID();
    expect(
      (
        await createWorkspacePolicyDraft(context(), {
          ...command("operational-close-policy-draft"),
          payload: {
            policyVersionId: closePolicyId,
            policyKind: "operating_cycle_reconciliation",
            version: 1,
            effectiveFrom: "2026-07-01T00:00:00.000Z",
            effectiveTo: null,
            definition: {
              contractVersion: 1,
              parameters: {
                strategy: "observation_signoff",
                requiredObservationKinds: ["cash_count", "inventory_count"],
                allowReopen: true,
              },
            },
            evidenceReferences: ["rehearsal://operational-close-policy"],
            reason: "Thiết lập policy chốt cho ngày synthetic.",
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await approveWorkspacePolicy(context(), {
          ...command("operational-close-policy-approve"),
          payload: {
            policyVersionId: closePolicyId,
            evidenceReferences: ["rehearsal://operational-close-policy-approval"],
            reason: "Phê duyệt policy chốt cho ngày synthetic.",
          },
        })
      ).ok,
    ).toBe(true);
    const missingCloseEvidence = await getOperationalCloseReadiness(context(), {
      workspaceId: ctx.workspaceId,
      businessDate: "2026-07-29",
    });
    expect(missingCloseEvidence.ok && missingCloseEvidence.value).toMatchObject({
      state: "blocked",
      blockers: ["missing_observation"],
      missingObservationKinds: ["cash_count", "inventory_count"],
    });
    const cashObservationId = crypto.randomUUID() as ReconciliationObservationId;
    const inventoryObservationId = crypto.randomUUID() as ReconciliationObservationId;
    const recordCloseObservation = (
      id: ReconciliationObservationId,
      kind: "cash_count" | "inventory_count",
    ) =>
      recordReconciliationObservation(context(), {
        ...command(`operational-close-observation-${kind}`),
        payload: {
          reconciliationObservationId: id,
          kind,
          caseKind: "normal",
          description: `Đối chiếu ${kind} cho ngày synthetic.`,
          participantWording: "Đã kiểm tra và ghi nhận số liệu.",
          facts:
            kind === "cash_count"
              ? {
                  expectedAmount: { amountMinor: 250_000, currency: "VND" },
                  observedAmount: { amountMinor: 250_000, currency: "VND" },
                  expectedQuantity: null,
                  observedQuantity: null,
                  itemCount: 1,
                  productId: null,
                  qualityGradeId: null,
                  scopeReference: "cash://synthetic-day",
                }
              : {
                  expectedAmount: null,
                  observedAmount: null,
                  expectedQuantity: { valueScaled: 75_000, unit: "kg" },
                  observedQuantity: { valueScaled: 75_000, unit: "kg" },
                  itemCount: 1,
                  productId,
                  qualityGradeId: ctx.qualityGradeId,
                  scopeReference: "warehouse://synthetic-day",
                },
          evidenceReferences: [`rehearsal://operational-close/${kind}`],
          relatedObservationId: null,
        },
      });
    expect((await recordCloseObservation(cashObservationId, "cash_count")).ok).toBe(true);
    expect((await recordCloseObservation(inventoryObservationId, "inventory_count")).ok).toBe(true);
    const closeReady = await getOperationalCloseReadiness(context(), {
      workspaceId: ctx.workspaceId,
      businessDate: "2026-07-29",
    });
    expect(closeReady.ok && closeReady.value).toMatchObject({
      state: "ready",
      blockers: [],
      missingObservationKinds: [],
    });
    const operationalCloseId = crypto.randomUUID();
    const closed = await recordOperationalClose(context(), {
      ...command("operational-close"),
      payload: {
        operationalCloseId,
        businessDate: "2026-07-29",
        observationIds: [cashObservationId, inventoryObservationId],
        evidenceReferences: ["rehearsal://operational-close"],
        reason: "Đã đủ dữ liệu để chốt ngày synthetic.",
      },
    });
    expect(closed.ok).toBe(true);
    const closedReadiness = await getOperationalCloseReadiness(context(), {
      workspaceId: ctx.workspaceId,
      businessDate: "2026-07-29",
    });
    expect(closedReadiness.ok && closedReadiness.value).toMatchObject({
      state: "blocked",
      blockers: ["already_closed"],
    });

    const backup = await exportWorkspaceBackup(context(), {
      ...command("backup"),
      payload: {},
    });
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;

    const sourceUrl = process.env["DATABASE_URL"];
    expect(sourceUrl).toBeDefined();
    if (sourceUrl === undefined) return;
    const source = new URL(sourceUrl);
    const adminUrl = new URL(source);
    adminUrl.pathname = "/postgres";
    const targetName = `vuarau_recovery_${crypto.randomUUID().replaceAll("-", "")}_test`;
    const targetUrl = new URL(source);
    targetUrl.pathname = `/${targetName}`;
    const admin = createDatabase(adminUrl.toString(), { max: 1 });
    let target: ReturnType<typeof createDatabase> | undefined;
    try {
      await admin.sql.unsafe(`create database "${targetName}"`);
      await runMigrations(targetUrl.toString());
      target = createDatabase(targetUrl.toString(), { max: 4 });
      const targetWorkspaceId = crypto.randomUUID() as WorkspaceId;
      const targetActorId = crypto.randomUUID() as ActorId;
      const targetSubject = `sub-${targetActorId}`;
      const sourceActors = await ctx.database.db
        .select({
          id: actors.id,
          supabaseUserId: actors.supabaseUserId,
          displayName: actors.displayName,
        })
        .from(actors);
      await target.db.insert(workspaces).values({
        id: targetWorkspaceId,
        name: "test:synthetic-recovery-target",
      });
      await target.db.insert(workspaceOperationalProfiles).values({
        workspaceId: targetWorkspaceId,
      });
      await target.db.insert(actors).values([
        ...sourceActors,
        {
          id: targetActorId,
          supabaseUserId: targetSubject,
          displayName: "tester:synthetic-recovery-target",
        },
      ]);
      await target.db.insert(workspaceMemberships).values({
        workspaceId: targetWorkspaceId,
        actorId: targetActorId,
        role: "owner",
      });
      await target.db.insert(workspaceMembershipRoles).values({
        workspaceId: targetWorkspaceId,
        actorId: targetActorId,
        role: "owner",
        assignedBy: targetActorId,
      });
      const targetDeps: CommandDeps = {
        uow: createUnitOfWork(target.db, randomIdGenerator) as CommandDeps["uow"],
        clock: { now: () => "2026-07-29T12:00:00.000Z" as never },
      };
      const targetContext: CommandContext = {
        deps: targetDeps,
        principal: { actorId: targetActorId, subject: targetSubject },
      };
      const restored = await restoreWorkspaceBackup(targetContext, {
        ...command("restore", targetWorkspaceId, targetActorId),
        payload: { backup: backup.value, reason: "Diễn tập phục hồi sang database trống" },
      });
      expect(restored.ok, JSON.stringify(restored)).toBe(true);
      if (!restored.ok) return;
      expect(restored.value.integrity.status).toBe("healthy");
      const targetIntegrity = await getWorkspaceIntegrity(targetContext, targetWorkspaceId);
      expect(targetIntegrity.ok && targetIntegrity.value.status).toBe("healthy");
      expect(
        (
          await getAccountReconciliation(targetContext, {
            workspaceId: targetWorkspaceId,
            customerId: ctx.customerId,
          })
        ).ok,
      ).toBe(true);
      const restoredSupplierReconciliation = await getSupplierReconciliation(targetContext, {
        workspaceId: targetWorkspaceId,
        supplierId,
      });
      expect(restoredSupplierReconciliation.ok && restoredSupplierReconciliation.value.status).toBe(
        "consistent",
      );
      const restoredInventoryReconciliation = await getInventoryReconciliation(targetContext, {
        workspaceId: targetWorkspaceId,
        productId,
        qualityGradeId: ctx.qualityGradeId,
        unit: "kg",
      });
      expect(restoredInventoryReconciliation.ok).toBe(true);
    } finally {
      if (target !== undefined) await target.sql.end();
      await admin.sql.unsafe(`drop database "${targetName}" with (force)`);
      await admin.sql.end();
    }
  });
});
