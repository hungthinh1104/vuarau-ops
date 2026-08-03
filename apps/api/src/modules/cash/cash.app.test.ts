import { beforeEach, describe, expect, it } from "vitest";
import {
  cashAccountIdSchema,
  cashTransferIdSchema,
  defaultWorkspaceOperationalProfile,
  expenseIdSchema,
  expenseReversalIdSchema,
  paymentIdSchema,
  paymentReversalIdSchema,
  supplierIdSchema,
  supplierPaymentIdSchema,
  supplierPaymentReversalIdSchema,
} from "@vuarau/domain-contracts";
import { ACTOR_ID, WORKSPACE_ID, activeCustomer } from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  createCashAccount,
  adjustCash,
  recordCashTransfer,
  recordExpense,
  reverseCashTransfer,
  reverseExpense,
} from "./cash.handlers.ts";
import { getCashReconciliation } from "./cash.queries.ts";
import { getCashTransfer, getExpense } from "./cash.queries.ts";
import { getOperationalReport } from "../report/report.queries.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../payment/reverse-payment.handler.ts";
import {
  createSupplier,
  recordSupplierPayment,
  reverseSupplierPayment,
} from "../supplier/supplier.handlers.ts";

let harness: Harness;
const drawer = cashAccountIdSchema.parse("90000000-0000-4000-8000-000000000001");
const bank = cashAccountIdSchema.parse("90000000-0000-4000-8000-000000000002");

const envelope = (key: string) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: key,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: "2026-07-20T05:00:00.000Z",
});

beforeEach(async () => {
  harness = createHarness();
  harness.db.setOperationalProfile({
    ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
    cashbookMode: "accounts_ledger",
    version: 2,
  });
  for (const [id, displayName, kind] of [
    [drawer, "Két chính", "cash_drawer"],
    [bank, "Ngân hàng", "bank"],
  ] as const) {
    const result = await createCashAccount(harness.ctx, {
      ...envelope(`account-${id}`),
      payload: {
        cashAccountId: id,
        displayName,
        kind,
        currency: "VND",
        custodianActorId: null,
        note: null,
      },
    });
    expect(result.ok).toBe(true);
  }
});

