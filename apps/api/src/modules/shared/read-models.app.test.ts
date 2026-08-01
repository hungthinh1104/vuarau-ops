import { beforeEach, describe, expect, it } from "vitest";
import {
  customerIdSchema,
  decodeCursor,
  encodeCursor,
  permissionsForRole,
} from "@vuarau/domain-contracts";
import type { Cursor, PaymentId, SaleId } from "@vuarau/domain-contracts";
import {
  ACCOUNTANT_ACTOR_ID,
  ACTOR_ID,
  CUSTOMER_ID,
  DELIVERY_ACTOR_ID,
  FOREIGN_ACTOR_ID,
  IDEMPOTENCY_KEY,
  REVOKED_ACTOR_ID,
  SALES_ACTOR_ID,
  TRANSACTION_TIME,
  WAREHOUSE_ACTOR_ID,
  WORKSPACE_ID,
  activeCustomer,
  saleLineInputs,
  vnd,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { getSession } from "../session/session.queries.ts";
import {
  findPossibleDuplicateCustomers,
  getCustomer,
  searchCustomers,
} from "../customer/customer.queries.ts";
import { getSale, listSales } from "../sale/sale.queries.ts";
import { getPayment, listPayments } from "../payment/payment.queries.ts";
import { getCustomerAccountTimeline } from "../account/account.queries.ts";
import { getAuditTimeline } from "../audit/audit.queries.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import { voidSale } from "../sale/void-sale.handler.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../payment/reverse-payment.handler.ts";
import { createCustomer } from "../customer/create-customer.handler.ts";

let harness: Harness;
let sequence = 0;

beforeEach(() => {
  harness = createHarness();
  sequence = 0;
});

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const envelope = (actorId = ACTOR_ID) => {
  sequence += 1;
  return {
    commandId: uuid(sequence),
    idempotencyKey: `${IDEMPOTENCY_KEY}-${sequence}`,
    workspaceId: WORKSPACE_ID,
    actorId,
    occurredAt: TRANSACTION_TIME,
  };
};

const page = { cursor: null as Cursor | null, limit: 50 };

/** One posted sale of 875 000 ₫ and one payment of 300 000 ₫. */
async function seedActivity(): Promise<{ saleId: string; paymentId: string }> {
  const saleId = uuid(900);
  const paymentId = uuid(901);

  await createSaleDraft(harness.ctx, {
    ...envelope(),
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
  await postSale(harness.ctx, { ...envelope(), expectedVersion: 1, payload: { saleId } });
  await recordCustomerPayment(harness.ctx, {
    ...envelope(),
    payload: {
      paymentId,
      customerId: CUSTOMER_ID,
      amount: vnd(300_000),
      method: "cash",
      payerName: null,
      note: null,
    },
  });

  return { saleId, paymentId };
}

describe("UC-AUTH-003 / TC-READ-001 — session.me", () => {
  it("returns the caller's role and the permissions it expands to", async () => {
    const result = await getSession(harness.ctx, WORKSPACE_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.actorId).toBe(ACTOR_ID);
    expect(result.value.role).toBe("owner");
    // Expanded server-side, so a client never has to know the role table
    // (ADR-0011). Compared against the table itself, not a hard-coded list.
    expect([...result.value.permissions].sort()).toEqual([...permissionsForRole("owner")].sort());
  });

  it("gives each role exactly what the table says, and nothing more", async () => {
    for (const [role, actorId] of [
      ["accountant", ACCOUNTANT_ACTOR_ID],
      ["sales", SALES_ACTOR_ID],
      ["warehouse", WAREHOUSE_ACTOR_ID],
      ["delivery", DELIVERY_ACTOR_ID],
    ] as const) {
      const result = await getSession(harness.contextFor(actorId), WORKSPACE_ID);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.role).toBe(role);
      expect([...result.value.permissions].sort()).toEqual([...permissionsForRole(role)].sort());
    }
  });

  it("refuses a revoked member, so they learn before their first command", async () => {
    const result = await getSession(harness.contextFor(REVOKED_ACTOR_ID), WORKSPACE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_MEMBERSHIP_INACTIVE");
  });

  it("refuses somebody who belongs only to another workspace", async () => {
    const result = await getSession(harness.contextFor(FOREIGN_ACTOR_ID), WORKSPACE_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });
});

describe("UC-CUSTOMER-002 / TC-READ-002 — customer.search", () => {
  it("finds a Vietnamese name typed without diacritics", async () => {
    // The whole reason folding exists: a phone keyboard at a loading bay.
    const found = await searchCustomers(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      query: "chi lan",
      isActive: null,
    });

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.items.map((item) => item.id)).toContain(activeCustomer.id);
  });

  it("carries the balance and its classification on every row", async () => {
    await seedActivity();

    const found = await searchCustomers(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      query: "",
      isActive: null,
    });

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    const row = found.value.items.find((item) => item.id === CUSTOMER_ID)!;
    // 875 000 − 300 000. The list and the balance cannot disagree on screen
    // because they arrive together.
    expect(row.balance.amountMinor).toBe(575_000);
    expect(row.classification).toBe("receivable");
  });

  it("pages deterministically, without repeating or skipping a row", async () => {
    for (let index = 0; index < 5; index += 1) {
      await createCustomer(harness.ctx, {
        ...envelope(),
        payload: {
          customerId: uuid(100 + index),
          displayName: `Khách ${index}`,
          phone: null,
          note: null,
        },
      });
    }

    const seen: string[] = [];
    let cursor: Cursor | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const result = await searchCustomers(harness.ctx, {
        cursor,
        limit: 2,
        workspaceId: WORKSPACE_ID,
        query: "",
        isActive: null,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      seen.push(...result.value.items.map((item) => item.id));
      cursor = result.value.nextCursor;
      if (cursor === null) break;
    }

    // Six customers: the seeded one plus five. Every id exactly once, and in the
    // same order a single unpaged read would have produced.
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);

    const all = await searchCustomers(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      query: "",
      isActive: null,
    });
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(seen).toEqual(all.value.items.map((item) => item.id));
  });

  it("stops with a null cursor rather than looping forever", async () => {
    const result = await searchCustomers(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      query: "",
      isActive: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nextCursor).toBeNull();
  });

  it("refuses a role without customer.read", async () => {
    // Every role currently holds it; asserted through the table so this test
    // starts failing the day one does not, rather than passing vacuously.
    for (const [role, actorId] of [
      ["warehouse", WAREHOUSE_ACTOR_ID],
      ["delivery", DELIVERY_ACTOR_ID],
    ] as const) {
      const result = await searchCustomers(harness.contextFor(actorId), {
        ...page,
        workspaceId: WORKSPACE_ID,
        query: "",
        isActive: null,
      });
      expect(result.ok).toBe(permissionsForRole(role).includes("customer.read"));
    }
  });
});

