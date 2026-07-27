import { beforeEach, describe, expect, it } from "vitest";
import { roleHasPermission } from "@vuarau/domain-contracts";
import {
  ACCOUNTANT_ACTOR_ID,
  ACTOR_ID,
  DELIVERY_ACTOR_ID,
  CUSTOMER_ID,
  CUSTOMER_ZERO_DEBT_ID,
  IDEMPOTENCY_KEY,
  LATEST_TRANSACTION_TIME,
  PAYMENT_ID,
  REPLACEMENT_SALE_ID,
  SALE_ID,
  SALE_TOTAL,
  SALE_VOID_ID,
  SALES_ACTOR_ID,
  SECOND_SALE_VOID_ID,
  WAREHOUSE_ACTOR_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  saleLineInputs,
  validDraftSale,
  vnd,
} from "@vuarau/test-fixtures";
import { customerWithZeroDebt } from "@vuarau/test-fixtures";
import { createHarness, ledgerBalance, type Harness } from "../../testing/command-test-harness.ts";
import { createSaleDraft } from "./create-sale-draft.handler.ts";
import { postSale } from "./post-sale.handler.ts";
import { voidSale } from "./void-sale.handler.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import { getCustomerAccountBalance } from "../account/account.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
  commandSequence = 0;
  commandIds.clear();
});

/**
 * A distinct command id and idempotency key per step, derived from a label so a
 * failure names the step that produced it. Two commands must never share a
 * command id under different keys — that is `DUPLICATE_COMMAND` (BR-COMMAND-001),
 * a client bug this suite is not about.
 */
let commandSequence = 0;
const commandIds = new Map<string, string>();
const commandIdFor = (key: string): string => {
  const existing = commandIds.get(key);
  if (existing !== undefined) return existing;
  commandSequence += 1;
  const id = `00000000-0000-4000-8000-${String(commandSequence).padStart(12, "0")}`;
  commandIds.set(key, id);
  return id;
};

const envelope = (key: string, actorId = ACTOR_ID) => ({
  commandId: commandIdFor(key),
  idempotencyKey: `${IDEMPOTENCY_KEY}-${key}`,
  workspaceId: WORKSPACE_ID,
  actorId,
  occurredAt: TRANSACTION_TIME,
});

/** A posted sale of 875 000 ₫ — the casebook's numbers (CASE-SALE-001). */
async function postASale(saleId = SALE_ID): Promise<void> {
  await createSaleDraft(harness.ctx, {
    ...envelope(`draft-${saleId.slice(-4)}`),
    payload: {
      saleId,
      customerId: CUSTOMER_ID,
      currency: "VND",
      lines: [...saleLineInputs],
      note: null,
      dueAt: null,
      replacesSaleId: null,
    },
  });
  const posted = await postSale(harness.ctx, {
    ...envelope(`post-${saleId.slice(-4)}`),
    expectedVersion: 1,
    payload: { saleId },
  });
  if (!posted.ok) {
    throw new Error(`fixture setup failed: ${posted.error.code}`);
  }
}

const voidInput = (key: string, overrides: Record<string, unknown> = {}, actorId = ACTOR_ID) => ({
  ...envelope(key, actorId),
  payload: {
    saleVoidId: SALE_VOID_ID,
    saleId: SALE_ID,
    reasonCode: "wrong_amount",
    reason: "Ghi nhầm 2 thùng ớt, thực tế 1 thùng",
    ...overrides,
  },
});

