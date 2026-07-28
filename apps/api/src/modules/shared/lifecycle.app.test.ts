import { beforeEach, describe, expect, it } from "vitest";
import { roleHasPermission } from "@vuarau/domain-contracts";
import type { SaleId } from "@vuarau/domain-contracts";
import {
  ACCOUNTANT_ACTOR_ID,
  ACTOR_ID,
  CUSTOMER_ID,
  DELIVERY_ACTOR_ID,
  IDEMPOTENCY_KEY,
  SALES_ACTOR_ID,
  TRANSACTION_TIME,
  WAREHOUSE_ACTOR_ID,
  WORKSPACE_ID,
  saleLineInputs,
  vnd,
} from "@vuarau/test-fixtures";
import { createHarness, ledgerBalance, type Harness } from "../../testing/command-test-harness.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import { discardSaleDraft, updateSaleDraft } from "../sale/edit-sale-draft.handler.ts";
import {
  deactivateCustomer,
  reactivateCustomer,
  updateCustomer,
} from "../customer/update-customer.handler.ts";
import { revokeWorkspaceMembership } from "../session/revoke-membership.handler.ts";
import { adjustCustomerDebt } from "../account/adjust-debt.handler.ts";
import { getCustomer } from "../customer/customer.queries.ts";
import { getCustomerAccountTimeline } from "../account/account.queries.ts";
import { getSession } from "../session/session.queries.ts";

let harness: Harness;
let sequence = 0;

beforeEach(() => {
  harness = createHarness();
  sequence = 0;
});

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SALE = uuid(500) as SaleId;

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

/** A fixed envelope, so a retry is a retry rather than a new command. */
const replayable = (key: string, actorId = ACTOR_ID) => ({
  commandId: uuid(700 + key.length),
  idempotencyKey: `replay-${key}`,
  workspaceId: WORKSPACE_ID,
  actorId,
  occurredAt: TRANSACTION_TIME,
});