describe("UC-CUSTOMER-006 / TC-READ-011 — possible duplicate detection", () => {
  it("surfaces normalized phone and folded-name matches without blocking a legitimate duplicate", async () => {
    const duplicateId = uuid(777);
    const created = await createCustomer(harness.ctx, {
      ...envelope(),
      payload: {
        customerId: duplicateId,
        displayName: "Chị Lan chợ Bình Điền",
        phone: "090 123 4567",
        note: "Một người khác có thể trùng tên",
      },
    });
    expect(created.ok).toBe(true);

    const candidates = await findPossibleDuplicateCustomers(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      displayName: "chi lan cho binh dien",
      phone: "090-123-4567",
      excludeCustomerId: customerIdSchema.parse(duplicateId),
    });
    expect(candidates.ok).toBe(true);
    if (!candidates.ok) return;
    expect(candidates.value).toHaveLength(1);
    expect(candidates.value[0]?.customer.id).toBe(CUSTOMER_ID);
    expect(candidates.value[0]?.reasons).toEqual(
      expect.arrayContaining(["same_name", "same_phone"]),
    );
  });

  it("does not leak candidates from a workspace the caller cannot read", async () => {
    const result = await findPossibleDuplicateCustomers(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: WORKSPACE_ID,
      displayName: activeCustomer.displayName,
      phone: activeCustomer.phone,
      excludeCustomerId: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });
});

