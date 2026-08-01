import { describe, expect, it } from "vitest";
import type { VoidSaleCommand } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  AFTER_DUE_AT,
  COMMAND_ID,
  DUE_AT,
  IDEMPOTENCY_KEY,
  RECORDED_AT,
  SALE_TOTAL,
  SALE_VOID_ID,
  TRANSACTION_TIME,
  VOIDED_SALE_ID,
  WORKSPACE_ID,
  postedSale,
  saleWithDueDate,
  validDraftSale,
  voidedSale,
} from "@vuarau/test-fixtures";
import { decideVoidSale, saleDueState, saleFinancialState } from "./index.ts";

function voidCommand(overrides: Partial<VoidSaleCommand["payload"]> = {}): VoidSaleCommand {
  return {
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
    payload: {
      saleVoidId: SALE_VOID_ID,
      saleId: postedSale.id,
      reasonCode: "wrong_amount",
      reason: "Ghi nhầm 2 thùng ớt, thực tế 1 thùng",
      ...overrides,
    },
  };
}

describe("BR-SALE-012 / TC-SALE-021", () => {
  it("compensates the posting exactly, to the đồng", () => {
    const result = decideVoidSale({
      command: voidCommand(),
      sale: postedSale,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.accountEntries).toHaveLength(1);
    const entry = result.value.accountEntries[0]!;
    expect(entry.amount.amountMinor).toBe(-SALE_TOTAL.amountMinor);
    expect(entry.sourceType).toBe("sale_void");
    expect(entry.sourceId).toBe(SALE_VOID_ID);

    // The whole point: posting and void sum to zero for this sale.
    expect(postedSale.totalAmount.amountMinor + entry.amount.amountMinor).toBe(0);
  });

  it("takes the amount from the stored sale, never from the caller", () => {
    // There is no amount field on the payload to smuggle a number through, and
    // this asserts the consequence: a void of a 875 000 ₫ sale moves 875 000 ₫
    // and nothing else can be requested (BR-SALE-012, BR-ACCOUNT-010).
    const cheaperSale = {
      ...postedSale,
      totalAmount: { amountMinor: 1_000, currency: "VND" } as const,
    };
    const result = decideVoidSale({
      command: voidCommand(),
      sale: cheaperSale,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.accountEntries[0]!.amount.amountMinor).toBe(-1_000);
    expect(result.value.voidRecord.amount.amountMinor).toBe(1_000);
  });

  it("leaves the sale itself untouched — including its version", () => {
    const result = decideVoidSale({
      command: voidCommand(),
      sale: postedSale,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Everything except the void record is byte-for-byte what it was. Compared
    // wholesale rather than field by field, so a field added later is covered
    // without anybody remembering to extend this assertion.
    const { voidRecord, ...afterVoid } = result.value.aggregate;
    const { voidRecord: _before, ...beforeVoid } = postedSale;
    expect(afterVoid).toEqual(beforeVoid);

    // Named individually as well, because these three are the ones that would
    // hurt: a bumped version breaks optimistic concurrency for every later
    // reader, and a changed total or line set rewrites history (BR-SALE-008).
    expect(result.value.aggregate.version).toBe(postedSale.version);
    expect(result.value.aggregate.status).toBe("posted");
    expect(result.value.aggregate.totalAmount).toEqual(postedSale.totalAmount);
    expect(voidRecord).not.toBeNull();
  });

  it("records the reason code and the trimmed explanation on the void", () => {
    const result = decideVoidSale({
      command: voidCommand({ reason: "  Hàng trả lại  ", reasonCode: "goods_returned" }),
      sale: postedSale,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.voidRecord.reasonCode).toBe("goods_returned");
    expect(result.value.voidRecord.reason).toBe("Hàng trả lại");
    expect(result.value.audit.action).toBe("sale.voided");
    expect(result.value.audit.reason).toBe("Hàng trả lại");
  });

  it("BR-SALE-012 / BR-SALE-014 / TC-SALE-030 — refuses a goods-returned full void while physical fulfilment remains active", () => {
    const result = decideVoidSale({
      command: voidCommand({ reason: "Khách chỉ trả một phần", reasonCode: "goods_returned" }),
      sale: postedSale,
      hasActiveNetFulfilment: true,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SALE_GOODS_RETURN_INCOMPLETE");
  });
});

describe("BR-SALE-013 / TC-SALE-023", () => {
  it("refuses a sale that already carries a void record", () => {
    const result = decideVoidSale({
      command: voidCommand({ saleId: VOIDED_SALE_ID }),
      sale: voidedSale,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SALE_ALREADY_VOIDED");
    expect(result.error.details).toMatchObject({ saleId: VOIDED_SALE_ID });
  });

  it("produces no account effect when it refuses", () => {
    const result = decideVoidSale({
      command: voidCommand({ saleId: VOIDED_SALE_ID }),
      sale: voidedSale,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    // A refusal that still described an effect would be worse than a crash: the
    // caller would credit the customer a second time for one mistake.
    expect(result.ok).toBe(false);
  });
});

describe("BR-SALE-015 / TC-SALE-025", () => {
  it("refuses to void a draft, and says so specifically", () => {
    const result = decideVoidSale({
      command: voidCommand({ saleId: validDraftSale.id }),
      sale: validDraftSale,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Not SALE_ALREADY_VOIDED and not a generic refusal: the remedy is to discard
    // the draft, and the code has to point there (BR-SALE-018).
    expect(result.error.code).toBe("SALE_NOT_POSTED");
    expect(result.error.details).toMatchObject({ status: "draft" });
  });

  it("checks the status before the void record, so a draft never reports as voided", () => {
    const draftWithStrayVoid = { ...validDraftSale, voidRecord: voidedSale.voidRecord };
    const result = decideVoidSale({
      command: voidCommand({ saleId: validDraftSale.id }),
      sale: draftWithStrayVoid,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SALE_NOT_POSTED");
  });
});

describe("BR-SALE-014 / TC-SALE-026", () => {
  it("refuses a blank explanation", () => {
    const result = decideVoidSale({
      command: voidCommand({ reason: "" }),
      sale: postedSale,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SALE_VOID_REASON_REQUIRED");
  });

  it("refuses an explanation that is only whitespace", () => {
    // The one a UI produces: a required field the user tabbed through.
    const result = decideVoidSale({
      command: voidCommand({ reason: "   \n\t " }),
      sale: postedSale,
      hasActiveNetFulfilment: false,
      recordedAt: RECORDED_AT,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SALE_VOID_REASON_REQUIRED");
  });
});

describe("BR-SALE-013 / TC-SALE-024 — derived financial state", () => {
  it("reads a posted sale with no void as active", () => {
    expect(saleFinancialState(postedSale)).toBe("active");
  });

  it("reads a posted sale with a void as voided", () => {
    expect(saleFinancialState(voidedSale)).toBe("voided");
  });

  it("gives a draft no financial state at all", () => {
    // A draft has no financial effect, so it has nothing to have a state about.
    expect(saleFinancialState(validDraftSale)).toBeNull();
  });
});

describe("BR-SALE-017 / TC-SALE-018", () => {
  it("never calls a sale without a due date overdue, however old it gets", () => {
    expect(postedSale.dueAt).toBeNull();

    // Read far past every other instant in the fixtures. Age is not lateness.
    expect(saleDueState(postedSale, AFTER_DUE_AT)).toBe("no_due_date");
    expect(saleDueState(postedSale, "2099-01-01T00:00:00.000Z" as typeof AFTER_DUE_AT)).toBe(
      "no_due_date",
    );
  });

  it("calls a sale with an unreached due date due, not overdue", () => {
    expect(saleWithDueDate.dueAt).toBe(DUE_AT);
    expect(saleDueState(saleWithDueDate, TRANSACTION_TIME)).toBe("due");
  });

  it("calls a sale overdue only once its agreed date has passed", () => {
    expect(saleDueState(saleWithDueDate, AFTER_DUE_AT)).toBe("overdue");
  });
});
