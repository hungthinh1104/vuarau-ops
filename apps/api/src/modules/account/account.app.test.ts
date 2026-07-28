import { beforeEach, describe, expect, it } from "vitest";
import {
  commandIdSchema,
  customerAccountEntryIdSchema,
  customerIdSchema,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  ADJUSTMENT_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  LATER_TRANSACTION_TIME,
  SALE_ID,
  OTHER_IDEMPOTENCY_KEY,
  PAYMENT_AMOUNT,
  PAYMENT_ID,
  SALES_ACTOR_ID,
  SECOND_COMMAND_ID,
  THIRD_COMMAND_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  saleLineInputs,
  vnd,
} from "@vuarau/test-fixtures";
import { createHarness, ledgerBalance, type Harness } from "../../testing/command-test-harness.ts";
import { adjustCustomerDebt } from "./adjust-debt.handler.ts";
import {
  getAccountAdjustmentDetail,
  getAccountReconciliation,
  getCustomerAccountBalance,
  rebuildAccountBalance,
} from "./account.queries.ts";
import { rebuildAccountProjection } from "./rebuild-account-projection.handler.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import { createCustomer } from "../customer/create-customer.handler.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
  paymentSequence = 0;
});

/**
 * Distinct from the ids `runCasebookLedger` uses. Reusing one would be caught by
 * `DUPLICATE_COMMAND` (a commandId may not appear under two idempotency keys),
 * which is the rule working, not the test being awkward.
 */
const ADJUST_COMMAND_ID = "00000000-0000-4000-8000-000000000471";

const adjustInput = (overrides: Record<string, unknown> = {}) => ({
  commandId: ADJUST_COMMAND_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  payload: {
    adjustmentId: ADJUSTMENT_ID,
    customerId: CUSTOMER_ID,
    direction: "increase",
    amount: vnd(50_000),
    reasonCode: "opening_balance",
    reason: "Nợ cũ từ sổ giấy",
  },
  ...overrides,
});

/** A payment with its own ids, so several can run in one test. */
let paymentSequence = 0;
const paymentInput = (key: string, amount: ReturnType<typeof vnd>) => {
  paymentSequence += 1;
  const pad = (n: number) => String(n).padStart(12, "0");
  return {
    commandId: `00000000-0000-4000-8000-${pad(700 + paymentSequence)}`,
    idempotencyKey: `overpay-${key}`,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: LATER_TRANSACTION_TIME,
    payload: {
      paymentId: `00000000-0000-4000-8000-${pad(800 + paymentSequence)}`,
      customerId: CUSTOMER_ID,
      amount,
      method: "cash" as const,
      payerName: null,
      note: null,
    },
  };
};

/** Walks the customer through the whole casebook ledger in docs/05-casebook/customer-account-cases.md. */
async function runCasebookLedger(): Promise<void> {
  await createSaleDraft(harness.ctx, {
    commandId: COMMAND_ID,
    idempotencyKey: "casebook-sale-create-key",
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    payload: {
      saleId: SALE_ID,
      customerId: CUSTOMER_ID,
      currency: "VND",
      lines: [...saleLineInputs],
      note: null,
    },
  });
  await postSale(harness.ctx, {
    commandId: SECOND_COMMAND_ID,
    idempotencyKey: "casebook-sale-post-key",
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    expectedVersion: 1,
    payload: { saleId: SALE_ID },
  });
  await recordCustomerPayment(harness.ctx, {
    commandId: THIRD_COMMAND_ID,
    idempotencyKey: "casebook-payment-key",
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: LATER_TRANSACTION_TIME,
    payload: {
      paymentId: PAYMENT_ID,
      customerId: CUSTOMER_ID,
      amount: PAYMENT_AMOUNT,
      method: "cash",
      payerName: null,
      note: null,
    },
  });
}

describe("BR-ACCOUNT-001 / TC-ACCOUNT-001", () => {
  it("keeps the summary equal to the sum of entries through the whole casebook", async () => {
    await runCasebookLedger();

    const summary = await getCustomerAccountBalance(harness.ctx, WORKSPACE_ID, CUSTOMER_ID);
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.balance.amountMinor).toBe(375_000);
    expect(summary.value.balance.amountMinor).toBe(ledgerBalance(harness, CUSTOMER_ID));
    expect(summary.value.entryCount).toBe(2);
  });

  it("reports zero for a customer with no entries, without writing a row", async () => {
    const summary = await getCustomerAccountBalance(harness.ctx, WORKSPACE_ID, CUSTOMER_ID);
    expect(summary.ok).toBe(true);
    if (!summary.ok) return;
    expect(summary.value.balance.amountMinor).toBe(0);
    expect(summary.value.entryCount).toBe(0);
    expect(harness.db.balanceFor(WORKSPACE_ID, CUSTOMER_ID)).toBeNull();
  });
});