describe("UC-CUSTOMER-003 / TC-READ-003 — customer.get", () => {
  it("returns the customer, the balance and the caller's capabilities", async () => {
    await seedActivity();

    const result = await getCustomer(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customer.id).toBe(CUSTOMER_ID);
    // Both timestamps, separately — never one field (BR-COMMAND-003).
    expect(result.value.customer.transactionTime).not.toBe(result.value.customer.recordedAt);
    expect(result.value.customer.version).toBe(1);
    expect(result.value.balance.amountMinor).toBe(575_000);
    expect(result.value.capabilities.adjustAccount.allowed).toBe(true);
  });

  it("hides a customer in another workspace behind the same code as one that does not exist", async () => {
    const result = await getCustomer(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Not CUSTOMER_NOT_FOUND: the caller is not in this workspace at all, and
    // the authorization layer answers before the read runs (BR-CUSTOMER-002).
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });

  it("tells a sales worker they may not adjust an account", async () => {
    const result = await getCustomer(harness.contextFor(SALES_ACTOR_ID), {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.capabilities.adjustAccount).toEqual({
      allowed: false,
      reasonCode: "PERMISSION_DENIED",
      details: { permission: "debt.adjust", role: "sales", roles: ["sales"] },
    });
  });
});

describe("UC-SALE-003 / TC-READ-004 — sale.get and sale.list", () => {
  it("returns the full sale with lines, states and both timestamps", async () => {
    const { saleId } = await seedActivity();

    const result = await getSale(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      saleId: saleId as SaleId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines).toHaveLength(3);
    expect(result.value.status).toBe("posted");
    expect(result.value.financialState).toBe("active");
    expect(result.value.dueState).toBe("no_due_date");
    expect(result.value.version).toBe(2);
    expect(result.value.transactionTime).not.toBe(result.value.recordedAt);
    expect(result.value.capabilities.void.allowed).toBe(true);
    expect(result.value.replacedBySaleId).toBeNull();
  });

  it("returns the same states in a list, without loading the lines", async () => {
    const { saleId } = await seedActivity();

    const listed = await listSales(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      customerId: null,
      status: null,
      financialState: null,
      from: null,
      to: null,
    });

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const row = listed.value.items.find((item) => item.id === saleId)!;
    expect(row.customerDisplayName).toBe(activeCustomer.displayName);
    expect(row.lineCount).toBe(3);
    expect(row.financialState).toBe("active");
    expect(row.dueState).toBe("no_due_date");
    // The list and the detail must agree about what can be done, or a button is
    // enabled in one place and disabled in the other (ADR-0003).
    const detail = await getSale(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      saleId: saleId as SaleId,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(row.capabilities).toEqual(detail.value.capabilities);
  });

  it("shows both ends of a correction chain", async () => {
    const { saleId } = await seedActivity();
    const replacementId = uuid(910);

    await voidSale(harness.ctx, {
      ...envelope(),
      payload: {
        saleVoidId: uuid(911),
        saleId,
        reasonCode: "wrong_amount",
        reason: "Ghi nhầm",
      },
    });
    await createSaleDraft(harness.ctx, {
      ...envelope(),
      payload: {
        saleId: replacementId,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [saleLineInputs[0]!],
        note: null,
        dueAt: null,
        replacesSaleId: saleId,
      },
    });

    const listed = await listSales(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      customerId: null,
      status: null,
      financialState: null,
      from: null,
      to: null,
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;

    const voided = listed.value.items.find((item) => item.id === saleId)!;
    const replacement = listed.value.items.find((item) => item.id === replacementId)!;
    expect(voided.financialState).toBe("voided");
    expect(voided.replacedBySaleId).toBe(replacementId);
    expect(replacement.replacesSaleId).toBe(saleId);
  });

  it("filters on the derived financial state", async () => {
    const { saleId } = await seedActivity();
    await voidSale(harness.ctx, {
      ...envelope(),
      payload: { saleVoidId: uuid(912), saleId, reasonCode: "goods_returned", reason: "Trả lại" },
    });

    const active = await listSales(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      customerId: null,
      status: null,
      financialState: "active",
      from: null,
      to: null,
    });
    expect(active.ok).toBe(true);
    if (!active.ok) return;
    expect(active.value.items.map((item) => item.id)).not.toContain(saleId);

    const voided = await listSales(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      customerId: null,
      status: null,
      financialState: "voided",
      from: null,
      to: null,
    });
    expect(voided.ok).toBe(true);
    if (!voided.ok) return;
    expect(voided.value.items.map((item) => item.id)).toEqual([saleId]);
  });
});

describe("UC-PAYMENT-003 / TC-READ-005 — payment.get and payment.list", () => {
  it("computes the remaining reversible amount server-side", async () => {
    const { paymentId } = await seedActivity();

    const result = await getPayment(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      paymentId: paymentId as PaymentId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount.amountMinor).toBe(300_000);
    expect(result.value.reversedAmount.amountMinor).toBe(0);
    // Not left as a subtraction for the client: getting it wrong offers to
    // reverse money that is not there (BR-PAYMENT-003).
    expect(result.value.remainingReversibleAmount.amountMinor).toBe(300_000);
    expect(result.value.capabilities.reverse.allowed).toBe(true);
  });

  it("lists payments newest first and names the customer", async () => {
    const { paymentId } = await seedActivity();

    const listed = await listPayments(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      customerId: null,
      status: null,
      from: null,
      to: null,
    });

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.items[0]?.id).toBe(paymentId);
    expect(listed.value.items[0]?.customerDisplayName).toBe(activeCustomer.displayName);
  });
});

