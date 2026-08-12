import { describe, expect, it, vi } from "vitest";
import { PersistedNumberOutOfRangeError } from "@vuarau/db";
import { customerAccountEntryIdSchema } from "@vuarau/domain-contracts";
import { ExactIntegerArithmeticError, ExactMoneyArithmeticError } from "@vuarau/domain-kernel";
import type { InventoryMovementState } from "@vuarau/domain-kernel";
import {
  ACTOR_ID,
  ADJUSTMENT_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  LATER_TRANSACTION_TIME,
  PAYMENT_AMOUNT,
  PAYMENT_ID,
  PRODUCT_CA_CHUA_ID,
  WORKSPACE_ID,
  postedSale,
  voidedSale,
} from "@vuarau/test-fixtures";
import type { Repositories, UnitOfWork } from "../../infrastructure/persistence/ports.ts";
import { withRequestId } from "../../infrastructure/logging.ts";
import { applyInventoryMovements } from "../inventory/inventory-effects.ts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import { runQuery } from "./read-pipeline.ts";
import { getCustomerAccountTimeline } from "../account/account.queries.ts";
import { getDashboardSummary } from "../dashboard/dashboard.queries.ts";

function throwsPersistedRangeAfterSuccess(harness: Harness): UnitOfWork {
  return {
    transaction: async <T>(work: (repos: Repositories) => Promise<T>): Promise<T> =>
      harness.deps.uow.transaction(async (repos) => {
        const result = await work(repos);
        if (
          typeof result === "object" &&
          result !== null &&
          "ok" in result &&
          (result as { readonly ok?: unknown }).ok === true
        ) {
          throw new PersistedNumberOutOfRangeError("customer_account_entries.amount_minor");
        }
        return result;
      }),
  };
}

function throwsExactMoneyRangeAfterSuccess(harness: Harness): UnitOfWork {
  return {
    transaction: async <T>(work: (repos: Repositories) => Promise<T>): Promise<T> =>
      harness.deps.uow.transaction(async (repos) => {
        await work(repos);
        throw new ExactMoneyArithmeticError("money.aggregate.amount_minor");
      }),
  };
}

