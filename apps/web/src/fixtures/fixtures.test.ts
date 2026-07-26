import { describe, expect, it } from "vitest";
import {
  accountTimelineEntryDtoSchema,
  customerAccountBalanceDtoSchema,
  customerDetailDtoSchema,
  customerSummaryDtoSchema,
  domainErrorSchema,
  paymentDtoSchema,
  paymentSummaryDtoSchema,
  saleDtoSchema,
  saleSummaryDtoSchema,
  sessionDtoSchema,
} from "@vuarau/domain-contracts";
import {
  accountantSession,
  accountTimeline,
  balanceAdjustDenied,
  balanceCustomerCredit,
  balanceReceivable,
  balanceSettled,
  customerDetail,
  customerPage,
  ownerSession,
  paymentPage,
  paymentPartiallyReversed,
  paymentRecorded,
  paymentReversed,
  salePage,
  salesSession,
  saleDiscarded,
  saleDraft,
  salePosted,
  saleReplacement,
  saleVoided,
  warehouseSession,
  allRejections,
} from "./index.ts";

/**
 * TC-WEB-001 — every fixture parses through the schema the server validates with.
 *
 * This is what stops the design system from drifting away from the API without
 * anybody noticing. A DTO that gains a required field breaks here, in one place,
 * rather than in whichever screen renders it first — and a story built on a stale
 * shape is a story that proves nothing.
 *
 * `.parse`, not `.safeParse`: a fixture that fails should say which field.
 */
describe("TC-WEB-001 — browser fixtures satisfy the published contracts", () => {
  it("sessions", () => {
    for (const session of [ownerSession, accountantSession, salesSession, warehouseSession]) {
      expect(() => sessionDtoSchema.parse(session)).not.toThrow();
    }
  });

  it("customers", () => {
    for (const customer of customerPage) {
      expect(() => customerSummaryDtoSchema.parse(customer)).not.toThrow();
    }
    expect(() => customerDetailDtoSchema.parse(customerDetail)).not.toThrow();
  });

  it("sales", () => {
    for (const sale of [saleDraft, salePosted, saleDiscarded, saleVoided, saleReplacement]) {
      expect(() => saleDtoSchema.parse(sale)).not.toThrow();
    }
    for (const summary of salePage) {
      expect(() => saleSummaryDtoSchema.parse(summary)).not.toThrow();
    }
  });

  it("payments", () => {
    for (const payment of [paymentRecorded, paymentPartiallyReversed, paymentReversed]) {
      expect(() => paymentDtoSchema.parse(payment)).not.toThrow();
    }
    for (const summary of paymentPage) {
      expect(() => paymentSummaryDtoSchema.parse(summary)).not.toThrow();
    }
  });

  it("account balances and timeline", () => {
    for (const balance of [
      balanceReceivable,
      balanceSettled,
      balanceCustomerCredit,
      balanceAdjustDenied,
    ]) {
      expect(() => customerAccountBalanceDtoSchema.parse(balance)).not.toThrow();
    }
    for (const entry of accountTimeline) {
      expect(() => accountTimelineEntryDtoSchema.parse(entry)).not.toThrow();
    }
  });

  it("rejections", () => {
    for (const rejection of allRejections) {
      expect(() => domainErrorSchema.parse(rejection)).not.toThrow();
    }
  });
});

describe("TC-WEB-002 — fixtures encode the facts the components depend on", () => {
  /**
   * The classification and the sign have to agree, or a story would "prove" a
   * component renders credit correctly while feeding it a positive balance.
   */
  it("a customer_credit balance is negative and a receivable is positive", () => {
    expect(balanceCustomerCredit.classification).toBe("customer_credit");
    expect(balanceCustomerCredit.balance.amountMinor).toBeLessThan(0);

    expect(balanceReceivable.classification).toBe("receivable");
    expect(balanceReceivable.balance.amountMinor).toBeGreaterThan(0);

    expect(balanceSettled.classification).toBe("settled");
    expect(balanceSettled.balance.amountMinor).toBe(0);
  });

  /** BR-CUSTOMER-003: deactivation settles nothing, so the fixture must still owe. */
  it("the inactive customer still carries a balance", () => {
    const inactive = customerPage.find((customer) => !customer.isActive);
    expect(inactive).toBeDefined();
    expect(inactive!.balance.amountMinor).toBeGreaterThan(0);
  });

  /** The permission table is the server's; a hand-written list would let a bad story pass. */
  it("the sales session may post but may not void", () => {
    expect(salesSession.permissions).toContain("sale.post");
    expect(salesSession.permissions).not.toContain("sale.void");
    expect(ownerSession.permissions).toContain("sale.void");
  });

  it("the partially reversed payment carries all three amounts, consistently", () => {
    expect(paymentPartiallyReversed.amount.amountMinor).toBe(500_000);
    expect(paymentPartiallyReversed.reversedAmount.amountMinor).toBe(200_000);
    expect(paymentPartiallyReversed.remainingReversibleAmount.amountMinor).toBe(300_000);
  });

  /**
   * The compensating pair. Both entries stand; the running balance is followable
   * line by line because neither was tidied away (BR-ACCOUNT-005).
   */
  it("the timeline keeps both halves of a void", () => {
    const posting = accountTimeline.find((entry) => entry.source.type === "sale_posting");
    const voided = accountTimeline.find((entry) => entry.source.type === "sale_void");

    expect(posting).toBeDefined();
    expect(voided).toBeDefined();
    expect(voided!.amount.amountMinor).toBe(-posting!.amount.amountMinor);
    expect(voided!.reversalOfEntryId).toBe(posting!.id);
  });
});