describe("BR-ACCOUNT-006 / TC-ACCOUNT-002", () => {
  it("rebuilds a stale projection from the entries", async () => {
    // CASE-ACCOUNT-007 — a summary row that has drifted, for whatever reason.
    await runCasebookLedger();

    harness.db.overwriteBalance({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      balance: vnd(999_999),
      entryCount: 99,
      lastEntryTransactionTime: null,
      updatedAt: TRANSACTION_TIME,
    });

    const rebuilt = await rebuildAccountBalance(harness.deps, WORKSPACE_ID, CUSTOMER_ID);

    expect(rebuilt.balance.amountMinor).toBe(375_000);
    expect(rebuilt.entryCount).toBe(2);
    expect(rebuilt.lastEntryTransactionTime).toBe(LATER_TRANSACTION_TIME);
  });

  it("produces exactly what incremental maintenance produced", async () => {
    // The fast path and the rebuild path must not be able to disagree — that
    // equality is what keeps the incremental update honest.
    await runCasebookLedger();

    const incremental = harness.db.balanceFor(WORKSPACE_ID, CUSTOMER_ID);
    const rebuilt = await rebuildAccountBalance(harness.deps, WORKSPACE_ID, CUSTOMER_ID);

    expect(rebuilt.balance).toEqual(incremental?.balance);
    expect(rebuilt.entryCount).toBe(incremental?.entryCount);
    expect(rebuilt.lastEntryTransactionTime).toBe(incremental?.lastEntryTransactionTime);
  });

  it("leaves the ledger untouched while rebuilding", async () => {
    await runCasebookLedger();
    const before = [...harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)];

    await rebuildAccountBalance(harness.deps, WORKSPACE_ID, CUSTOMER_ID);

    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toEqual(before);
  });
});

describe("BR-ACCOUNT-004 / TC-ACCOUNT-004", () => {
  it("reads a manual adjustment from its ledger source with its historical account effect", async () => {
    await adjustCustomerDebt(harness.ctx, adjustInput());
    await recordCustomerPayment(harness.ctx, paymentInput("after-adjustment", vnd(10_000)));

    const detail = await getAccountAdjustmentDetail(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      adjustmentId: ADJUSTMENT_ID,
    });

    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.value.direction).toBe("increase");
    expect(detail.value.accountEffect.balanceBefore.amountMinor).toBe(0);
    expect(detail.value.accountEffect.change.amountMinor).toBe(50_000);
    expect(detail.value.accountEffect.balanceAfter.amountMinor).toBe(50_000);
    expect(detail.value.commandId).toBe(ADJUST_COMMAND_ID);
  });

  it("keeps the complete money truth when an adjustment follows the casebook ledger", async () => {
    await runCasebookLedger();
    await adjustCustomerDebt(
      harness.ctx,
      adjustInput({
        payload: {
          ...adjustInput().payload,
          direction: "decrease",
          amount: vnd(45_000),
          reasonCode: "goodwill_discount",
          reason: "Giảm giá đã duyệt",
        },
      }),
    );

    const detail = await getAccountAdjustmentDetail(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      adjustmentId: ADJUSTMENT_ID,
    });

    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    // The detail is historical: the later casebook payment must not be folded
    // back into the adjustment's own effect.
    expect(detail.value.accountEffect.balanceBefore.amountMinor).toBe(875_000);
    expect(detail.value.accountEffect.change.amountMinor).toBe(-45_000);
    expect(detail.value.accountEffect.balanceAfter.amountMinor).toBe(830_000);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(330_000);
  });

  it("attributes every ledger entry to an actor and a command", async () => {
    await runCasebookLedger();
    await adjustCustomerDebt(harness.ctx, adjustInput());

    for (const entry of harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)) {
      expect(entry.actorId).toBe(ACTOR_ID);
      expect(entry.commandId).toBeTruthy();
    }
  });

  it("records an audit entry carrying the adjustment's reason", async () => {
    await adjustCustomerDebt(harness.ctx, adjustInput());

    const audit = harness.db.auditRecords().find((record) => record.action === "debt.adjusted");
    expect(audit?.reason).toBe("Nợ cũ từ sổ giấy");
    expect(audit?.actorId).toBe(ACTOR_ID);
    expect(audit?.aggregateType).toBe("debt");
  });
});

