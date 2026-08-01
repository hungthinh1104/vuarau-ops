import { describe, expect, it } from "vitest";
import {
  cashAccountIdSchema,
  createCashAccountCommandSchema,
  expenseIdSchema,
  recordCashTransferCommandSchema,
  recordExpenseCommandSchema,
  workspaceIdSchema,
} from "@vuarau/domain-contracts";
import {
  decideCreateCashAccount,
  decideRecordCashTransfer,
  decideRecordExpense,
} from "./index.ts";

const workspaceId = workspaceIdSchema.parse("11111111-1111-4111-8111-111111111111");
const actorId = "22222222-2222-4222-8222-222222222222";
const at = "2026-07-20T05:00:00.000Z";
const recordedAt = "2026-07-20T05:00:01.000Z";
const accountId = cashAccountIdSchema.parse("33333333-3333-4333-8333-333333333333");

const envelope = (key: string) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: key,
  workspaceId,
  actorId,
  occurredAt: at,
});

const createAccount = (kind: "cash_drawer" | "employee_holding", custodianActorId: string | null) =>
  createCashAccountCommandSchema.parse({
    ...envelope(`account-${kind}`),
    payload: {
      cashAccountId: accountId,
      displayName: "Két chính",
      kind,
      currency: "VND",
      custodianActorId,
      note: null,
    },
  });

describe("cashbook domain", () => {
  it("TC-CASH-001 — requires one custodian only for employee-held cash", () => {
    const invalid = decideCreateCashAccount(createAccount("employee_holding", null), recordedAt);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error.code).toBe("CASH_ACCOUNT_CUSTODIAN_INVALID");

    const valid = decideCreateCashAccount(createAccount("cash_drawer", null), recordedAt);
    expect(valid.ok).toBe(true);
  });

  it("TC-CASH-002 — records expense as a positive source fact and a negative cash effect", () => {
    const account = decideCreateCashAccount(createAccount("cash_drawer", null), recordedAt);
    expect(account.ok).toBe(true);
    if (!account.ok) return;
    const command = recordExpenseCommandSchema.parse({
      ...envelope("expense-record"),
      payload: {
        expenseId: expenseIdSchema.parse("44444444-4444-4444-8444-444444444444"),
        cashAccountId: accountId,
        category: "fuel",
        amount: { amountMinor: 250_000, currency: "VND" },
        payee: "Cây xăng",
        note: "Đổ dầu xe giao hàng",
      },
    });
    const result = decideRecordExpense(command, account.value.account, recordedAt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expense.amount.amountMinor).toBe(250_000);
    expect(result.value.movementAmountMinor).toBe(-250_000);
  });

  it("TC-CASH-003 — refuses transfer to the same account", () => {
    const account = decideCreateCashAccount(createAccount("cash_drawer", null), recordedAt);
    expect(account.ok).toBe(true);
    if (!account.ok) return;
    const command = recordCashTransferCommandSchema.parse({
      ...envelope("same-account-transfer"),
      payload: {
        transferId: crypto.randomUUID(),
        fromCashAccountId: accountId,
        toCashAccountId: accountId,
        amount: { amountMinor: 100_000, currency: "VND" },
        note: null,
      },
    });
    const result = decideRecordCashTransfer(
      command,
      account.value.account,
      account.value.account,
      recordedAt,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CASH_TRANSFER_INVALID");
  });
});
