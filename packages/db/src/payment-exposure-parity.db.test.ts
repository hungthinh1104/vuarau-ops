import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { derivePaymentExposure } from "@vuarau/domain-kernel";
import {
  commandReceipts,
  debtObservations,
  paymentAllocationReversals,
  paymentAllocations,
  paymentReversals,
  payments,
  sales,
  createDbTestContext,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";

type AllocationCase = { readonly amountMinor: number; readonly reversedAmountMinor?: number };
type ExposureCase = {
  readonly label: string;
  readonly originalAmountMinor: number;
  readonly reversedAmountMinor: number;
  readonly allocations: readonly AllocationCase[];
  readonly preservedCreditAmountMinor: number;
  readonly correctedPreservedCreditAmountMinor?: number;
};

const cases: readonly ExposureCase[] = [
  {
    label: "normal",
    originalAmountMinor: 1_000,
    reversedAmountMinor: 0,
    allocations: [],
    preservedCreditAmountMinor: 0,
  },
  {
    label: "partial allocation",
    originalAmountMinor: 1_000,
    reversedAmountMinor: 0,
    allocations: [{ amountMinor: 400 }],
    preservedCreditAmountMinor: 0,
  },
  {
    label: "full allocation",
    originalAmountMinor: 1_000,
    reversedAmountMinor: 0,
    allocations: [{ amountMinor: 1_000 }],
    preservedCreditAmountMinor: 0,
  },
  {
    label: "payment reversal",
    originalAmountMinor: 1_000,
    reversedAmountMinor: 300,
    allocations: [],
    preservedCreditAmountMinor: 0,
  },
  {
    label: "allocation reversal",
    originalAmountMinor: 1_000,
    reversedAmountMinor: 0,
    allocations: [{ amountMinor: 400, reversedAmountMinor: 150 }],
    preservedCreditAmountMinor: 0,
  },
  {
    label: "zero active allocation after reversal",
    originalAmountMinor: 1_000,
    reversedAmountMinor: 0,
    allocations: [{ amountMinor: 400, reversedAmountMinor: 400 }],
    preservedCreditAmountMinor: 0,
  },
  {
    label: "multiple allocations out of order",
    originalAmountMinor: 1_000,
    reversedAmountMinor: 100,
    allocations: [
      { amountMinor: 300, reversedAmountMinor: 100 },
      { amountMinor: 250, reversedAmountMinor: 25 },
    ],
    preservedCreditAmountMinor: 50,
  },
  {
    label: "corrected preserved credit",
    originalAmountMinor: 1_000,
    reversedAmountMinor: 0,
    allocations: [],
    preservedCreditAmountMinor: 100,
    correctedPreservedCreditAmountMinor: 250,
  },
];

describe.skipIf(skipWithoutDatabase())(
  "BR-PAYMENT-009 / TC-OPS-027 — payment_exposure_v1 parity",
  () => {
    let ctx: DbTestContext;
    const now = new Date("2026-08-15T00:00:00.000Z");

    beforeEach(async () => {
      ctx = await createDbTestContext(`payment-exposure-parity-${crypto.randomUUID()}`);
    });

    afterEach(async () => {
      await ctx?.close();
    });

    async function commandReceipt(): Promise<string> {
      const commandId = crypto.randomUUID();
      await ctx.database.db.insert(commandReceipts).values({
        commandId,
        workspaceId: ctx.workspaceId,
        idempotencyKey: `payment-exposure-${commandId}`,
        commandType: "PaymentExposureParity",
        payloadHash: commandId,
        status: "completed",
        result: {},
        recordedAt: now,
      });
      return commandId;
    }

    it("matches the pure kernel across allocation, reversal and correction cases", async () => {
      const paymentIds = cases.map(() => crypto.randomUUID());
      for (const [index, testCase] of cases.entries()) {
        const paymentId = paymentIds[index]!;
        await ctx.database.db.insert(payments).values({
          id: paymentId,
          workspaceId: ctx.workspaceId,
          customerId: ctx.customerId,
          amountMinor: testCase.originalAmountMinor,
          currency: "VND",
          method: "cash",
          cashAccountId: null,
          payerName: null,
          note: testCase.label,
          evidenceReferences: [],
          status: testCase.reversedAmountMinor === 0 ? "recorded" : "partially_reversed",
          reversedAmountMinor: testCase.reversedAmountMinor,
          version: 1,
          transactionTime: now,
          recordedAt: now,
        });

        if (testCase.reversedAmountMinor > 0) {
          await ctx.database.db.insert(paymentReversals).values({
            id: crypto.randomUUID(),
            workspaceId: ctx.workspaceId,
            paymentId,
            amountMinor: testCase.reversedAmountMinor,
            currency: "VND",
            reason: "parity",
            evidenceReferences: ["test://payment-exposure"],
            transactionTime: now,
            recordedAt: now,
          });
        }

        for (const allocation of testCase.allocations) {
          const saleId = crypto.randomUUID();
          await ctx.database.db.insert(sales).values({
            id: saleId,
            workspaceId: ctx.workspaceId,
            customerId: ctx.customerId,
            status: "posted",
            currency: "VND",
            totalAmountMinor: 1_000,
            note: "parity",
            evidenceReferences: [],
            version: 2,
            transactionTime: now,
            recordedAt: now,
            postedAt: now,
            discardedAt: null,
            dueAt: null,
            paymentTermsPolicyVersionId: null,
            paymentTermsSource: null,
            creditLimitPolicyVersionId: null,
            replacesSaleId: null,
          });
          const allocationId = crypto.randomUUID();
          await ctx.database.db.insert(paymentAllocations).values({
            id: allocationId,
            workspaceId: ctx.workspaceId,
            customerId: ctx.customerId,
            paymentId,
            saleId,
            amountMinor: allocation.amountMinor,
            currency: "VND",
            evidenceReferences: ["test://payment-exposure"],
            transactionTime: now,
            recordedAt: now,
            actorId: ctx.actorId,
            commandId: await commandReceipt(),
          });
          if ((allocation.reversedAmountMinor ?? 0) > 0) {
            await ctx.database.db.insert(paymentAllocationReversals).values({
              id: crypto.randomUUID(),
              workspaceId: ctx.workspaceId,
              customerId: ctx.customerId,
              allocationId,
              amountMinor: allocation.reversedAmountMinor!,
              currency: "VND",
              reason: "parity",
              evidenceReferences: ["test://payment-exposure"],
              transactionTime: now,
              recordedAt: now,
              actorId: ctx.actorId,
              commandId: await commandReceipt(),
            });
          }
        }

        const preservedAmount =
          testCase.correctedPreservedCreditAmountMinor ?? testCase.preservedCreditAmountMinor;
        if (testCase.preservedCreditAmountMinor > 0) {
          const observationId = crypto.randomUUID();
          await ctx.database.db.insert(debtObservations).values({
            id: observationId,
            workspaceId: ctx.workspaceId,
            kind: "customer_credit_preserved",
            caseKind: "normal",
            description: "parity",
            participantWording: "parity",
            amountMinor: testCase.preservedCreditAmountMinor,
            amountCurrency: "VND",
            agreedDueAt: null,
            promiseToPayAt: null,
            termCode: null,
            termText: null,
            paymentReference: paymentId,
            allocationProposal: null,
            customerId: ctx.customerId,
            evidenceReferences: ["test://payment-exposure"],
            relatedObservationId: null,
            transactionTime: now,
            recordedAt: now,
            actorId: ctx.actorId,
            commandId: await commandReceipt(),
          });
          if (testCase.correctedPreservedCreditAmountMinor !== undefined) {
            await ctx.database.db.insert(debtObservations).values({
              id: crypto.randomUUID(),
              workspaceId: ctx.workspaceId,
              kind: "customer_credit_preserved",
              caseKind: "correction",
              description: "parity correction",
              participantWording: "parity correction",
              amountMinor: preservedAmount,
              amountCurrency: "VND",
              agreedDueAt: null,
              promiseToPayAt: null,
              termCode: null,
              termText: null,
              paymentReference: paymentId,
              allocationProposal: null,
              customerId: ctx.customerId,
              evidenceReferences: ["test://payment-exposure"],
              relatedObservationId: observationId,
              transactionTime: now,
              recordedAt: now,
              actorId: ctx.actorId,
              commandId: await commandReceipt(),
            });
          }
        }
      }

      const rows = await ctx.database.db.execute<{
        payment_id: string;
        original_amount_minor: string | number;
        reversed_amount_minor: string | number;
        effective_amount_minor: string | number;
        allocated_amount_minor: string | number;
        preserved_credit_amount_minor: string | number;
        available_amount_minor: string | number;
      }>(sql`
      select payment_id, original_amount_minor, reversed_amount_minor,
        effective_amount_minor, allocated_amount_minor,
        preserved_credit_amount_minor, available_amount_minor
      from payment_exposure_v1
      where workspace_id = ${ctx.workspaceId}::uuid
      order by payment_id
    `);
      const byId = new Map(rows.map((row) => [row.payment_id, row]));

      for (const [index, testCase] of cases.entries()) {
        const row = byId.get(paymentIds[index]!);
        expect(row, testCase.label).toBeDefined();
        if (row === undefined) continue;
        const preservedAmount =
          testCase.correctedPreservedCreditAmountMinor ?? testCase.preservedCreditAmountMinor;
        const expected = derivePaymentExposure({
          originalAmountMinor: testCase.originalAmountMinor,
          reversedAmountMinor: testCase.reversedAmountMinor,
          allocations: testCase.allocations.map((allocation) => ({
            amountMinor: allocation.amountMinor,
            reversedAmountMinor: allocation.reversedAmountMinor ?? 0,
          })),
          preservedCreditAmountMinor: preservedAmount,
        });
        expect(expected, testCase.label).not.toBeNull();
        expect(
          {
            originalAmountMinor: Number(row.original_amount_minor),
            reversedAmountMinor: Number(row.reversed_amount_minor),
            effectiveAmountMinor: Number(row.effective_amount_minor),
            allocatedAmountMinor: Number(row.allocated_amount_minor),
            preservedCreditAmountMinor: Number(row.preserved_credit_amount_minor),
            availableAmountMinor: Number(row.available_amount_minor),
          },
          testCase.label,
        ).toEqual(expected);
      }
    });
  },
);