async function draft(saleId: SaleId = SALE): Promise<void> {
  const result = await createSaleDraft(harness.ctx, {
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
  if (!result.ok) throw new Error(`setup failed: ${result.error.code}`);
}

// ---------------------------------------------------------------------------
// UC-CUSTOMER-004 — UpdateCustomer
// ---------------------------------------------------------------------------

const updateInput = (overrides: Record<string, unknown> = {}, actorId = ACTOR_ID) => ({
  ...envelope(actorId),
  expectedVersion: 1,
  payload: {
    customerId: CUSTOMER_ID,
    displayName: "Chị Lan chợ Bình Điền (mới)",
    phone: "0909123456",
    note: null,
    ...overrides,
  },
});

describe("BR-CUSTOMER-004 / TC-CUSTOMER-007 — UpdateCustomer", () => {
  it("changes the details, bumps the version, and moves no money", async () => {
    await adjustCustomerDebt(harness.ctx, {
      ...envelope(),
      payload: {
        adjustmentId: uuid(600),
        customerId: CUSTOMER_ID,
        direction: "increase",
        amount: vnd(500_000),
        reasonCode: "opening_balance",
        reason: "Nợ cũ",
      },
    });
    const balanceBefore = ledgerBalance(harness, CUSTOMER_ID);

    const result = await updateCustomer(harness.ctx, updateInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.displayName).toBe("Chị Lan chợ Bình Điền (mới)");
    expect(result.value.phone).toBe("0909123456");
    expect(result.value.version).toBe(2);

    // Renaming somebody must never move what they owe (BR-ACCOUNT-002).
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(balanceBefore);
    expect(harness.db.accountEntries()).toHaveLength(1);
  });

  it("refuses a stale version and changes nothing", async () => {
    await updateCustomer(harness.ctx, updateInput());

    const stale = await updateCustomer(harness.ctx, updateInput({ displayName: "Sai" }));

    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("CUSTOMER_VERSION_CONFLICT");
    expect(stale.error.details).toMatchObject({ expectedVersion: 1, actualVersion: 2 });

    const current = await getCustomer(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value.customer.displayName).toBe("Chị Lan chợ Bình Điền (mới)");
  });

  it("refuses a blank name", async () => {
    const result = await updateCustomer(harness.ctx, updateInput({ displayName: "   " }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CUSTOMER_NAME_REQUIRED");
  });

  it("replays a retry without applying it twice", async () => {
    const input = { ...replayable("update"), expectedVersion: 1, payload: updateInput().payload };

    const first = await updateCustomer(harness.ctx, input);
    const retry = await updateCustomer(harness.ctx, input);

    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    // Version 2, not 3: the second attempt was answered from the receipt, not
    // executed (BR-COMMAND-001).
    expect(retry.value).toEqual(first.value);
    expect(retry.value.version).toBe(2);
  });

  it("refuses a role without customer.update, writing nothing", async () => {
    const result = await updateCustomer(
      harness.contextFor(WAREHOUSE_ACTOR_ID),
      updateInput({}, WAREHOUSE_ACTOR_ID),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
    expect(harness.db.auditRecords()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// UC-CUSTOMER-005 — DeactivateCustomer
// ---------------------------------------------------------------------------

const deactivateInput = (overrides: Record<string, unknown> = {}, actorId = ACTOR_ID) => ({
  ...envelope(actorId),
  expectedVersion: 1,
  payload: { customerId: CUSTOMER_ID, reason: "Ngừng mua", ...overrides },
});

describe("BR-CUSTOMER-003 / TC-CUSTOMER-009 — DeactivateCustomer", () => {
  it("preserves the balance and the timeline", async () => {
    await adjustCustomerDebt(harness.ctx, {
      ...envelope(),
      payload: {
        adjustmentId: uuid(601),
        customerId: CUSTOMER_ID,
        direction: "increase",
        amount: vnd(750_000),
        reasonCode: "opening_balance",
        reason: "Nợ cũ",
      },
    });

    const result = await deactivateCustomer(harness.ctx, deactivateInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isActive).toBe(false);

    // The rule that matters: hiding somebody from new sales must not make their
    // debt disappear, or "tidy up the list" becomes a way to erase money.
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(750_000);

    const balance = await getCustomer(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(balance.ok).toBe(true);
    if (!balance.ok) return;
    expect(balance.value.balance.amountMinor).toBe(750_000);
    expect(balance.value.classification).toBe("receivable");

    const timeline = await getCustomerAccountTimeline(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      from: null,
      to: null,
      cursor: null,
      limit: 50,
    });
    expect(timeline.ok).toBe(true);
    if (!timeline.ok) return;
    expect(timeline.value.items).toHaveLength(1);
  });

  it("leaves a deactivated customer findable, so an old balance can still be chased", async () => {
    await deactivateCustomer(harness.ctx, deactivateInput());

    const found = await getCustomer(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
    });

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.customer.isActive).toBe(false);
    // And the capability now says why the button is off, rather than hiding it.
    expect(found.value.capabilities.deactivate).toMatchObject({
      allowed: false,
      reasonCode: "CUSTOMER_ALREADY_INACTIVE",
    });
  });

  it("refuses a second deactivation", async () => {
    await deactivateCustomer(harness.ctx, deactivateInput());

    const again = await deactivateCustomer(harness.ctx, deactivateInput({}, ACTOR_ID));
    expect(again.ok).toBe(false);
    if (again.ok) return;
    // Version conflict fires first — the row moved — which is the more useful
    // answer: reload and look at what it says now.
    expect(again.error.code).toBe("CUSTOMER_VERSION_CONFLICT");

    const currentVersion = await deactivateCustomer(harness.ctx, {
      ...envelope(),
      expectedVersion: 2,
      payload: { customerId: CUSTOMER_ID, reason: null },
    });
    expect(currentVersion.ok).toBe(false);
    if (currentVersion.ok) return;
    expect(currentVersion.error.code).toBe("CUSTOMER_ALREADY_INACTIVE");
  });

  it("is owner-only — sales may update but not deactivate", async () => {
    expect(roleHasPermission("sales", "customer.update")).toBe(true);
    expect(roleHasPermission("sales", "customer.deactivate")).toBe(false);

    const result = await deactivateCustomer(
      harness.contextFor(SALES_ACTOR_ID),
      deactivateInput({}, SALES_ACTOR_ID),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
  });
});

describe("BR-CUSTOMER-003 / TC-CUSTOMER-011 — ReactivateCustomer", () => {
  it("restores operational use without touching the existing ledger history", async () => {
    await adjustCustomerDebt(harness.ctx, {
      ...envelope(),
      payload: {
        adjustmentId: uuid(602),
        customerId: CUSTOMER_ID,
        direction: "increase",
        amount: vnd(125_000),
        reasonCode: "opening_balance",
        reason: "Nợ cũ",
      },
    });
    await deactivateCustomer(harness.ctx, deactivateInput());
    const entriesBefore = structuredClone(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID));

    const result = await reactivateCustomer(harness.ctx, {
      ...envelope(),
      expectedVersion: 2,
      payload: { customerId: CUSTOMER_ID, reason: "Khách quay lại mua hàng" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isActive).toBe(true);
    expect(result.value.version).toBe(3);
    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toEqual(entriesBefore);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(125_000);
  });

  it("is owner-only and duplicate-safe", async () => {
    await deactivateCustomer(harness.ctx, deactivateInput());
    const command = {
      ...replayable("reactivate"),
      expectedVersion: 2,
      payload: { customerId: CUSTOMER_ID, reason: "Khôi phục hồ sơ" },
    };
    const first = await reactivateCustomer(harness.ctx, command);
    const replay = await reactivateCustomer(harness.ctx, command);
    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);

    const denied = await reactivateCustomer(harness.contextFor(SALES_ACTOR_ID), {
      ...envelope(SALES_ACTOR_ID),
      expectedVersion: 3,
      payload: { customerId: CUSTOMER_ID, reason: "Không đủ quyền" },
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.error.code).toBe("PERMISSION_DENIED");
  });
});

// ---------------------------------------------------------------------------
// UC-SALE-001 — UpdateSaleDraft and DiscardSaleDraft
// ---------------------------------------------------------------------------

const editInput = (overrides: Record<string, unknown> = {}, actorId = ACTOR_ID) => ({
  ...envelope(actorId),
  expectedVersion: 1,
  payload: {
    saleId: SALE,
    lines: [saleLineInputs[0]!],
    note: "Sửa lại",
    dueAt: null,
    ...overrides,
  },
});

const discardInput = (overrides: Record<string, unknown> = {}, actorId = ACTOR_ID) => ({
  ...envelope(actorId),
  expectedVersion: 1,
  payload: { saleId: SALE, reason: "Khách đổi ý", ...overrides },
});

describe("BR-SALE-018 / TC-SALE-019 — UpdateSaleDraft", () => {
  it("replaces the line set and recomputes the total, with no account effect", async () => {
    await draft();

    const result = await updateSaleDraft(harness.ctx, editInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines).toHaveLength(1);
    // Only the cà chua line: 12,5 kg × 18 000 (BR-SALE-001, BR-SALE-004).
    expect(result.value.totalAmount.amountMinor).toBe(225_000);
    expect(result.value.version).toBe(2);
    expect(result.value.status).toBe("draft");

    // A draft moves no money however many times it is edited (BR-SALE-010).
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.balanceFor(WORKSPACE_ID, CUSTOMER_ID)).toBeNull();
  });

  it("refuses to edit a posted sale", async () => {
    await draft();
    await postSale(harness.ctx, { ...envelope(), expectedVersion: 1, payload: { saleId: SALE } });

    const result = await updateSaleDraft(harness.ctx, editInput({}, ACTOR_ID));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Version conflict first: the sale moved to version 2 when it was posted.
    expect(result.error.code).toBe("SALE_VERSION_CONFLICT");

    const atCurrentVersion = await updateSaleDraft(harness.ctx, {
      ...envelope(),
      expectedVersion: 2,
      payload: { saleId: SALE, lines: [saleLineInputs[0]!], note: null, dueAt: null },
    });
    expect(atCurrentVersion.ok).toBe(false);
    if (atCurrentVersion.ok) return;
    // With the right version, the real reason surfaces (BR-SALE-008).
    expect(atCurrentVersion.error.code).toBe("SALE_ALREADY_POSTED");
    expect(harness.db.accountEntries()).toHaveLength(1);
  });

  it("refuses a stale version, so two phones cannot merge into a total nobody typed", async () => {
    await draft();
    await updateSaleDraft(harness.ctx, editInput());

    const second = await updateSaleDraft(harness.ctx, editInput({ note: "Khác" }));

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("SALE_VERSION_CONFLICT");
  });

  it("replays a retry without applying it twice", async () => {
    await draft();
    const input = { ...replayable("edit"), expectedVersion: 1, payload: editInput().payload };

    const first = await updateSaleDraft(harness.ctx, input);
    const retry = await updateSaleDraft(harness.ctx, input);

    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.value.version).toBe(2);
  });
});

describe("BR-SALE-018 / TC-SALE-020 — DiscardSaleDraft", () => {
  it("discards without any account effect, and keeps the row", async () => {
    await draft();

    const result = await discardSaleDraft(harness.ctx, discardInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("discarded");
    expect(result.value.discardedAt).toBe(TRANSACTION_TIME);
    // The lines stay: what somebody entered before thinking better of it is part
    // of what is kept (BR-SALE-018).
    expect(result.value.lines).toHaveLength(3);

    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(0);
  });

  it("cannot be posted afterwards", async () => {
    await draft();
    await discardSaleDraft(harness.ctx, discardInput());

    const posted = await postSale(harness.ctx, {
      ...envelope(),
      expectedVersion: 2,
      payload: { saleId: SALE },
    });

    expect(posted.ok).toBe(false);
    if (posted.ok) return;
    // Not "already posted", and not a version conflict either: it was discarded,
    // and the code has to say which of those happened. The repository's
    // `status = 'draft'` condition would have refused the write regardless, but
    // as a version conflict — the wrong story to tell.
    expect(posted.error.code).toBe("SALE_ALREADY_DISCARDED");
    expect(harness.db.accountEntries()).toHaveLength(0);
  });

  it("refuses a second discard", async () => {
    await draft();
    await discardSaleDraft(harness.ctx, discardInput());

    const again = await discardSaleDraft(harness.ctx, {
      ...envelope(),
      expectedVersion: 2,
      payload: { saleId: SALE, reason: null },
    });

    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("SALE_ALREADY_DISCARDED");
  });

  it("reports edit and discard capabilities that match what the commands do", async () => {
    await draft();
    const drafted = await updateSaleDraft(harness.ctx, editInput());
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) return;
    expect(drafted.value.capabilities.edit.allowed).toBe(true);
    expect(drafted.value.capabilities.discard.allowed).toBe(true);

    const discarded = await discardSaleDraft(harness.ctx, {
      ...envelope(),
      expectedVersion: 2,
      payload: { saleId: SALE, reason: null },
    });
    expect(discarded.ok).toBe(true);
    if (!discarded.ok) return;
    // The capability now carries the exact code the command would return.
    expect(discarded.value.capabilities.edit).toMatchObject({
      allowed: false,
      reasonCode: "SALE_ALREADY_DISCARDED",
    });
    expect(discarded.value.capabilities.post.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UC-AUTH-002 — RevokeWorkspaceMembership
// ---------------------------------------------------------------------------

const revokeInput = (actorId: string, actor = ACTOR_ID) => ({
  ...envelope(actor),
  payload: { actorId, reason: "Nghỉ việc" },
});

describe("BR-AUTH-007 / TC-AUTH-013 — RevokeWorkspaceMembership", () => {
  it("takes effect on the very next request", async () => {
    const before = await getSession(harness.contextFor(SALES_ACTOR_ID), WORKSPACE_ID);
    expect(before.ok).toBe(true);

    const revoked = await revokeWorkspaceMembership(harness.ctx, revokeInput(SALES_ACTOR_ID));
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(revoked.value.isActive).toBe(false);

    // No session to expire and no cache to invalidate: membership is re-read on
    // every request, so the next one is already refused (BR-AUTH-003).
    const after = await getSession(harness.contextFor(SALES_ACTOR_ID), WORKSPACE_ID);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.error.code).toBe("WORKSPACE_MEMBERSHIP_INACTIVE");
  });

  it("does not delete the membership, so their history still explains itself", async () => {
    await createSaleDraft(harness.contextFor(SALES_ACTOR_ID), {
      ...envelope(SALES_ACTOR_ID),
      payload: {
        saleId: SALE,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        dueAt: null,
        replacesSaleId: null,
      },
    });
    await postSale(harness.contextFor(SALES_ACTOR_ID), {
      ...envelope(SALES_ACTOR_ID),
      expectedVersion: 1,
      payload: { saleId: SALE },
    });

    await revokeWorkspaceMembership(harness.ctx, revokeInput(SALES_ACTOR_ID));

    // The entry they wrote still names them (BR-ACCOUNT-004). An audit trail has
    // to keep working after somebody leaves — that is when it is most needed.
    const entry = harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)[0]!;
    expect(entry.actorId).toBe(SALES_ACTOR_ID);
    expect(ledgerBalance(harness, CUSTOMER_ID)).toBe(875_000);
  });

  it("refuses to revoke the last active owner", async () => {
    // Two owners are seeded, but one is already revoked, so ACTOR_ID is the only
    // active one. A depot that revoked them would have locked itself out of its
    // own account book with no self-service remedy (BR-AUTH-007).
    const result = await revokeWorkspaceMembership(harness.ctx, revokeInput(ACTOR_ID));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_LAST_OWNER");
    expect(result.error.details).toMatchObject({ activeOwnerCount: 1 });

    // And they still have access.
    const session = await getSession(harness.ctx, WORKSPACE_ID);
    expect(session.ok).toBe(true);
  });

  it("refuses a role without workspace.manage", async () => {
    for (const [role, actorId] of [
      ["accountant", ACCOUNTANT_ACTOR_ID],
      ["sales", SALES_ACTOR_ID],
      ["delivery", DELIVERY_ACTOR_ID],
    ] as const) {
      expect(roleHasPermission(role, "workspace.manage")).toBe(false);

      const result = await revokeWorkspaceMembership(
        harness.contextFor(actorId),
        revokeInput(WAREHOUSE_ACTOR_ID, actorId),
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }

    // …and the target still has access, because a refusal changes nothing.
    const session = await getSession(harness.contextFor(WAREHOUSE_ACTOR_ID), WORKSPACE_ID);
    expect(session.ok).toBe(true);
  });

  it("refuses an actor who is not a member here", async () => {
    const result = await revokeWorkspaceMembership(harness.ctx, revokeInput(uuid(999)));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });
});

// ---------------------------------------------------------------------------
// BR-COMMAND-006 across the new commands
// ---------------------------------------------------------------------------

describe("BR-COMMAND-006 / TC-AUTH-012 — a refused lifecycle command leaves nothing behind", () => {
  const refusals: ReadonlyArray<[string, () => Promise<unknown>]> = [
    [
      "UpdateCustomer without permission",
      () =>
        updateCustomer(harness.contextFor(WAREHOUSE_ACTOR_ID), updateInput({}, WAREHOUSE_ACTOR_ID)),
    ],
    [
      "DeactivateCustomer without permission",
      () =>
        deactivateCustomer(harness.contextFor(SALES_ACTOR_ID), deactivateInput({}, SALES_ACTOR_ID)),
    ],
    [
      "DiscardSaleDraft without permission",
      () =>
        discardSaleDraft(
          harness.contextFor(WAREHOUSE_ACTOR_ID),
          discardInput({}, WAREHOUSE_ACTOR_ID),
        ),
    ],
    [
      "RevokeWorkspaceMembership without permission",
      () =>
        revokeWorkspaceMembership(
          harness.contextFor(SALES_ACTOR_ID),
          revokeInput(WAREHOUSE_ACTOR_ID, SALES_ACTOR_ID),
        ),
    ],
  ];

  it.each(refusals)("writes no audit record and no state change after %s", async (_kind, run) => {
    await draft();
    const auditBefore = harness.db.auditRecords().length;

    await run();

    expect(harness.db.auditRecords()).toHaveLength(auditBefore);
    expect(harness.db.accountEntries()).toHaveLength(0);
  });

  it("leaves the idempotency key free for the rightful actor to reuse", async () => {
    const key = { ...replayable("refused"), expectedVersion: 1 };

    const refused = await updateCustomer(harness.contextFor(WAREHOUSE_ACTOR_ID), {
      ...key,
      actorId: WAREHOUSE_ACTOR_ID,
      payload: updateInput().payload,
    });
    expect(refused.ok).toBe(false);

    // The same key, from somebody who may. If the refusal had burned it, this
    // would come back a duplicate and the correct command would be swallowed.
    const allowed = await updateCustomer(harness.ctx, {
      ...key,
      payload: updateInput().payload,
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.value.version).toBe(2);
  });
});
