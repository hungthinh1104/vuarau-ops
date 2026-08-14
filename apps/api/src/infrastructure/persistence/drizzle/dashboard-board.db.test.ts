import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  createWorkspacePolicyDraft,
  approveWorkspacePolicy,
} from "../../../modules/policy/policy.handlers.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import { recordPaymentAllocation } from "../../../modules/account/payment-allocation.handlers.ts";
import { recordDebtObservation } from "../../../modules/evidence/evidence.handlers.ts";
import {
  getOperationsBoard,
  getOperationsBoardCounts,
} from "../../../modules/dashboard/dashboard.queries.ts";

describe.skipIf(skipWithoutDatabase())(
  "Operations Board money exceptions against PostgreSQL",
  () => {
    let ctx: DbTestContext;
    let deps: CommandDeps;

    const context = (): CommandContext => ({
      deps,
      principal: { actorId: ctx.actorId, subject: ctx.subject },
    });

    const command = (label: string, occurredAt = "2026-07-29T12:00:00.000Z") => ({
      commandId: crypto.randomUUID(),
      idempotencyKey: `board-money-${label}-${crypto.randomUUID()}`,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      occurredAt,
    });

    beforeEach(async () => {
      ctx = await createDbTestContext(`dashboard-board-money-${crypto.randomUUID()}`);
      deps = {
        uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
        clock: { now: () => "2026-07-29T12:00:00.000Z" as never },
      };
    });

    afterEach(async () => {
      if (ctx) await ctx.close();
    });

    it("TC-OPS-024 — keeps unallocated money visible when the Sale itself is fully allocated", async () => {
      const paymentPolicy = await createWorkspacePolicyDraft(context(), {
        ...command("policy-draft"),
        payload: {
          policyVersionId: crypto.randomUUID(),
          policyKind: "payment_allocation",
          version: 1,
          effectiveFrom: "2026-07-01T00:00:00.000Z",
          effectiveTo: null,
          definition: {
            contractVersion: 1,
            parameters: { strategy: "manual" },
          },
          evidenceReferences: [],
          reason: "Kiểm tra tiền nhận chưa phân bổ trên bảng điều hành.",
        },
      });
      expect(paymentPolicy.ok).toBe(true);
      if (!paymentPolicy.ok) return;

      const approved = await approveWorkspacePolicy(context(), {
        ...command("policy-approve"),
        payload: {
          policyVersionId: paymentPolicy.value.id,
          evidenceReferences: ["test://board-money"],
          reason: "Duyệt policy cho kiểm thử bảng điều hành.",
        },
      });
      expect(approved.ok).toBe(true);

      const saleId = crypto.randomUUID();
      const saleLineId = crypto.randomUUID();
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
                  productId: ctx.productIds[0],
                  productName: "Cà chua",
                  qualityGradeId: ctx.qualityGradeId,
                  qualityGradeName: "Loại 1",
                  quantity: { valueScaled: 1_000, unit: "kg" },
                  unitPrice: { amountMinor: 875_000, currency: "VND" },
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

      const paymentId = crypto.randomUUID();
      deps = {
        ...deps,
        clock: { now: () => "2026-07-29T12:01:00.000Z" as never },
      };
      const payment = await recordCustomerPayment(context(), {
        ...command("payment"),
        payload: {
          paymentId,
          customerId: ctx.customerId,
          amount: { amountMinor: 1_200_000, currency: "VND" },
          method: "cash",
          payerName: null,
          note: null,
        },
      });
      expect(payment, JSON.stringify(payment)).toMatchObject({ ok: true });

      const allocation = await recordPaymentAllocation(context(), {
        ...command("allocation"),
        expectedVersion: 1,
        payload: {
          allocationId: crypto.randomUUID(),
          paymentId,
          saleId,
          amount: { amountMinor: 875_000, currency: "VND" },
          evidenceReferences: [],
        },
      });
      expect(allocation, JSON.stringify(allocation)).toMatchObject({ ok: true });

      const board = await getOperationsBoard(context(), {
        workspaceId: ctx.workspaceId,
        filter: "all",
        sort: "updated_desc",
        search: "",
        cursor: null,
        limit: 20,
      });
      expect(board.ok).toBe(true);
      if (board.ok) {
        expect(board.value.page.items).toContainEqual(
          expect.objectContaining({
            id: saleId,
            financialState: "reconciliation_required",
            unallocatedPayment: true,
            unallocatedPaymentAmount: { amountMinor: 325_000, currency: "VND" },
            nextAction: "Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.",
            updatedAt: "2026-07-29T12:01:00.000Z",
          }),
        );
      }

      const counts = await getOperationsBoardCounts(context(), {
        workspaceId: ctx.workspaceId,
        filter: "all",
        search: "",
      });
      expect(counts.ok).toBe(true);
      if (counts.ok) {
        expect(counts.value.counts.attention).toBe(1);
        expect(counts.value.counts.unallocatedPayment).toBe(1);
      }

      const attention = await getOperationsBoard(context(), {
        workspaceId: ctx.workspaceId,
        filter: "attention",
        sort: "updated_desc",
        search: "",
        cursor: null,
        limit: 20,
      });
      expect(attention.ok).toBe(true);
      if (attention.ok) expect(attention.value.page.items.map((row) => row.id)).toContain(saleId);

      const unallocated = await getOperationsBoard(context(), {
        workspaceId: ctx.workspaceId,
        filter: "unallocated_payment",
        sort: "updated_desc",
        search: "",
        cursor: null,
        limit: 20,
      });
      expect(unallocated.ok).toBe(true);
      if (unallocated.ok) {
        expect(unallocated.value.page.items).toContainEqual(
          expect.objectContaining({
            id: saleId,
            unallocatedPayment: true,
            unallocatedPaymentAmount: { amountMinor: 325_000, currency: "VND" },
          }),
        );
      }

      const preserved = await recordDebtObservation(context(), {
        ...command("credit-preserved"),
        payload: {
          debtObservationId: crypto.randomUUID(),
          kind: "customer_credit_preserved",
          caseKind: "normal",
          description: "Khách xác nhận giữ lại phần tiền chưa phân bổ.",
          participantWording: "Khách hàng xác nhận.",
          facts: {
            amount: { amountMinor: 325_000, currency: "VND" },
            agreedDueAt: null,
            promiseToPayAt: null,
            termCode: null,
            termText: null,
            paymentReference: paymentId,
            allocationProposal: null,
            customerId: ctx.customerId,
          },
          evidenceReferences: ["test://board-money/credit"],
          relatedObservationId: null,
        },
      });
      expect(preserved, JSON.stringify(preserved)).toMatchObject({ ok: true });

      const resolved = await getOperationsBoard(context(), {
        workspaceId: ctx.workspaceId,
        filter: "unallocated_payment",
        sort: "updated_desc",
        search: "",
        cursor: null,
        limit: 20,
      });
      expect(resolved.ok).toBe(true);
      if (resolved.ok) expect(resolved.value.page.items).toHaveLength(0);

      const resolvedCounts = await getOperationsBoardCounts(context(), {
        workspaceId: ctx.workspaceId,
        filter: "all",
        search: "",
      });
      expect(resolvedCounts.ok).toBe(true);
      if (resolvedCounts.ok) {
        expect(resolvedCounts.value.counts.unallocatedPayment).toBe(0);
      }
    });
  },
);