describe("BR-OPS-009 / TC-OPS-019 — PERSISTED_NUMBER_OUT_OF_RANGE pipeline boundary", () => {
  it("rolls back command effects and returns a non-retryable diagnostic", async () => {
    const harness = createHarness();
    const ctx = {
      ...harness.ctx,
      deps: { ...harness.deps, uow: throwsPersistedRangeAfterSuccess(harness) },
    };

    const result = await withRequestId("req-safe-range", () =>
      recordCustomerPayment(ctx, {
        commandId: COMMAND_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        workspaceId: WORKSPACE_ID,
        actorId: ctx.principal.actorId,
        occurredAt: LATER_TRANSACTION_TIME,
        payload: {
          paymentId: PAYMENT_ID,
          customerId: CUSTOMER_ID,
          amount: PAYMENT_AMOUNT,
          method: "cash",
          payerName: null,
          note: null,
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "PERSISTED_NUMBER_OUT_OF_RANGE",
      retryable: false,
      details: {
        field: "customer_account_entries.amount_minor",
        requestId: "req-safe-range",
      },
    });
    expect(JSON.stringify(result.error)).not.toContain("9007199254740992");
    expect(harness.db.payments()).toHaveLength(0);
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(0);
  });

  it("maps derived money arithmetic overflow to the same controlled rejection", async () => {
    const harness = createHarness();
    const ctx = {
      ...harness.ctx,
      deps: { ...harness.deps, uow: throwsExactMoneyRangeAfterSuccess(harness) },
    };
    const result = await withRequestId("req-derived-money-range", () =>
      runQuery({
        ctx,
        workspaceId: WORKSPACE_ID,
        permission: "report.read",
        execute: async () => ({ balanceMinor: 0 }),
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        retryable: false,
        details: { field: "money.aggregate.amount_minor", requestId: "req-derived-money-range" },
      },
    });
  });

  it("maps derived quantity arithmetic overflow to the same controlled rejection", async () => {
    const harness = createHarness();
    const ctx = {
      ...harness.ctx,
      deps: { ...harness.deps, uow: harness.deps.uow },
    };
    const result = await withRequestId("req-derived-quantity-range", () =>
      runQuery({
        ctx,
        workspaceId: WORKSPACE_ID,
        permission: "inventory.read",
        execute: async () => {
          throw new ExactIntegerArithmeticError("inventory.balance.quantity_scaled");
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        retryable: false,
        details: {
          field: "inventory.balance.quantity_scaled",
          requestId: "req-derived-quantity-range",
        },
      },
    });
  });

  it("maps the same failure for reads without exposing the database value", async () => {
    const harness = createHarness();
    const ctx = {
      ...harness.ctx,
      deps: { ...harness.deps, uow: throwsPersistedRangeAfterSuccess(harness) },
    };

    const result = await withRequestId("req-safe-read", () =>
      runQuery({
        ctx,
        workspaceId: WORKSPACE_ID,
        permission: "report.read",
        execute: async () => ({ balanceMinor: 9007199254740992 }),
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        message: "Persisted numeric data is outside the supported range.",
        details: { field: "customer_account_entries.amount_minor", requestId: "req-safe-read" },
        retryable: false,
      },
    });
  });

  it("maps an inventory balance aggregate overflow to the same controlled boundary", async () => {
    const movement = (valueScaled: number): InventoryMovementState =>
      ({
        id: crypto.randomUUID(),
        workspaceId: WORKSPACE_ID,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: null,
        qualityGradeName: null,
        quantity: { valueScaled, unit: "kg" },
        sourceType: "inventory_adjustment",
        sourceId: crypto.randomUUID(),
        sourceLineId: null,
        reversalOfMovementId: null,
        reasonCode: "count_correction",
        reason: "overflow regression",
        transactionTime: LATER_TRANSACTION_TIME,
        recordedAt: LATER_TRANSACTION_TIME,
        actorId: ACTOR_ID,
        commandId: COMMAND_ID,
      }) as InventoryMovementState;
    const appended = [movement(Number.MAX_SAFE_INTEGER), movement(Number.MAX_SAFE_INTEGER)];
    const applyDelta = vi.fn();
    const repos = {
      inventoryMovements: { append: vi.fn(async () => appended) },
      inventoryBalances: { applyDelta },
    } as unknown as Repositories;

    await expect(
      applyInventoryMovements(repos, appended as readonly Omit<InventoryMovementState, "id">[]),
    ).rejects.toBeInstanceOf(PersistedNumberOutOfRangeError);
    expect(applyDelta).not.toHaveBeenCalled();
  });

  it("keeps in-memory inventory balance overflow behavior aligned with PostgreSQL", async () => {
    const harness = createHarness();
    const delta = {
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: null,
      unit: "kg" as const,
      movementCount: 1,
      lastMovementTransactionTime: LATER_TRANSACTION_TIME,
      updatedAt: LATER_TRANSACTION_TIME,
    };

    await harness.deps.uow.transaction(async (repos) => {
      await repos.inventoryBalances.applyDelta({
        ...delta,
        quantityScaled: Number.MAX_SAFE_INTEGER,
      });
    });

    await expect(
      harness.deps.uow.transaction(async (repos) => {
        await repos.inventoryBalances.applyDelta({ ...delta, quantityScaled: 1 });
      }),
    ).rejects.toMatchObject({
      name: "PersistedNumberOutOfRangeError",
      code: "PERSISTED_NUMBER_OUT_OF_RANGE",
      field: "inventory_balances.quantity_scaled",
    });

    await expect(
      harness.deps.uow.transaction((repos) =>
        repos.inventoryBalances.get(WORKSPACE_ID, PRODUCT_CA_CHUA_ID, null, "kg"),
      ),
    ).resolves.toMatchObject({ quantityScaled: Number.MAX_SAFE_INTEGER });
  });

  it("rejects unsafe in-memory inventory balances during projection rebuild", async () => {
    const harness = createHarness();

    await expect(
      harness.deps.uow.transaction((repos) =>
        repos.inventoryBalances.save({
          workspaceId: WORKSPACE_ID,
          productId: PRODUCT_CA_CHUA_ID,
          qualityGradeId: null,
          unit: "kg",
          quantityScaled: Number.MAX_SAFE_INTEGER + 1,
          movementCount: 1,
          lastMovementTransactionTime: LATER_TRANSACTION_TIME,
          updatedAt: LATER_TRANSACTION_TIME,
        }),
      ),
    ).rejects.toMatchObject({
      name: "PersistedNumberOutOfRangeError",
      code: "PERSISTED_NUMBER_OUT_OF_RANGE",
      field: "inventory_balances.quantity_scaled",
    });

    await expect(
      harness.deps.uow.transaction((repos) =>
        repos.inventoryBalances.get(WORKSPACE_ID, PRODUCT_CA_CHUA_ID, null, "kg"),
      ),
    ).resolves.toBeNull();
  });

  it("keeps in-memory account running balances aligned with PostgreSQL safe aggregates", async () => {
    const harness = createHarness();
    const entry = (id: string) => ({
      id: customerAccountEntryIdSchema.parse(id),
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      amount: { amountMinor: Number.MAX_SAFE_INTEGER, currency: "VND" as const },
      sourceType: "manual_adjustment" as const,
      sourceId: ADJUSTMENT_ID,
      reversalOfEntryId: null,
      reasonCode: "opening_balance" as const,
      reason: "safe aggregate regression",
      transactionTime: LATER_TRANSACTION_TIME,
      recordedAt: LATER_TRANSACTION_TIME,
      actorId: ACTOR_ID,
      commandId: COMMAND_ID,
    });
    harness.db.seedAccountEntry(entry("00000000-0000-4000-8000-00000000ba01"));
    harness.db.seedAccountEntry(entry("00000000-0000-4000-8000-00000000ba02"));

    const result = await getCustomerAccountTimeline(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      cursor: null,
      limit: 10,
      from: null,
      to: null,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        retryable: false,
        details: { field: "account.running_balance_minor" },
      },
    });
  });

  it("keeps in-memory dashboard money totals exact at the persistence boundary", async () => {
    const harness = createHarness();
    const huge = (id: typeof postedSale.id) => ({
      ...postedSale,
      id,
      totalAmount: { amountMinor: Number.MAX_SAFE_INTEGER, currency: "VND" as const },
    });
    harness.db.seedSale(huge(postedSale.id));
    harness.db.seedSale(huge(voidedSale.id));

    const result = await getDashboardSummary(harness.ctx, WORKSPACE_ID);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "PERSISTED_NUMBER_OUT_OF_RANGE",
        retryable: false,
        details: { field: "dashboard.sales.amount_minor" },
      },
    });
  });
});
