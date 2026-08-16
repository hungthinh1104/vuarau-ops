import { describe, expect, it } from "vitest";
import type {
  CustomerPaymentCreditPreservationDto,
  PreserveCustomerPaymentAsCreditCommand,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  CUSTOMER_ID,
  IDEMPOTENCY_KEY,
  LATER_RECORDED_AT,
  LATER_TRANSACTION_TIME,
  PAYMENT_ID,
  WORKSPACE_ID,
  recordedPayment,
  vnd,
} from "@vuarau/test-fixtures";
import {
  activeCustomerPaymentCreditAmount,
  decidePreserveCustomerPaymentAsCredit,
} from "./customer-credit-preservation.ts";

const firstId = crypto.randomUUID() as CustomerPaymentCreditPreservationDto["id"];
const secondId = crypto.randomUUID() as CustomerPaymentCreditPreservationDto["id"];

function command(
  overrides: Partial<PreserveCustomerPaymentAsCreditCommand["payload"]> = {},
): PreserveCustomerPaymentAsCreditCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: LATER_TRANSACTION_TIME,
    expectedVersion: recordedPayment.version,
    payload: {
      preservationId: secondId,
      paymentId: PAYMENT_ID,
      amount: vnd(250_000),
      caseKind: "preservation",
      relatedPreservationId: null,
      reason: "Khách để lại cho lần mua sau.",
      evidenceReferences: ["receipt://credit/001"],
      ...overrides,
    },
  };
}

function preservation(
  overrides: Partial<CustomerPaymentCreditPreservationDto> = {},
): CustomerPaymentCreditPreservationDto {
  return {
    id: firstId,
    workspaceId: WORKSPACE_ID,
    paymentId: PAYMENT_ID,
    customerId: CUSTOMER_ID,
    amount: vnd(100_000),
    caseKind: "preservation",
    relatedPreservationId: null,
    reason: "Ban đầu",
    evidenceReferences: [],
    transactionTime: LATER_TRANSACTION_TIME,
    recordedAt: LATER_RECORDED_AT,
    actorId: ACTOR_ID,
    commandId: COMMAND_ID,
    ...overrides,
  };
}

describe("BR-PAYMENT-009 / TC-PAYMENT-014 — customer payment credit preservation", () => {
  it("uses only correction-chain tips in the active exposure", () => {
    const first = preservation();
    const correction = preservation({
      id: secondId,
      amount: vnd(250_000),
      caseKind: "correction",
      relatedPreservationId: first.id,
    });

    expect(activeCustomerPaymentCreditAmount([first, correction])).toBe(250_000);
  });

  it("records a financial fact without creating a ledger effect", () => {
    const result = decidePreserveCustomerPaymentAsCredit(
      command(),
      {
        payment: recordedPayment,
        correctionTarget: null,
        correctionTargetAlreadyCorrected: false,
        availableAmountMinor: 500_000,
      },
      LATER_RECORDED_AT,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        preservation: { paymentId: PAYMENT_ID, amount: vnd(250_000) },
        audit: { after: { ledgerEffect: "none" } },
      },
    });
  });

  it("rejects a second correction of the same current fact", () => {
    const target = preservation();
    const result = decidePreserveCustomerPaymentAsCredit(
      command({
        caseKind: "correction",
        relatedPreservationId: target.id,
      }),
      {
        payment: recordedPayment,
        correctionTarget: target,
        correctionTargetAlreadyCorrected: true,
        availableAmountMinor: 500_000,
      },
      LATER_RECORDED_AT,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CUSTOMER_CREDIT_PRESERVATION_TARGET_ALREADY_CORRECTED" },
    });
  });
});