describe("BR-SALE-012 / TC-SALE-021", () => {
  it("offsets the posting exactly, leaving the customer owing nothing", async () => {
    await postASale();
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(SALE_TOTAL.amountMinor);

    const result = await voidSale(harness.ctx, voidInput("void"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(0);

    // Two entries, both standing. The void is a compensation, not an erasure —
    // the timeline must still explain how the balance got to zero (BR-ACCOUNT-005).
    const entries = harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID);
    expect(entries.map((entry) => entry.sourceType)).toEqual(["sale_posting", "sale_void"]);
    expect(entries.map((entry) => entry.amount.amountMinor)).toEqual([
      SALE_TOTAL.amountMinor,
      -SALE_TOTAL.amountMinor,
    ]);
  });

  it("does not touch the original sale or its posting entry", async () => {
    await postASale();
    const before = harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)[0]!;

    const result = await voidSale(harness.ctx, voidInput("void"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)[0]).toEqual(before);
    expect(result.value.status).toBe("posted");
    expect(result.value.version).toBe(2);
    expect(result.value.totalAmount).toEqual(SALE_TOTAL);
  });

  it("reports the sale as voided through its derived financial state", async () => {
    await postASale();
    const result = await voidSale(harness.ctx, voidInput("void"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.financialState).toBe("voided");
    expect(result.value.voidRecord).toMatchObject({
      id: SALE_VOID_ID,
      reasonCode: "wrong_amount",
      reason: "Ghi nhầm 2 thùng ớt, thực tế 1 thùng",
    });
    expect(result.value.capabilities.void).toMatchObject({ reasonCode: "SALE_ALREADY_VOIDED" });
  });

  it("writes exactly one audit record naming the void", async () => {
    await postASale();
    await voidSale(harness.ctx, voidInput("void"));

    const actions = harness.db.auditRecords().map((record) => record.action);
    expect(actions).toEqual(["sale.draft_created", "sale.posted", "sale.voided"]);
    const voided = harness.db.auditRecords().at(-1)!;
    expect(voided.reason).toBe("Ghi nhầm 2 thùng ớt, thực tế 1 thùng");
    expect(voided.after).toMatchObject({ financialState: "voided" });
  });
});

describe("BR-SALE-013 / TC-SALE-023", () => {
  it("returns the original result to a retry, and moves no money twice", async () => {
    await postASale();
    const first = await voidSale(harness.ctx, voidInput("void"));
    const retry = await voidSale(harness.ctx, voidInput("void"));

    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.value).toEqual(first.value);

    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(2);
    expect(harness.db.saleVoids()).toHaveLength(1);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(0);
  });

  it("refuses a genuine second void — a different command, not a retry", async () => {
    await postASale();
    await voidSale(harness.ctx, voidInput("void"));

    // Different idempotency key *and* a different void id: nothing about this
    // looks like a replay, so the domain check is what has to catch it.
    const second = await voidSale(
      harness.ctx,
      voidInput("void-again", { saleVoidId: SECOND_SALE_VOID_ID }),
    );

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("SALE_ALREADY_VOIDED");
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(0);
    expect(harness.db.saleVoids()).toHaveLength(1);
  });
});

/**
 * TC-SALE-024 — two genuinely concurrent voids — lives in the db test project
 * (`full-slice.db.test.ts`), not here.
 *
 * This adapter models a transaction by snapshotting the store and restoring it on
 * failure, which is enough to prove that a *refused* command leaves nothing
 * behind, and not enough to prove anything about isolation: two overlapping
 * snapshot-and-restore transactions can wipe each other's writes, which no
 * database does. A race proven here would prove nothing about Postgres.
 */

