import { beforeEach, describe, expect, it } from "vitest";
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
  SECOND_COMMAND_ID,
  THIRD_COMMAND_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  saleLineInputs,
  vnd,
} from "@vuarau/test-fixtures";
import { createHarness, ledgerBalance, type Harness } from "../../testing/command-test-harness.ts";
import { adjustCustomerDebt } from "./adjust-debt.handler.ts";
import { getCustomerAccountBalance, rebuildAccountBalance } from "./account.queries.ts";
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
    idempotencyKey: "casebook-sale-confirm-key",
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
