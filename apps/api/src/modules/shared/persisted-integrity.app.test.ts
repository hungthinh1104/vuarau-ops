import { describe, expect, it } from "vitest";
import { PersistedIntegrityError } from "@vuarau/db";
import type {
  GoodsArrivalLineId,
  GoodsArrivalDto,
  PurchaseLineId,
  QualityDispositionAllocationId,
  QualityDispositionDto,
  QualityInspectionDto,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  LATEST_TRANSACTION_TIME,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SUPPLIER_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import type {
  Repositories as ApiRepositories,
  UnitOfWork as ApiUnitOfWork,
} from "../../infrastructure/persistence/ports.ts";
import type { AccountEntryDraft } from "@vuarau/domain-kernel";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import { runQuery } from "./read-pipeline.ts";

const now = LATEST_TRANSACTION_TIME;

function inspection(id: string, arrivalLineId: string, unit: "kg" | "bo"): QualityInspectionDto {
  return {
    id: id as QualityInspectionDto["id"],
    workspaceId: WORKSPACE_ID,
    arrivalLineId: arrivalLineId as QualityInspectionDto["arrivalLineId"],
    inspectedQuantity: { valueScaled: 1_000, unit },
    issues: [],
    note: null,
    evidenceReferences: [],
    transactionTime: now,
    recordedAt: now,
    actorId: ACTOR_ID,
    commandId: crypto.randomUUID() as QualityInspectionDto["commandId"],
    reversal: null,
  };
}

function arrival(
  arrivalId: string,
  arrivalLineId: string,
  purchaseLineId: string,
): GoodsArrivalDto {
  return {
    id: arrivalId as GoodsArrivalDto["id"],
    workspaceId: WORKSPACE_ID,
    supplierId: SUPPLIER_ID,
    purchaseId: null,
    vehicleReference: null,
    lines: [
      {
        arrivalLineId: arrivalLineId as GoodsArrivalDto["lines"][number]["arrivalLineId"],
        purchaseLineId: purchaseLineId as GoodsArrivalDto["lines"][number]["purchaseLineId"],
        productId: PRODUCT_CA_CHUA_ID,
        productName: "Cà chua",
        arrivedQuantity: { valueScaled: 2_000, unit: "kg" },
        weighing: null,
        supplierLotCode: null,
        note: null,
      },
    ],
    note: null,
    transactionTime: now,
    recordedAt: now,
    actorId: ACTOR_ID,
    commandId: crypto.randomUUID() as QualityInspectionDto["commandId"],
    evidenceReferences: [],
    reversal: null,
  };
}

function acceptedDisposition(
  id: string,
  arrivalLineId: string,
  allocationId: string,
  quantity: { valueScaled: number; unit: "kg" | "bo" },
): QualityDispositionDto {
  return {
    id: id as QualityDispositionDto["id"],
    workspaceId: WORKSPACE_ID,
    source: { type: "arrival_line", arrivalLineId: arrivalLineId as GoodsArrivalLineId },
    allocations: [
      {
        allocationId: allocationId as QualityDispositionAllocationId,
        outcome: "accepted",
        quantity,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        note: null,
      },
    ],
    note: null,
    transactionTime: now,
    recordedAt: now,
    actorId: ACTOR_ID,
    commandId: crypto.randomUUID() as QualityInspectionDto["commandId"],
    reversal: null,
    evidenceReferences: [],
  };
}

async function insertMixedFacts(harness: Harness): Promise<string> {
  const arrivalId = crypto.randomUUID();
  const arrivalLineId = crypto.randomUUID();
  const purchaseLineId = crypto.randomUUID();
  await harness.deps.uow.transaction(async (repos) => {
    await repos.goodsArrivals.insert(arrival(arrivalId, arrivalLineId, purchaseLineId));
    await repos.qualityInspections.insert(inspection(crypto.randomUUID(), arrivalLineId, "kg"));
    await repos.qualityInspections.insert(inspection(crypto.randomUUID(), arrivalLineId, "bo"));
  });
  return arrivalLineId;
}

function throwsPersistedIntegrityAfterSuccess(harness: Harness): ApiUnitOfWork {
  return {
    transaction: async <T>(work: (repos: ApiRepositories) => Promise<T>): Promise<T> =>
      harness.deps.uow.transaction(async (repos) => {
        const result = await work(repos);
        if (
          typeof result === "object" &&
          result !== null &&
          "ok" in result &&
          (result as { readonly ok?: unknown }).ok === true
        ) {
          throw new PersistedIntegrityError("corrupt persisted quantity fixture");
        }
        return result;
      }),
  };
}

describe("persisted intake integrity boundary", () => {
  it("keeps duplicate account sources fail-closed in the in-memory adapter", async () => {
    const harness = createHarness();
    const draft: AccountEntryDraft = {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      amount: { amountMinor: -10_000, currency: "VND" },
      sourceType: "payment",
      sourceId: crypto.randomUUID(),
      reversalOfEntryId: null,
      reasonCode: null,
      reason: null,
      transactionTime: now,
      recordedAt: now,
      actorId: ACTOR_ID,
      commandId: crypto.randomUUID() as AccountEntryDraft["commandId"],
    };

    await harness.deps.uow.transaction((repos) => repos.accountEntries.append([draft]));
    await expect(
      harness.deps.uow.transaction((repos) => repos.accountEntries.append([draft])),
    ).rejects.toMatchObject({
      code: "ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE",
    });
  });

  it("keeps the in-memory adapter from summing inspection units", async () => {
    const harness = createHarness();
    const arrivalLineId = await insertMixedFacts(harness);

    await expect(
      harness.deps.uow.transaction((repos) =>
        repos.qualityInspections.activeInspectedQuantity(
          WORKSPACE_ID,
          arrivalLineId as GoodsArrivalLineId,
        ),
      ),
    ).rejects.toBeInstanceOf(PersistedIntegrityError);
  });

  it("keeps the in-memory adapter from summing accepted units", async () => {
    const harness = createHarness();
    const arrivalId = crypto.randomUUID();
    const arrivalLineId = crypto.randomUUID();
    const purchaseLineId = crypto.randomUUID();
    await harness.deps.uow.transaction(async (repos) => {
      await repos.goodsArrivals.insert(arrival(arrivalId, arrivalLineId, purchaseLineId));
      await repos.qualityDispositions.insert(
        acceptedDisposition(crypto.randomUUID(), arrivalLineId, crypto.randomUUID(), {
          valueScaled: 1_000,
          unit: "kg",
        }),
      );
      await repos.qualityDispositions.insert(
        acceptedDisposition(crypto.randomUUID(), arrivalLineId, crypto.randomUUID(), {
          valueScaled: 1_000,
          unit: "bo",
        }),
      );
    });

    await expect(
      harness.deps.uow.transaction((repos) =>
        repos.qualityDispositions.acceptedQuantityForPurchaseLine(
          WORKSPACE_ID,
          purchaseLineId as PurchaseLineId,
        ),
      ),
    ).rejects.toBeInstanceOf(PersistedIntegrityError);
  });

  it("maps persisted integrity failures to a non-retryable command rejection", async () => {
    const harness = createHarness();
    const result = await recordCustomerPayment(
      {
        ...harness.ctx,
        deps: { ...harness.deps, uow: throwsPersistedIntegrityAfterSuccess(harness) },
      },
      {
        commandId: crypto.randomUUID(),
        idempotencyKey: `persisted-integrity-${crypto.randomUUID()}`,
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        occurredAt: now,
        payload: {
          paymentId: crypto.randomUUID(),
          customerId: CUSTOMER_ID,
          amount: { amountMinor: 10_000, currency: "VND" },
          method: "cash",
          payerName: null,
          note: null,
          evidenceReferences: [],
        },
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE",
        retryable: false,
      },
    });
    expect(harness.db.payments()).toHaveLength(0);
  });

  it("maps persisted integrity failures to a controlled read rejection", async () => {
    const harness = createHarness();
    const result = await runQuery({
      ctx: {
        ...harness.ctx,
        deps: { ...harness.deps, uow: throwsPersistedIntegrityAfterSuccess(harness) },
      },
      workspaceId: WORKSPACE_ID,
      permission: "report.read",
      execute: async () => ({ ok: true }),
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE",
        retryable: false,
      },
    });
  });
});