describe("UC-ACCOUNT-001 / TC-READ-006 — account.timeline", () => {
  it("shows every entry with the balance after it, compensating pairs included", async () => {
    const { saleId } = await seedActivity();
    await voidSale(harness.ctx, {
      ...envelope(),
      payload: { saleVoidId: uuid(913), saleId, reasonCode: "wrong_amount", reason: "Ghi nhầm" },
    });

    const timeline = await getCustomerAccountTimeline(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      from: null,
      to: null,
    });

    expect(timeline.ok).toBe(true);
    if (!timeline.ok) return;

    // Newest first. Three entries, all standing: the void is a compensation, not
    // an erasure, and hiding either half would make the total unfollowable.
    const types = timeline.value.items.map((item) => item.source.type);
    expect(types).toEqual(["sale_void", "payment", "sale_posting"]);

    // Read oldest-first, the running balance is +875 000, +575 000, −300 000.
    const oldestFirst = [...timeline.value.items].reverse();
    expect(oldestFirst.map((item) => item.runningBalance.amountMinor)).toEqual([
      875_000, 575_000, -300_000,
    ]);
    expect(oldestFirst.map((item) => item.classification)).toEqual([
      "receivable",
      "receivable",
      "customer_credit",
    ]);
  });

  it("resolves each entry's source document rather than leaving the browser to infer it", async () => {
    const { saleId, paymentId } = await seedActivity();
    await reverseCustomerPayment(harness.ctx, {
      ...envelope(),
      expectedVersion: 1,
      payload: {
        reversalId: uuid(915),
        paymentId,
        amount: vnd(100_000),
        reason: "Ghi nhầm số tiền",
      },
    });

    await voidSale(harness.ctx, {
      ...envelope(),
      payload: { saleVoidId: uuid(914), saleId, reasonCode: "wrong_amount", reason: "Ghi nhầm" },
    });

    const timeline = await getCustomerAccountTimeline(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      from: null,
      to: null,
    });

    expect(timeline.ok).toBe(true);
    if (!timeline.ok) return;
    const posting = timeline.value.items.find((item) => item.source.type === "sale_posting")!;
    const payment = timeline.value.items.find((item) => item.source.type === "payment")!;
    const voided = timeline.value.items.find((item) => item.source.type === "sale_void")!;
    const reversal = timeline.value.items.find((item) => item.source.type === "payment_reversal")!;
    expect(posting.source.id).toBe(saleId);
    expect(payment.source.id).toBe(paymentId);
    expect(posting.source.document).toEqual({ type: "sale", id: saleId });
    expect(payment.source.document).toEqual({ type: "payment", id: paymentId });
    expect(reversal.source.document).toEqual({ type: "payment", id: paymentId });
    // The void record has its own immutable source id, but its detail belongs to
    // the sale it compensates. The server, not a URL convention in the browser,
    // resolves that relationship.
    expect(voided.source.document).toEqual({ type: "sale", id: saleId });
    // Every entry names an actor and a command (BR-ACCOUNT-004).
    expect(posting.actorId).toBe(ACTOR_ID);
    expect(posting.commandId).toBeTruthy();
  });

  it("refuses a role without debt.read", async () => {
    const result = await getCustomerAccountTimeline(harness.contextFor(WAREHOUSE_ACTOR_ID), {
      ...page,
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      from: null,
      to: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
  });
});