describe("BR-ACCOUNT-002 / TC-ACCOUNT-006", () => {
  it("moves the balance only through ledger-producing commands", async () => {
    // CASE-ACCOUNT-004 and CASE-ACCOUNT-005.
    const increased = await adjustCustomerDebt(harness.ctx, adjustInput());
    expect(increased.ok).toBe(true);
    if (!increased.ok) return;
    expect(increased.value.balance.amountMinor).toBe(50_000);

    const decreased = await adjustCustomerDebt(
      harness.ctx,
      adjustInput({
        commandId: SECOND_COMMAND_ID,
        idempotencyKey: OTHER_IDEMPOTENCY_KEY,
        payload: {
          ...adjustInput().payload,
          adjustmentId: "00000000-0000-4000-8000-000000000599",
          direction: "decrease",
          amount: vnd(20_000),
          reasonCode: "goodwill_discount",
          reason: "Giảm giá do hàng dập",
        },
      }),
    );

    expect(decreased.ok).toBe(true);
    if (!decreased.ok) return;
    expect(decreased.value.balance.amountMinor).toBe(30_000);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(30_000);
  });

  it("does not move any balance when master data is created", async () => {
    const created = await createCustomer(harness.ctx, {
      commandId: COMMAND_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: TRANSACTION_TIME,
      payload: {
        customerId: "00000000-0000-4000-8000-0000000000c8",
        displayName: "Anh Tuấn mới mở",
        phone: null,
        note: null,
      },
    });

    expect(created.ok).toBe(true);
    expect(harness.db.accountEntries()).toHaveLength(0);
  });

  it("does not move any balance when a draft sale is created", async () => {
    await createSaleDraft(harness.ctx, {
      commandId: COMMAND_ID,
      idempotencyKey: "draft-only-key-0001",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: TRANSACTION_TIME,
      payload: {
        saleId: SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
      },
    });

    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(0);
  });
});

describe("BR-ACCOUNT-003 / TC-ACCOUNT-003", () => {
  it("refuses an adjustment with a blank reason and writes nothing", async () => {
    // CASE-ACCOUNT-006.
    const result = await adjustCustomerDebt(
      harness.ctx,
      adjustInput({ payload: { ...adjustInput().payload, reason: "   " } }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DEBT_ADJUSTMENT_REASON_REQUIRED");
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(0);
  });
});

describe("BR-ACCOUNT-005 / TC-ACCOUNT-005", () => {
  it("never rewrites an existing entry when debt changes again", async () => {
    await runCasebookLedger();
    const entriesAfterPayment = structuredClone([
      ...harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID),
    ]);

    await adjustCustomerDebt(harness.ctx, adjustInput());

    const entriesNow = harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID);
    expect(entriesNow).toHaveLength(3);
    // The first two are byte-for-byte what they were.
    expect(entriesNow.slice(0, 2)).toEqual(entriesAfterPayment);
  });
});

describe("BR-ACCOUNT-009 / TC-ACCOUNT-010", () => {
  it("classifies an overpaid customer as being in credit, not as owing a negative", async () => {
    // CASE-ACCOUNT-008, day 3: the customer pays ahead for Friday's load.
    await adjustCustomerDebt(harness.ctx, {
      ...adjustInput(),
      payload: { ...adjustInput().payload, direction: "increase", amount: vnd(600_000) },
    });

    const owing = await getCustomerAccountBalance(harness.ctx, WORKSPACE_ID, CUSTOMER_ID);
    expect(owing.ok).toBe(true);
    if (!owing.ok) return;
    expect(owing.value.classification).toBe("receivable");

    const settled = await recordCustomerPayment(harness.ctx, paymentInput("settle", vnd(600_000)));
    expect(settled.ok).toBe(true);

    const zero = await getCustomerAccountBalance(harness.ctx, WORKSPACE_ID, CUSTOMER_ID);
    expect(zero.ok).toBe(true);
    if (!zero.ok) return;
    // Exactly zero is `settled` — a customer with a full history who owes nothing,
    // not an absence of data.
    expect(zero.value.balance.amountMinor).toBe(0);
    expect(zero.value.classification).toBe("settled");

    const ahead = await recordCustomerPayment(harness.ctx, paymentInput("ahead", vnd(400_000)));
    expect(ahead.ok).toBe(true);

    const credit = await getCustomerAccountBalance(harness.ctx, WORKSPACE_ID, CUSTOMER_ID);
    expect(credit.ok).toBe(true);
    if (!credit.ok) return;

    // Overpayment is accepted (BR-ACCOUNT-007) and the server names what the sign
    // means, so a client cannot render a credit as a debt and send a worker to
    // collect from somebody the depot owes.
    expect(credit.value.balance.amountMinor).toBe(-400_000);
    expect(credit.value.classification).toBe("customer_credit");
  });
});

