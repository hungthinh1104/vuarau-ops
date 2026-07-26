import { beforeEach, describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } from "@vuarau/domain-contracts";
import {
  ACCOUNTANT_ACTOR_ID,
  ACTOR_ID,
  ADJUSTMENT_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  DELIVERY_ACTOR_ID,
  FOREIGN_ACTOR_ID,
  IDEMPOTENCY_KEY,
  REVOKED_ACTOR_ID,
  SALES_ACTOR_ID,
  TRANSACTION_TIME,
  WAREHOUSE_ACTOR_ID,
  WORKSPACE_ID,
  vnd,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { adjustCustomerDebt } from "../account/adjust-debt.handler.ts";
import { getCustomerAccountBalance } from "../account/account.queries.ts";
import { accountCapabilities } from "./authorization.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

/** `AdjustCustomerDebt` is the sharpest command in the system — the one that
 *  moves a balance with no underlying document — so it is what these use. */
const adjustInput = (actorId: string, overrides: Record<string, unknown> = {}) => ({
  commandId: COMMAND_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId,
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

function expectNothingWritten(): void {
  expect(harness.db.accountEntries()).toHaveLength(0);
  expect(harness.db.auditRecords()).toHaveLength(0);
  expect(harness.db.balanceFor(WORKSPACE_ID, CUSTOMER_ID)).toBeNull();
}

describe("BR-AUTH-002 / TC-AUTH-002", () => {
  it("refuses a command that names an actor other than the authenticated one", async () => {
    // The sales actor's identity, carrying the owner's id in the envelope: the
    // shape an attacker would send to attribute a debt movement to somebody else.
    const result = await adjustCustomerDebt(
      harness.contextFor(SALES_ACTOR_ID),
      adjustInput(ACTOR_ID),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ACTOR_IMPERSONATION_DENIED");
    expect(result.error.details).toMatchObject({
      claimedActorId: ACTOR_ID,
      authenticatedActorId: SALES_ACTOR_ID,
    });
    expectNothingWritten();
  });

  it("refuses impersonation before permission is even considered", async () => {
    // The owner impersonating the accountant: both hold `debt.adjust`, so a
    // permission-first ordering would have let this through.
    const result = await adjustCustomerDebt(
      harness.contextFor(ACTOR_ID),
      adjustInput(ACCOUNTANT_ACTOR_ID),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ACTOR_IMPERSONATION_DENIED");
    expectNothingWritten();
  });
});

describe("BR-AUTH-003 / TC-AUTH-003", () => {
  it("refuses an actor whose membership was revoked", async () => {
    // Still an `owner` by role — revocation, not demotion, is what stops them.
    const result = await adjustCustomerDebt(
      harness.contextFor(REVOKED_ACTOR_ID),
      adjustInput(REVOKED_ACTOR_ID),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_MEMBERSHIP_INACTIVE");
    expectNothingWritten();
  });

  it("distinguishes revoked access from never having had any", async () => {
    const revoked = await adjustCustomerDebt(
      harness.contextFor(REVOKED_ACTOR_ID),
      adjustInput(REVOKED_ACTOR_ID),
    );
    const stranger = await adjustCustomerDebt(
      harness.contextFor(FOREIGN_ACTOR_ID),
      adjustInput(FOREIGN_ACTOR_ID),
    );

    // Same outcome for the user, different remedy for the operator: reactivate a
    // membership versus create one.
    expect(revoked.ok || stranger.ok).toBe(false);
    if (revoked.ok || stranger.ok) return;
    expect(revoked.error.code).toBe("WORKSPACE_MEMBERSHIP_INACTIVE");
    expect(stranger.error.code).toBe("WORKSPACE_ACCESS_DENIED");
  });
});

describe("BR-CUSTOMER-002 / TC-AUTH-007", () => {
  it("refuses an actor who belongs only to another workspace", async () => {
    const result = await adjustCustomerDebt(
      harness.contextFor(FOREIGN_ACTOR_ID),
      adjustInput(FOREIGN_ACTOR_ID),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
    expect(result.error.details).toMatchObject({ workspaceId: WORKSPACE_ID });
    expectNothingWritten();
  });
});

describe("BR-AUTH-004 / TC-AUTH-004", () => {
  it("refuses debt adjustment by a role without the permission", async () => {
    const result = await adjustCustomerDebt(
      harness.contextFor(SALES_ACTOR_ID),
      adjustInput(SALES_ACTOR_ID),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
    expect(result.error.details).toMatchObject({ permission: "debt.adjust", role: "sales" });
    expectNothingWritten();
  });

  it.each([
    ["sales", SALES_ACTOR_ID],
    ["warehouse", WAREHOUSE_ACTOR_ID],
    ["delivery", DELIVERY_ACTOR_ID],
  ])(
    "refuses %s outright — no role but owner and accountant may move a balance",
    async (_role, actorId) => {
      const result = await adjustCustomerDebt(harness.contextFor(actorId), adjustInput(actorId));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("PERMISSION_DENIED");
      expectNothingWritten();
    },
  );

  it("does not consume the idempotency key of a refused command", async () => {
    // A refusal must not let an unauthorized caller burn a key the rightful
    // actor is about to use.
    const refused = await adjustCustomerDebt(
      harness.contextFor(SALES_ACTOR_ID),
      adjustInput(SALES_ACTOR_ID),
    );
    expect(refused.ok).toBe(false);

    const allowed = await adjustCustomerDebt(harness.contextFor(ACTOR_ID), adjustInput(ACTOR_ID));
    expect(allowed.ok).toBe(true);
  });
});

describe("BR-AUTH-006 / TC-AUTH-005", () => {
  it("lets an owner adjust debt", async () => {
    const result = await adjustCustomerDebt(harness.contextFor(ACTOR_ID), adjustInput(ACTOR_ID));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.balance.amountMinor).toBe(50_000);
    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(1);
  });

  it("lets an accountant adjust debt", async () => {
    const result = await adjustCustomerDebt(
      harness.contextFor(ACCOUNTANT_ACTOR_ID),
      adjustInput(ACCOUNTANT_ACTOR_ID),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.balance.amountMinor).toBe(50_000);
  });

  it("attributes the entry to the authenticated actor, not to whoever asked", async () => {
    await adjustCustomerDebt(
      harness.contextFor(ACCOUNTANT_ACTOR_ID),
      adjustInput(ACCOUNTANT_ACTOR_ID),
    );

    const entry = harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)[0]!;
    expect(entry.actorId).toBe(ACCOUNTANT_ACTOR_ID);
  });
});

describe("BR-AUTH-006 / TC-AUTH-006", () => {
  it("reports the adjust capability that matches what the command would do", async () => {
    const ownerSummary = await getCustomerAccountBalance(
      harness.contextFor(ACTOR_ID),
      WORKSPACE_ID,
      CUSTOMER_ID,
    );
    expect(ownerSummary.ok).toBe(true);
    if (!ownerSummary.ok) return;
    expect(ownerSummary.value.capabilities.adjust.allowed).toBe(true);

    const salesSummary = await getCustomerAccountBalance(
      harness.contextFor(SALES_ACTOR_ID),
      WORKSPACE_ID,
      CUSTOMER_ID,
    );
    expect(salesSummary.ok).toBe(true);
    if (!salesSummary.ok) return;
    expect(salesSummary.value.capabilities.adjust).toEqual({
      allowed: false,
      reasonCode: "PERMISSION_DENIED",
      details: { permission: "debt.adjust", role: "sales" },
    });
  });

  it("agrees with the command for every role — one implementation, no drift", async () => {
    // The capability and the guard both call `roleHasPermission`. This asserts
    // they cannot diverge, which is the whole point of ADR-0003.
    for (const role of ["owner", "accountant", "sales", "warehouse", "delivery"] as const) {
      expect(accountCapabilities(role).adjust.allowed).toBe(roleHasPermission(role, "debt.adjust"));
    }
  });
});

describe("BR-AUTH-004 / TC-AUTH-009 — the role table itself", () => {
  it("grants debt.adjust to exactly owner and accountant", () => {
    const canAdjust = (["owner", "accountant", "sales", "warehouse", "delivery"] as const).filter(
      (role) => roleHasPermission(role, "debt.adjust"),
    );
    expect(canAdjust).toEqual(["owner", "accountant"]);
  });

  it("gives the owner every permission that exists", () => {
    // Compared against PERMISSIONS, so adding a permission without granting it to
    // the owner fails here rather than silently locking them out of it.
    expect([...ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission("owner", permission)).toBe(true);
    }
  });

  it("gives warehouse and delivery no permission that moves money", () => {
    for (const role of ["warehouse", "delivery"] as const) {
      for (const permission of [
        "debt.adjust",
        "payment.record",
        "payment.reverse",
        "sale.post",
      ] as const) {
        expect(roleHasPermission(role, permission), `${role} must not hold ${permission}`).toBe(
          false,
        );
      }
    }
  });
});

describe("BR-COMMAND-006 / TC-AUTH-012", () => {
  /**
   * The thirteenth guarantee: a refusal costs nothing.
   *
   * Checked across all four kinds of refusal, because they take different exits
   * from the pipeline — impersonation and permission are refused before the
   * idempotency claim, a domain refusal after it — and only one of those paths
   * needs to get it wrong for a worker to be told their corrected retry is a
   * duplicate.
   */
  const refusals: ReadonlyArray<[string, () => Promise<unknown>]> = [
    [
      "impersonation",
      () => adjustCustomerDebt(harness.contextFor(SALES_ACTOR_ID), adjustInput(ACTOR_ID)),
    ],
    [
      "insufficient permission",
      () => adjustCustomerDebt(harness.contextFor(SALES_ACTOR_ID), adjustInput(SALES_ACTOR_ID)),
    ],
    [
      "revoked membership",
      () => adjustCustomerDebt(harness.contextFor(REVOKED_ACTOR_ID), adjustInput(REVOKED_ACTOR_ID)),
    ],
    [
      "another workspace",
      () => adjustCustomerDebt(harness.contextFor(FOREIGN_ACTOR_ID), adjustInput(FOREIGN_ACTOR_ID)),
    ],
  ];

  it.each(refusals)(
    "leaves no financial effect and no audit record after %s",
    async (_kind, run) => {
      await run();
      expectNothingWritten();
    },
  );

  it.each(refusals)("leaves the idempotency key free to reuse after %s", async (_kind, run) => {
    await run();

    // The rightful actor now sends the *same* key. If the refusal had burned it,
    // this would come back DUPLICATE_COMMAND or COMMAND_IN_PROGRESS and the
    // correct command would be silently swallowed.
    const allowed = await adjustCustomerDebt(harness.contextFor(ACTOR_ID), adjustInput(ACTOR_ID));

    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.value.balance.amountMinor).toBe(50_000);
    expect(harness.db.entriesFor(WORKSPACE_ID, CUSTOMER_ID)).toHaveLength(1);
  });

  it("writes no command receipt for a refused command", async () => {
    await adjustCustomerDebt(harness.contextFor(SALES_ACTOR_ID), adjustInput(SALES_ACTOR_ID));

    // Observed through behaviour rather than by reaching into the receipt store:
    // a stored receipt would replay its result, so a *different* payload under
    // the same key succeeding proves no receipt was left behind.
    const different = await adjustCustomerDebt(harness.contextFor(ACTOR_ID), {
      ...adjustInput(ACTOR_ID),
      payload: {
        ...adjustInput(ACTOR_ID).payload,
        amount: vnd(70_000),
        reason: "Số khác hẳn",
      },
    });

    expect(different.ok).toBe(true);
    if (!different.ok) return;
    expect(different.value.balance.amountMinor).toBe(70_000);
  });
});
