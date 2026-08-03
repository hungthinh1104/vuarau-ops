import { describe, expect, it } from "vitest";
import type { CustomerId, PaymentId, SaleId } from "@vuarau/domain-contracts";
import { paymentTermsAgingPolicyDefinitionSchema } from "@vuarau/domain-contracts";
import { calculateDebtAging } from "./index.ts";

const customerId = "00000000-0000-4000-8000-000000000001" as CustomerId;
const saleId = (suffix: string) => `00000000-0000-4000-8000-00000000000${suffix}` as SaleId;
const paymentId = "00000000-0000-4000-8000-000000000009" as PaymentId;
const vnd = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });

const terms = paymentTermsAgingPolicyDefinitionSchema.parse({
  contractVersion: 1,
  parameters: {
    defaultTermDays: 7,
    defaultTermLabel: "7 ngày",
    customerTerms: [],
    graceDays: 0,
    agingBuckets: [
      { code: "1-7", label: "1–7 ngày", minDaysOverdue: 1, maxDaysOverdue: 7 },
      { code: "8+", label: "8 ngày trở lên", minDaysOverdue: 8, maxDaysOverdue: null },
    ],
    creditControl: "information_only",
  },
});

describe("BR-AGING-001 / BR-AGING-002 / TC-AGING-001", () => {
  it("allocates payments deterministically and separates settled, overdue and not-due debt", () => {
    const result = calculateDebtAging(
      {
        sales: [
          {
            saleId: saleId("3"),
            customerId,
            amount: vnd(100_000),
            transactionTime: "2026-01-01T00:00:00.000Z",
            dueAt: "2026-01-02T00:00:00.000Z",
          },
          {
            saleId: saleId("4"),
            customerId,
            amount: vnd(200_000),
            transactionTime: "2026-01-03T00:00:00.000Z",
            dueAt: "2026-01-20T00:00:00.000Z",
          },
        ],
        payments: [
          {
            paymentId,
            customerId,
            amount: vnd(150_000),
            reversals: [],
            transactionTime: "2026-01-05T00:00:00.000Z",
          },
        ],
        ledgerEntries: [
          {
            entryId: "00000000-0000-4000-8000-000000000010",
            sourceType: "sale_posting",
            sourceId: saleId("3"),
            customerId,
            amount: vnd(100_000),
            transactionTime: "2026-01-01T00:00:00.000Z",
          },
          {
            entryId: "00000000-0000-4000-8000-000000000011",
            sourceType: "sale_posting",
            sourceId: saleId("4"),
            customerId,
            amount: vnd(200_000),
            transactionTime: "2026-01-03T00:00:00.000Z",
          },
          {
            entryId: "00000000-0000-4000-8000-000000000012",
            sourceType: "payment",
            sourceId: paymentId,
            customerId,
            amount: vnd(-150_000),
            transactionTime: "2026-01-05T00:00:00.000Z",
          },
        ],
        allocations: [],
        allocationReversals: [],
      },
      terms,
      "oldest_due_first",
      "2026-01-10T00:00:00.000Z",
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.rows).toMatchObject([
      {
        saleId: saleId("3"),
        state: "settled",
        allocatedAmount: vnd(100_000),
        outstandingAmount: vnd(0),
        bucketCode: null,
      },
      {
        saleId: saleId("4"),
        state: "not_due",
        allocatedAmount: vnd(50_000),
        outstandingAmount: vnd(150_000),
      },
    ]);
    expect(result.payments[0]).toMatchObject({
      state: "allocated",
      allocatedAmount: vnd(150_000),
      unallocatedAmount: vnd(0),
    });
    expect(result.totals).toMatchObject({
      ledgerBalance: vnd(150_000),
      saleOutstanding: vnd(150_000),
      overdue: vnd(0),
      notDue: vnd(150_000),
    });
  });

  it("fails closed when the configured strategy needs allocations that are not recorded", () => {
    const result = calculateDebtAging(
      {
        sales: [],
        payments: [
          {
            paymentId,
            customerId,
            amount: vnd(10_000),
            reversals: [],
            transactionTime: "2026-01-05T00:00:00.000Z",
          },
        ],
        ledgerEntries: [],
        allocations: [],
        allocationReversals: [],
      },
      terms,
      "manual",
      "2026-01-10T00:00:00.000Z",
    );

    expect(result.diagnostics).toContain("manual_allocation_not_recorded");
  });

  it("fails closed when a policy-derived sale has no policy lineage", () => {
    const result = calculateDebtAging(
      {
        sales: [
          {
            saleId: saleId("6"),
            customerId,
            amount: vnd(100_000),
            transactionTime: "2026-01-01T00:00:00.000Z",
            dueAt: "2026-01-08T00:00:00.000Z",
            paymentTermsSource: "workspace_policy",
            paymentTermsPolicyVersionId: null,
          },
        ],
        payments: [],
        ledgerEntries: [],
        allocations: [],
        allocationReversals: [],
      },
      terms,
      "oldest_due_first",
      "2026-01-10T00:00:00.000Z",
    );

    expect(result.diagnostics).toContain("sale_term_policy_lineage_missing");
  });

  it("uses persisted allocation facts and compensation for a manual policy", () => {
    const result = calculateDebtAging(
      {
        sales: [
          {
            saleId: saleId("5"),
            customerId,
            amount: vnd(100_000),
            transactionTime: "2026-01-01T00:00:00.000Z",
            dueAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        payments: [
          {
            paymentId,
            customerId,
            amount: vnd(80_000),
            reversals: [],
            transactionTime: "2026-01-03T00:00:00.000Z",
          },
        ],
        ledgerEntries: [
          {
            entryId: "00000000-0000-4000-8000-000000000013",
            sourceType: "sale_posting",
            sourceId: saleId("5"),
            customerId,
            amount: vnd(100_000),
            transactionTime: "2026-01-01T00:00:00.000Z",
          },
          {
            entryId: "00000000-0000-4000-8000-000000000014",
            sourceType: "payment",
            sourceId: paymentId,
            customerId,
            amount: vnd(-80_000),
            transactionTime: "2026-01-03T00:00:00.000Z",
          },
        ],
        allocations: [
          {
            allocationId: "00000000-0000-4000-8000-000000000015" as never,
            customerId,
            paymentId,
            saleId: saleId("5"),
            amount: vnd(80_000),
            transactionTime: "2026-01-04T00:00:00.000Z",
          },
        ],
        allocationReversals: [
          {
            reversalId: "00000000-0000-4000-8000-000000000016" as never,
            allocationId: "00000000-0000-4000-8000-000000000015" as never,
            customerId,
            amount: vnd(20_000),
            transactionTime: "2026-01-05T00:00:00.000Z",
          },
        ],
      },
      terms,
      "manual",
      "2026-01-10T00:00:00.000Z",
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      allocatedAmount: vnd(60_000),
      outstandingAmount: vnd(40_000),
      state: "overdue",
    });
    expect(result.payments[0]).toMatchObject({
      allocatedAmount: vnd(60_000),
      unallocatedAmount: vnd(20_000),
      state: "partially_allocated",
    });
  });
});