describe("BR-ACCOUNT-006 / TC-ACCOUNT-011 — reconciliation and safe repair", () => {
  const rebuildInput = {
    commandId: "00000000-0000-4000-8000-000000000901",
    idempotencyKey: "rebuild-account-projection-0001",
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: LATER_TRANSACTION_TIME,
    payload: {
      customerId: CUSTOMER_ID,
      reason: "Đối soát phát hiện bảng tổng hợp bị lệch",
    },
  };

  it("classifies a matching projection and ledger as consistent", async () => {
    await runCasebookLedger();

    const result = await getAccountReconciliation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("consistent");
    if (result.value.kind !== "consistent") return;
    expect(result.value.ledger.balance.amountMinor).toBe(375_000);
    expect(result.value.projection?.balance.amountMinor).toBe(375_000);
    expect(result.value.difference.amountMinor).toBe(0);
    expect(result.value.ledger.entryCount).toBe(2);
  });

  it("detects projection drift, repairs it once, and replays without another ledger effect", async () => {
    await runCasebookLedger();
    harness.db.overwriteBalance({
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      balance: vnd(999_999),
      entryCount: 99,
      lastEntryTransactionTime: null,
      updatedAt: TRANSACTION_TIME,
    });
    const ledgerBefore = structuredClone(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID));

    const drift = await getAccountReconciliation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(drift.ok).toBe(true);
    if (!drift.ok || drift.value.kind !== "inconsistent") return;
    expect(drift.value.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "projection_balance_mismatch",
        "projection_entry_count_mismatch",
        "projection_last_transaction_mismatch",
      ]),
    );

    const first = await rebuildAccountProjection(harness.ctx, rebuildInput);
    const replay = await rebuildAccountProjection(harness.ctx, rebuildInput);

    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);
    if (!first.ok) return;
    expect(first.value.after.balance.amountMinor).toBe(375_000);
    expect(first.value.reconciliation.kind).toBe("consistent");
    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toEqual(ledgerBefore);
    expect(
      harness.db.auditRecords().filter((record) => record.action === "account.projection_rebuilt"),
    ).toHaveLength(1);
  });

  it("refuses repair when a ledger source is missing", async () => {
    await runCasebookLedger();
    harness.db.removeSale(WORKSPACE_ID, SALE_ID);

    const reconciliation = await getAccountReconciliation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(reconciliation.ok).toBe(true);
    if (!reconciliation.ok || reconciliation.value.kind !== "integrity_failure") return;
    expect(reconciliation.value.diagnostics.some((item) => item.code === "source_missing")).toBe(
      true,
    );

    const rebuild = await rebuildAccountProjection(harness.ctx, rebuildInput);
    expect(rebuild.ok).toBe(false);
    if (rebuild.ok) return;
    expect(rebuild.error.code).toBe("ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE");
  });

  it("returns explicit not-found and integrity-failure outcomes", async () => {
    const missing = await getAccountReconciliation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: customerIdSchema.parse("00000000-0000-4000-8000-000000009999"),
    });
    expect(missing.ok).toBe(true);
    if (!missing.ok) return;
    expect(missing.value.kind).toBe("not_found");

    harness.db.seedAccountEntry({
      id: customerAccountEntryIdSchema.parse("00000000-0000-4000-8000-000000009901"),
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      amount: vnd(0),
      sourceType: "manual_adjustment",
      sourceId: "00000000-0000-4000-8000-000000009902",
      reversalOfEntryId: null,
      reasonCode: "other",
      reason: "Corrupt zero row",
      transactionTime: TRANSACTION_TIME,
      recordedAt: TRANSACTION_TIME,
      actorId: ACTOR_ID,
      commandId: commandIdSchema.parse("00000000-0000-4000-8000-000000009903"),
    });
    const corrupt = await getAccountReconciliation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(corrupt.ok).toBe(true);
    if (!corrupt.ok) return;
    expect(corrupt.value.kind).toBe("integrity_failure");
  });

  it("lets sales read reconciliation but refuses a projection rebuild", async () => {
    await runCasebookLedger();
    const sales = harness.contextFor(SALES_ACTOR_ID);

    const read = await getAccountReconciliation(sales, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(read.ok).toBe(true);

    const rebuild = await rebuildAccountProjection(sales, {
      ...rebuildInput,
      actorId: SALES_ACTOR_ID,
    });
    expect(rebuild.ok).toBe(false);
    if (rebuild.ok) return;
    expect(rebuild.error.code).toBe("PERMISSION_DENIED");
  });
});