describe("cashbook application", () => {
  it("TC-CASH-004 — records and reverses customer cash atomically with customer debt", async () => {
    const paymentId = paymentIdSchema.parse("90000000-0000-4000-8000-000000000010");
    const payment = await recordCustomerPayment(harness.ctx, {
      ...envelope("customer-cash-in"),
      payload: {
        paymentId,
        customerId: activeCustomer.id,
        amount: { amountMinor: 500_000, currency: "VND" },
        method: "cash",
        cashAccountId: drawer,
        payerName: null,
        note: "Khách trả tiền",
      },
    });
    expect(payment.ok).toBe(true);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, drawer)?.balance.amountMinor).toBe(500_000);

    const reversal = await reverseCustomerPayment(harness.ctx, {
      ...envelope("customer-cash-out"),
      expectedVersion: 1,
      payload: {
        paymentId,
        reversalId: paymentReversalIdSchema.parse("90000000-0000-4000-8000-000000000011"),
        amount: { amountMinor: 200_000, currency: "VND" },
        reason: "Hoàn lại một phần",
      },
    });
    expect(reversal.ok).toBe(true);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, drawer)?.balance.amountMinor).toBe(300_000);
    expect(harness.db.cashMovementRecords().map((row) => row.sourceType)).toEqual([
      "customer_payment",
      "customer_payment_reversal",
    ]);
  });

  it("TC-CASH-005 — records and reverses supplier cash in the opposite direction", async () => {
    const supplierId = supplierIdSchema.parse("90000000-0000-4000-8000-000000000020");
    expect(
      (
        await createSupplier(harness.ctx, {
          ...envelope("supplier"),
          payload: { supplierId, displayName: "Nhà vườn", phone: null, note: null },
        })
      ).ok,
    ).toBe(true);
    const supplierPaymentId = supplierPaymentIdSchema.parse("90000000-0000-4000-8000-000000000021");
    const payment = await recordSupplierPayment(harness.ctx, {
      ...envelope("supplier-cash-out"),
      payload: {
        supplierPaymentId,
        supplierId,
        amount: { amountMinor: 400_000, currency: "VND" },
        method: "cash",
        cashAccountId: drawer,
        note: null,
      },
    });
    expect(payment.ok).toBe(true);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, drawer)?.balance.amountMinor).toBe(-400_000);

    const reversal = await reverseSupplierPayment(harness.ctx, {
      ...envelope("supplier-cash-return"),
      expectedVersion: 1,
      payload: {
        reversalId: supplierPaymentReversalIdSchema.parse("90000000-0000-4000-8000-000000000022"),
        supplierPaymentId,
        amount: { amountMinor: 100_000, currency: "VND" },
        reason: "Nhà cung cấp hoàn lại",
      },
    });
    expect(reversal.ok).toBe(true);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, drawer)?.balance.amountMinor).toBe(-300_000);
  });

  it("TC-CASH-006 — expense reversal and cash transfer conserve source-backed cash truth", async () => {
    const expenseId = expenseIdSchema.parse("90000000-0000-4000-8000-000000000030");
    expect(
      (
        await recordExpense(harness.ctx, {
          ...envelope("expense-record"),
          payload: {
            expenseId,
            cashAccountId: drawer,
            category: "fuel",
            amount: { amountMinor: 150_000, currency: "VND" },
            payee: "Cây xăng",
            note: "Đổ dầu",
            evidenceReferences: ["receipt://cash/expense/030", "photo://cash/expense/030"],
          },
        })
      ).ok,
    ).toBe(true);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, drawer)?.balance.amountMinor).toBe(-150_000);
    expect(
      (
        await reverseExpense(harness.ctx, {
          ...envelope("expense-reversal"),
          payload: {
            reversalId: expenseReversalIdSchema.parse("90000000-0000-4000-8000-000000000031"),
            expenseId,
            reason: "Ghi nhầm",
            evidenceReferences: ["note://cash/reversal/031"],
          },
        })
      ).ok,
    ).toBe(true);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, drawer)?.balance.amountMinor).toBe(0);

    const transferId = cashTransferIdSchema.parse("90000000-0000-4000-8000-000000000032");
    const command = {
      ...envelope("transfer"),
      payload: {
        transferId,
        fromCashAccountId: drawer,
        toCashAccountId: bank,
        amount: { amountMinor: 250_000, currency: "VND" as const },
        note: "Nộp tiền vào ngân hàng",
        evidenceReferences: ["bank-slip://cash/transfer/032"],
      },
    };
    const first = await recordCashTransfer(harness.ctx, command);
    const replay = await recordCashTransfer(harness.ctx, command);
    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, drawer)?.balance.amountMinor).toBe(-250_000);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, bank)?.balance.amountMinor).toBe(250_000);

    const reverse = await reverseCashTransfer(harness.ctx, {
      ...envelope("transfer-reversal"),
      payload: {
        reversalId: "90000000-0000-4000-8000-000000000033",
        transferId,
        reason: "Chuyển nhầm",
        evidenceReferences: ["note://cash/transfer-reversal/033"],
      },
    });
    expect(reverse.ok).toBe(true);
    const expense = await getExpense(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      expenseId,
    });
    expect(expense.ok && expense.value.evidenceReferences).toEqual([
      "receipt://cash/expense/030",
      "photo://cash/expense/030",
    ]);
    expect(expense.ok && expense.value.reversal?.evidenceReferences).toEqual([
      "note://cash/reversal/031",
    ]);
    const transfer = await getCashTransfer(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      transferId,
    });
    expect(transfer.ok && transfer.value.evidenceReferences).toEqual([
      "bank-slip://cash/transfer/032",
    ]);
    expect(transfer.ok && transfer.value.reversal?.evidenceReferences).toEqual([
      "note://cash/transfer-reversal/033",
    ]);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, drawer)?.balance.amountMinor).toBe(0);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, bank)?.balance.amountMinor).toBe(0);

    const reconciliation = await getCashReconciliation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      cashAccountId: drawer,
    });
    expect(reconciliation.ok && reconciliation.value.status).toBe("consistent");
  });

  it("TC-CASH-007 — records explained cash adjustment and exposes source-backed reports", async () => {
    const result = await adjustCash(harness.ctx, {
      ...envelope("cash-adjustment"),
      payload: {
        adjustmentId: "90000000-0000-4000-8000-000000000040",
        cashAccountId: drawer,
        direction: "increase",
        amount: { amountMinor: 600_000, currency: "VND" },
        reasonCode: "owner_contribution",
        reason: "Chủ bổ sung vốn lưu động",
        evidenceReferences: ["cash-count://cash/adjustment/040"],
      },
    });
    expect(result.ok).toBe(true);
    expect(harness.db.cashBalanceFor(WORKSPACE_ID, drawer)?.balance.amountMinor).toBe(600_000);

    const report = await getOperationalReport(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      reportType: "cash_movement_report",
      businessDate: "2026-07-20",
      productId: null,
      unit: null,
      cursor: null,
      limit: 20,
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.value.page.items).toContainEqual(
      expect.objectContaining({
        sourceType: "cash_adjustment",
        amount: { amountMinor: 600_000, currency: "VND" },
      }),
    );
    expect(report.value.totals.amount?.amountMinor).toBe(600_000);
  });
});