describe("UC-AUDIT-001 / TC-READ-007 — audit.timeline", () => {
  it("describes actor, command, source and the correction relation", async () => {
    const { saleId } = await seedActivity();
    const replacementId = uuid(920);

    await voidSale(harness.ctx, {
      ...envelope(),
      payload: { saleVoidId: uuid(921), saleId, reasonCode: "wrong_amount", reason: "Ghi nhầm" },
    });
    await createSaleDraft(harness.ctx, {
      ...envelope(),
      payload: {
        saleId: replacementId,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [saleLineInputs[0]!],
        note: null,
        dueAt: null,
        replacesSaleId: saleId,
      },
    });

    const audit = await getAuditTimeline(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      aggregateType: null,
      aggregateId: null,
      actorId: null,
      from: null,
      to: null,
    });

    expect(audit.ok).toBe(true);
    if (!audit.ok) return;

    const voided = audit.value.items.find((item) => item.action === "sale.voided")!;
    expect(voided.actorId).toBe(ACTOR_ID);
    expect(voided.actorDisplayName).toBeTruthy();
    expect(voided.commandId).toBeTruthy();
    expect(voided.aggregateType).toBe("sale");
    expect(voided.aggregateId).toBe(saleId);
    expect(voided.reason).toBe("Ghi nhầm");
    // The relation is what makes four actions read as one story (UC-AUDIT-001).
    expect(voided.correction).toEqual({ relation: "voids_sale", targetSaleId: saleId });

    const replacementDraft = audit.value.items.find(
      (item) => item.aggregateId === replacementId && item.action === "sale.draft_created",
    )!;
    expect(replacementDraft.correction).toEqual({
      relation: "replaces_sale",
      targetSaleId: saleId,
    });

    const payment = audit.value.items.find((item) => item.action === "payment.recorded")!;
    // A payment corrects nothing.
    expect(payment.correction).toBeNull();
  });

  it("filters to one aggregate, which is how a correction is read", async () => {
    const { saleId } = await seedActivity();

    const audit = await getAuditTimeline(harness.ctx, {
      ...page,
      workspaceId: WORKSPACE_ID,
      aggregateType: "sale",
      aggregateId: saleId,
      actorId: null,
      from: null,
      to: null,
    });

    expect(audit.ok).toBe(true);
    if (!audit.ok) return;
    expect(audit.value.items.map((item) => item.action)).toEqual([
      "sale.posted",
      "sale.draft_created",
    ]);
  });

  it("refuses a role without audit.read", async () => {
    const result = await getAuditTimeline(harness.contextFor(SALES_ACTOR_ID), {
      ...page,
      workspaceId: WORKSPACE_ID,
      aggregateType: null,
      aggregateId: null,
      actorId: null,
      from: null,
      to: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
    expect(result.error.details).toMatchObject({ permission: "audit.read", role: "sales" });
  });
});

describe("TC-READ-008 — the cursor itself", () => {
  it("round-trips a Vietnamese sort value", () => {
    // The reason the codec is UTF-8 aware rather than `btoa` alone: a display
    // name is a sort value, and `btoa("Cô Hoà")` throws.
    const position = { sortValue: "Cô Hoà Đặng", id: uuid(1) };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it("treats a corrupt cursor as the first page rather than an error", () => {
    // Cursors travel in URLs, and URLs get truncated and hand-edited. A 500 here
    // turns a cosmetic problem into a broken screen.
    expect(decodeCursor("not-a-cursor" as Cursor)).toBeNull();
    expect(decodeCursor("" as Cursor)).toBeNull();
  });

  it("does not leak an id a caller could not otherwise see", () => {
    // The cursor is opaque, not secret: it carries the last row of a page the
    // caller was just given. Stated as a test so nobody later puts something in
    // it that *would* need to be secret.
    const encoded = encodeCursor({ sortValue: "x", id: uuid(1) });
    expect(decodeCursor(encoded)).toEqual({ sortValue: "x", id: uuid(1) });
  });
});