describe("BR-SALE-015 / TC-SALE-025", () => {
  it("refuses to void a draft and leaves it a draft", async () => {
    await createSaleDraft(harness.ctx, {
      ...envelope("draft-only"),
      payload: {
        saleId: SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: null,
      },
    });

    const result = await voidSale(harness.ctx, voidInput("void-draft"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SALE_NOT_POSTED");
    expect(harness.db.saleVoids()).toHaveLength(0);
    expect(harness.db.accountEntries()).toHaveLength(0);
  });

  it("refuses a sale that is not in this workspace at all", async () => {
    const result = await voidSale(harness.ctx, voidInput("void-missing"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SALE_NOT_FOUND");
  });
});

describe("BR-SALE-014 / TC-SALE-026", () => {
  it("refuses a void with a blank explanation, and writes nothing", async () => {
    await postASale();

    const result = await voidSale(harness.ctx, voidInput("void-blank", { reason: "   " }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SALE_VOID_REASON_REQUIRED");
    expect(harness.db.saleVoids()).toHaveLength(0);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(SALE_TOTAL.amountMinor);
  });
});

describe("BR-AUTH-004 / TC-SALE-017", () => {
  it("refuses a void by a sales worker — creating and erasing must not be one hand", async () => {
    await postASale();

    const result = await voidSale(
      harness.contextFor(SALES_ACTOR_ID),
      voidInput("void-sales", {}, SALES_ACTOR_ID),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
    expect(result.error.details).toMatchObject({ permission: "sale.void", role: "sales" });
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(SALE_TOTAL.amountMinor);
  });

  it("lets an accountant void, and lets a sales worker post", async () => {
    // The two permissions differ on purpose, and this pins both directions: a
    // capability that disagreed with the guard would be caught here.
    await createSaleDraft(harness.contextFor(SALES_ACTOR_ID), {
      ...envelope("sales-draft", SALES_ACTOR_ID),
      payload: {
        saleId: SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: null,
      },
    });
    const posted = await postSale(harness.contextFor(SALES_ACTOR_ID), {
      ...envelope("sales-post", SALES_ACTOR_ID),
      expectedVersion: 1,
      payload: { saleId: SALE_ID },
    });
    expect(posted.ok).toBe(true);

    const voided = await voidSale(
      harness.contextFor(ACCOUNTANT_ACTOR_ID),
      voidInput("acct-void", {}, ACCOUNTANT_ACTOR_ID),
    );
    expect(voided.ok).toBe(true);
  });
});

describe("BR-SALE-016 / TC-SALE-027", () => {
  it("links a replacement sale to the one it replaces, and nets to the right total", async () => {
    await postASale();
    await voidSale(harness.ctx, voidInput("void"));

    // The correct sale: one thùng of ớt, not two — 625 000 ₫ (CASE-SALE-007).
    const replacement = await createSaleDraft(harness.ctx, {
      ...envelope("replacement"),
      payload: {
        saleId: REPLACEMENT_SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [
          saleLineInputs[0]!,
          saleLineInputs[1]!,
          { ...saleLineInputs[2]!, quantity: { valueScaled: 1_000, unit: "thung" as const } },
        ],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });

    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;
    expect(replacement.value.replacesSaleId).toBe(SALE_ID);

    const posted = await postSale(harness.ctx, {
      ...envelope("post-replacement"),
      expectedVersion: 1,
      payload: { saleId: REPLACEMENT_SALE_ID },
    });
    expect(posted.ok).toBe(true);

    // +875 000, −875 000, +625 000. Three entries, all standing, arithmetic right.
    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(3);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(625_000);
  });

  it("refuses a replacement pointing at a sale that does not exist here", async () => {
    const result = await createSaleDraft(harness.ctx, {
      ...envelope("bad-replacement"),
      payload: {
        saleId: REPLACEMENT_SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SALE_NOT_FOUND");
  });

  it("refuses a crafted replacement for an active sale before it can create a second financial effect", async () => {
    await postASale();

    const result = await createSaleDraft(harness.ctx, {
      ...envelope("active-sale-replacement"),
      payload: {
        saleId: REPLACEMENT_SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });

    expect(result).toMatchObject({ ok: false, error: { code: "SALE_REPLACEMENT_NOT_VOIDED" } });
    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(1);
  });

  it("requires the same void-authorized actor who performed the correction workflow", async () => {
    await postASale();
    const voided = await voidSale(
      harness.contextFor(ACCOUNTANT_ACTOR_ID),
      voidInput("accountant-void", {}, ACCOUNTANT_ACTOR_ID),
    );
    expect(voided.ok).toBe(true);

    const result = await createSaleDraft(harness.ctx, {
      ...envelope("owner-cannot-hijack-accountant-correction"),
      payload: {
        saleId: REPLACEMENT_SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });

    expect(result).toMatchObject({ ok: false, error: { code: "SALE_REPLACEMENT_ACTOR_MISMATCH" } });
  });

  it("lets an accountant replace a voided sale for the correct customer", async () => {
    harness.db.seedCustomer(customerWithZeroDebt);
    await postASale();
    const voided = await voidSale(
      harness.contextFor(ACCOUNTANT_ACTOR_ID),
      voidInput("wrong-customer-void", { reasonCode: "wrong_customer" }, ACCOUNTANT_ACTOR_ID),
    );
    expect(voided.ok).toBe(true);

    const result = await createSaleDraft(harness.contextFor(ACCOUNTANT_ACTOR_ID), {
      ...envelope("accountant-wrong-customer-replacement", ACCOUNTANT_ACTOR_ID),
      payload: {
        saleId: REPLACEMENT_SALE_ID,
        customerId: CUSTOMER_ZERO_DEBT_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });

    expect(result).toMatchObject({ ok: true, value: { customerId: CUSTOMER_ZERO_DEBT_ID } });
    const posted = await postSale(harness.contextFor(ACCOUNTANT_ACTOR_ID), {
      ...envelope("accountant-post-replacement", ACCOUNTANT_ACTOR_ID),
      expectedVersion: 1,
      payload: { saleId: REPLACEMENT_SALE_ID },
    });
    expect(posted.ok).toBe(true);
    expect(ledgerBalance(harness, CUSTOMER_ZERO_DEBT_ID)).toBe(SALE_TOTAL.amountMinor);
  });

  it("refuses a wrong-customer replacement that still names the original customer", async () => {
    await postASale();
    await voidSale(harness.ctx, voidInput("wrong-customer-void", { reasonCode: "wrong_customer" }));

    const result = await createSaleDraft(harness.ctx, {
      ...envelope("wrong-customer-unchanged"),
      payload: {
        saleId: REPLACEMENT_SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SALE_REPLACEMENT_CUSTOMER_UNCHANGED" },
    });
  });

  it("rejects an unsupported replacement currency before it creates a draft", async () => {
    await postASale();
    await voidSale(harness.ctx, voidInput("void"));

    const result = await createSaleDraft(harness.ctx, {
      ...envelope("replacement-currency-mismatch"),
      payload: {
        saleId: REPLACEMENT_SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "USD",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_COMMAND_PAYLOAD" },
    });
  });

  it("refuses a second replacement for the same voided sale", async () => {
    await postASale();
    await voidSale(harness.ctx, voidInput("void"));
    const first = await createSaleDraft(harness.ctx, {
      ...envelope("first-replacement"),
      payload: {
        saleId: REPLACEMENT_SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });
    expect(first.ok).toBe(true);

    const duplicate = await createSaleDraft(harness.ctx, {
      ...envelope("second-replacement"),
      payload: {
        saleId: "00000000-0000-4000-8000-000000000099",
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });

    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: "SALE_REPLACEMENT_ALREADY_EXISTS" },
    });
  });

  it("does not let a sales worker craft a replacement after an accountant void", async () => {
    await postASale();
    await voidSale(
      harness.contextFor(ACCOUNTANT_ACTOR_ID),
      voidInput("accountant-void", {}, ACCOUNTANT_ACTOR_ID),
    );

    const result = await createSaleDraft(harness.contextFor(SALES_ACTOR_ID), {
      ...envelope("sales-crafted-replacement", SALES_ACTOR_ID),
      payload: {
        saleId: REPLACEMENT_SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: SALE_ID,
      },
    });

    expect(result).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  });
});

describe("BR-ACCOUNT-007 / TC-SALE-022", () => {
  it("voids a sale the customer already paid, leaving them in credit", async () => {
    await postASale();

    const paid = await recordCustomerPayment(harness.ctx, {
      ...envelope("payment"),
      occurredAt: LATEST_TRANSACTION_TIME,
      payload: {
        paymentId: PAYMENT_ID,
        customerId: CUSTOMER_ID,
        amount: SALE_TOTAL,
        method: "cash",
        payerName: null,
        note: null,
      },
    });
    expect(paid.ok).toBe(true);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(0);

    const voided = await voidSale(harness.ctx, voidInput("void-paid"));
    expect(voided.ok).toBe(true);

    // The payment is untouched — that money really did arrive. The depot now owes
    // the customer, which is the truth (CASE-SALE-011).
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(-SALE_TOTAL.amountMinor);
    expect(harness.db.payments()).toHaveLength(1);
    expect(harness.db.reversals()).toHaveLength(0);

    const balance = await getCustomerAccountBalance(harness.ctx, WORKSPACE_ID, CUSTOMER_ID);
    expect(balance.ok).toBe(true);
    if (!balance.ok) return;
    expect(balance.value.classification).toBe("customer_credit");
    expect(balance.value.balance).toEqual(vnd(-SALE_TOTAL.amountMinor));
  });
});

describe("BR-SALE-010 / TC-SALE-014", () => {
  it("creates a draft with no account entry, no balance, and no money moved", async () => {
    const result = await createSaleDraft(harness.ctx, {
      ...envelope("draft-only"),
      payload: {
        saleId: SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: null,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("draft");
    expect(result.value.totalAmount).toEqual(SALE_TOTAL);

    // A draft that carried a total of 875 000 ₫ and *also* moved a balance would
    // be the silent failure this rule exists to catch. Asserted on all three
    // stores, because "no entry" alone would miss a balance written directly.
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.balanceFor(WORKSPACE_ID, CUSTOMER_ID)).toBeNull();
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(0);

    // And it has no financial state to have, either (state catalog).
    expect(result.value.financialState).toBeNull();
  });
});

describe("BR-SALE-011 / TC-SALE-015", () => {
  it("freezes the product name and unit price onto the line at posting", async () => {
    await postASale();

    const posted = await postSale(harness.ctx, {
      ...envelope("post-again"),
      expectedVersion: 2,
      payload: { saleId: SALE_ID },
    });
    expect(posted.ok).toBe(false);

    // The snapshot survives a later catalogue edit because it was copied, not
    // referenced — there is nowhere for a price change to reach it (ASM-008).
    const stored = validDraftSale.lines[0]!;
    const result = await voidSale(harness.ctx, voidInput("void"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[0]).toMatchObject({
      productName: stored.productName,
      unitPrice: stored.unitPrice,
      quantity: stored.quantity,
      lineTotal: stored.lineTotal,
    });
  });
});

describe("BR-AUTH-004 / TC-SALE-017 — the guard and the role table agree", () => {
  const ROLE_ACTORS = [
    ["owner", ACTOR_ID],
    ["accountant", ACCOUNTANT_ACTOR_ID],
    ["sales", SALES_ACTOR_ID],
    ["warehouse", WAREHOUSE_ACTOR_ID],
    ["delivery", DELIVERY_ACTOR_ID],
  ] as const;

  it.each(ROLE_ACTORS)(
    "lets %s post a sale exactly when the table says so",
    async (role, actorId) => {
      const draft = await createSaleDraft(harness.ctx, {
        ...envelope(`draft-for-${role}`),
        payload: {
          saleId: SALE_ID,
          customerId: CUSTOMER_ID,
          currency: "VND",
          lines: [...saleLineInputs],
          note: null,
          dueAt: null,
          replacesSaleId: null,
        },
      });
      expect(draft.ok).toBe(true);

      const result = await postSale(harness.contextFor(actorId), {
        ...envelope(`post-for-${role}`, actorId),
        expectedVersion: 1,
        payload: { saleId: SALE_ID },
      });

      // One assertion, both directions: whatever the table says, the command does.
      // A permission added to a role without the command following, or the reverse,
      // fails here (ADR-0003, ADR-0011).
      expect(result.ok).toBe(roleHasPermission(role, "sale.post"));
      if (!result.ok) {
        expect(result.error.code).toBe("PERMISSION_DENIED");
      }
    },
  );

  it.each(ROLE_ACTORS)(
    "lets %s void a sale exactly when the table says so",
    async (role, actorId) => {
      await postASale();

      const result = await voidSale(
        harness.contextFor(actorId),
        voidInput(`void-for-${role}`, {}, actorId),
      );

      expect(result.ok).toBe(roleHasPermission(role, "sale.void"));
      if (!result.ok) {
        expect(result.error.code).toBe("PERMISSION_DENIED");
      }
    },
  );

  it("gives sales the power to create a sale but not to erase one", async () => {
    // The asymmetry is the point (BR-AUTH-004): a single hand that can both
    // record and remove a load leaves nothing missing for a reviewer to notice.
    expect(roleHasPermission("sales", "sale.create")).toBe(true);
    expect(roleHasPermission("sales", "sale.post")).toBe(true);
    expect(roleHasPermission("sales", "sale.void")).toBe(false);

    // And voiding sits with the other way of moving money without a trade.
    for (const role of ["owner", "accountant"] as const) {
      expect(roleHasPermission(role, "sale.void")).toBe(true);
      expect(roleHasPermission(role, "debt.adjust")).toBe(true);
    }
  });
});
